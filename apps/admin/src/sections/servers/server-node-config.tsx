"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Switch } from "@workspace/ui/components/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { Icon } from "@workspace/ui/composed/icon";
import {
  getServerNodeConfig,
  postServerNodeConfigUpdate as updateServerNodeConfig,
} from "@workspace/ui/services/node-config";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  isDefiniteRejection,
  safeBackendError,
  serverWriteMatches,
} from "./node-config-write";
import {
  isRoutingConflict,
  isRoutingRevision,
  routingContentFromProjection,
  validateNodeRouting,
} from "./node-routing";
import { NodeRoutingEditor } from "./node-routing-editor";
import { RoutingDNS } from "./routing-dns";
import { RoutingConflict, RoutingStatus } from "./routing-status";

export default function ServerNodeConfig({
  server,
  triggerLabel,
  triggerDisabled = false,
}: {
  server: API.Server;
  triggerLabel?: string;
  triggerDisabled?: boolean;
}) {
  const { t } = useTranslation("servers");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("routing");
  const [saving, setSaving] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [routing, setRouting] = useState<API.NodeRouting>();
  const [routingDirty, setRoutingDirty] = useState(false);
  const [inheritRouting, setInheritRouting] = useState(true);
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [snapshot, setSnapshot] = useState<{
    serverId: number;
    config: API.GetServerNodeConfigResponse;
  }>();
  const cfgResp =
    snapshot?.serverId === server.id ? snapshot.config : undefined;
  const holdDraft = useRef(false);

  const {
    data: querySnapshot,
    refetch,
    isError,
    isLoading,
  } = useQuery({
    queryKey: ["getServerNodeConfig", server.id],
    queryFn: async () => {
      const { data } = await getServerNodeConfig({ server_id: server.id });
      if (!data.data) throw new Error("Missing server node configuration");
      return { serverId: server.id, config: data.data };
    },
    enabled: open,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const queryConfig =
    querySnapshot?.serverId === server.id ? querySnapshot.config : undefined;

  const resetConfig = useCallback(
    (config: API.GetServerNodeConfigResponse) => {
      setSnapshot({ serverId: server.id, config });
      setRouting(routingContentFromProjection(config.effective.routing));
      setInheritRouting(config.override.inherit_routing);
      setRoutingDirty(false);
    },
    [server.id]
  );
  useEffect(() => {
    holdDraft.current = false;
    setOpen(false);
    setConflict(false);
    setUncertain(false);
  }, [server.id]);
  useEffect(() => {
    if (queryConfig && !holdDraft.current) resetConfig(queryConfig);
  }, [queryConfig, resetConfig]);

  const inheritDirty = cfgResp
    ? inheritRouting !== cfgResp.override.inherit_routing
    : false;
  const routingChanged = inheritDirty || (!inheritRouting && routingDirty);
  const globalPolicy = routingContentFromProjection(cfgResp?.global.routing);
  const validConfig = Boolean(
    cfgResp &&
      routing &&
      globalPolicy &&
      isRoutingRevision(cfgResp.override.routing_revision) &&
      isRoutingRevision(cfgResp.global.routing_revision) &&
      cfgResp.global.routing_revision > 0 &&
      cfgResp.global.routing_mode === "inherited" &&
      cfgResp.effective.routing_mode ===
        (cfgResp.override.inherit_routing ? "inherited" : "local") &&
      cfgResp.override.inherit_routing === (cfgResp.override.routing === null)
  );

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && (saving || refreshingStatus)) return;
    if (!((nextOpen || saveError ) || conflict)) holdDraft.current = false;
    if (nextOpen && queryConfig && !conflict && !holdDraft.current) {
      holdDraft.current = false;
      resetConfig(queryConfig);
    }
    setOpen(nextOpen);
  }

  async function refreshStatus() {
    if (saving || refreshingStatus || conflict || routingChanged) return;
    setRefreshingStatus(true);
    holdDraft.current = true;
    try {
      const result = await refetch();
      const current =
        result.data?.serverId === server.id ? result.data.config : undefined;
      if (current && !result.error) {
        holdDraft.current = false;
        resetConfig(current);
      } else {
        toast.error(
          t(
            "ordered_routing.status_refresh_failed",
            "Unable to refresh routing status."
          )
        );
      }
    } catch {
      toast.error(
        t(
          "ordered_routing.status_refresh_failed",
          "Unable to refresh routing status."
        )
      );
    } finally {
      setRefreshingStatus(false);
    }
  }

  async function onSubmit() {
    if (
      conflict ||
      !validConfig ||
      !routingChanged ||
      (!inheritRouting && (!routing || validateNodeRouting(routing).length))
    )
      return;
    const payload: API.UpdateServerNodeConfigRequest = {
      server_id: server.id,
      routing_revision: cfgResp!.override.routing_revision,
    };
    if (inheritRouting) payload.inherit_routing = true;
    else payload.routing = routing;
    const revision = cfgResp!.override.routing_revision;
    holdDraft.current = true;
    setSaveError(undefined);
    setSaving(true);
    async function readBack(recovered: boolean) {
      try {
        const result = await refetch();
        const current =
          result.data?.serverId === server.id ? result.data.config : undefined;
        if (
          !result.error &&
          current &&
          serverWriteMatches(payload, current, revision)
        ) {
          toast.success(
            recovered
              ? t(
                  "ordered_routing.readback_confirmed",
                  "The server reported an error, but readback confirms the requested settings. Node application is not yet confirmed."
                )
              : t(
                  "ordered_routing.saved",
                  "Saved in the panel; node application is not yet confirmed."
                )
          );
          holdDraft.current = false;
          resetConfig(current);
          return;
        }
      } catch {
        /* Readback is not authoritative if it fails. */
      }
      setUncertain(true);
      setConflict(true);
      toast.error(
        t(
          "ordered_routing.readback_mismatch",
          "The request may have been saved, but readback did not confirm it. Refresh and verify the current policy before editing again."
        )
      );
    }
    try {
      await updateServerNodeConfig(payload, { skipErrorHandler: true });
      await readBack(false);
    } catch (error) {
      const message = safeBackendError(error);
      if (message || isDefiniteRejection(error))
        setSaveError(
          message ||
            t(
              "ordered_routing.save_error",
              "Save failed. Refresh to verify the current state before retrying."
            )
        );
      if (isRoutingConflict(error)) setConflict(true);
      else if (isDefiniteRejection(error))
        toast.error(
          message ||
            t(
              "ordered_routing.save_error",
              "Save failed. Refresh to verify the current state before retrying."
            )
        );
      else await readBack(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <SheetTrigger asChild>
        <Button disabled={triggerDisabled} variant="outline">
          <Icon className="mr-2 h-4 w-4" icon="mdi:tune-variant" />
          {triggerLabel || t("server_node_config.trigger", "Node Config")}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-full gap-0 sm:max-w-4xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>
            {t("server_node_config.title", "Node configuration overrides")}
          </SheetTitle>
          <SheetDescription>
            {t(
              "server_node_config.description",
              "Choose which global settings this server inherits and which ones it overrides."
            )}
          </SheetDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge>{server.name}</Badge>
            <Badge variant="outline">#{server.id}</Badge>
            {server.address ? (
              <Badge variant="secondary">{server.address}</Badge>
            ) : null}
          </div>
        </SheetHeader>

        <ScrollArea className="[&_[data-slot=scroll-area-viewport]>div]:!block min-h-0 min-w-0 flex-1">
          <div className="px-4 pb-4">
            {isLoading && !cfgResp ? (
              <div className="space-y-4 pt-4" role="status">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-40 w-full" />
                <span className="sr-only">
                  {t("server_node_config.loading", "Loading configuration")}
                </span>
              </div>
            ) : null}
            {isError || !(isLoading || cfgResp) ? (
              <Alert className="mt-4" variant="destructive">
                <Icon icon="mdi:alert-circle-outline" />
                <AlertTitle>
                  {t(
                    "server_node_config.loadErrorTitle",
                    "Unable to load configuration"
                  )}
                </AlertTitle>
                <AlertDescription>
                  <p>
                    {t(
                      "server_node_config.loadError",
                      "Nothing can be changed until the current server configuration is loaded."
                    )}
                  </p>
                  <Button onClick={() => refetch()} size="sm" variant="outline">
                    <Icon icon="mdi:refresh" />
                    {t("server_node_config.retry", "Retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {cfgResp ? (
              <Tabs className="mt-4" onValueChange={setTab} value={tab}>
                <TabsList className="flex h-auto w-full flex-wrap">
                  <TabsTrigger className="gap-2" value="dns">
                    <span>
                      {t("server_config.tabs.dns", "DNS Configuration")}
                    </span>
                    <Badge
                      className="px-1.5 py-0"
                      variant={inheritRouting ? "secondary" : "outline"}
                    >
                      {inheritRouting
                        ? t("server_node_config.modeInherited", "Inherited")
                        : t("server_node_config.modeCustom", "Custom")}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="routing">
                    {t("ordered_routing.tab", "Ordered routing")}
                  </TabsTrigger>
                </TabsList>
                {saveError ? (
                  <p
                    className="break-words text-destructive text-sm"
                    role="alert"
                  >
                    {saveError}
                  </p>
                ) : null}
                {conflict ? (
                  <RoutingConflict
                    onRefresh={async () => {
                      const result = await refetch();
                      const current =
                        result.data?.serverId === server.id
                          ? result.data.config
                          : undefined;
                      if (current && !result.error) {
                        holdDraft.current = false;
                        resetConfig(current);
                        setConflict(false);
                        setUncertain(false);
                        setSaveError(undefined);
                      }
                    }}
                    uncertain={uncertain}
                  />
                ) : null}

                <form
                  className="space-y-4 pt-4"
                  id="server-node-config-form"
                  onChangeCapture={() => {
                    holdDraft.current = true;
                  }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSubmit();
                  }}
                >
                  <fieldset disabled={saving || refreshingStatus}>
                    <TabsContent className="space-y-4" value="dns">
                      {validConfig && routing && globalPolicy && (
                        <RoutingDNS
                          value={inheritRouting ? globalPolicy : routing}
                          readOnly={inheritRouting}
                          onChange={(next) => {
                            holdDraft.current = true;
                            setRouting(next);
                            setRoutingDirty(true);
                          }}
                        />
                      )}
                    </TabsContent>

                    <TabsContent className="space-y-4" value="routing">
                      <RoutingStatus
                        onRefresh={refreshStatus}
                        refreshDisabled={
                          saving ||
                          refreshingStatus ||
                          conflict ||
                          routingChanged
                        }
                        status={cfgResp.routing_status}
                      />
                      <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
                        <div className="space-y-1">
                          <p className="font-medium text-sm">
                            {t(
                              "ordered_routing.use_global",
                              "Use global routing"
                            )}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {inheritRouting
                              ? t(
                                  "ordered_routing.inherited_v1",
                                  "Inherited global ordered routing"
                                )
                              : t(
                                  "ordered_routing.local_v1",
                                  "Complete local ordered routing override"
                                )}
                          </p>
                        </div>
                        <Switch
                          aria-label={t(
                            "ordered_routing.use_global",
                            "Use global routing"
                          )}
                          checked={inheritRouting}
                          disabled={!validConfig}
                          onCheckedChange={(next) => {
                            holdDraft.current = true;
                            setInheritRouting(next);
                          }}
                        />
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {inheritRouting
                          ? t(
                              "ordered_routing.inherit_desc",
                              "This server follows the current global routing policy. Saving inheritance removes its local override."
                            )
                          : t(
                              "ordered_routing.override_desc",
                              "This is a complete local copy. Future global routing changes will not propagate to this server."
                            )}
                      </p>
                      {!inheritRouting && cfgResp.override.inherit_routing ? (
                        <p className="text-muted-foreground text-xs">
                          {t(
                            "ordered_routing.copy_source",
                            "Draft copied from global revision {{revision}}; later global changes are not merged automatically.",
                            { revision: cfgResp.global.routing_revision }
                          )}
                        </p>
                      ) : null}
                      <p className="text-muted-foreground text-xs">
                        {t(
                          "ordered_routing.offline_save",
                          "Routing can be saved while the node is offline. Older nodes receive HTTP 426; only a matching node receipt confirms application."
                        )}
                      </p>
                      {validConfig ? null : (
                        <p className="text-destructive" role="alert">
                          {t(
                            "ordered_routing.unsupported_policy",
                            "This routing policy is invalid or uses an unsupported version. It cannot be edited."
                          )}
                        </p>
                      )}
                      {validConfig && routing && globalPolicy ? (
                        <NodeRoutingEditor
                          onChange={(next) => {
                            holdDraft.current = true;
                            setRouting(next);
                            setRoutingDirty(true);
                          }}
                          onDraftStart={() => {
                            holdDraft.current = true;
                          }}
                          readOnly={inheritRouting}
                          value={inheritRouting ? globalPolicy : routing}
                        />
                      ) : null}
                    </TabsContent>
                  </fieldset>
                </form>
              </Tabs>
            ) : null}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row items-center justify-between gap-3 border-t">
          <p className="text-muted-foreground text-xs">
            {routingChanged
              ? t("server_node_config.unsavedChanges", "Unsaved changes")
              : t("server_node_config.noChanges", "No unsaved changes")}
          </p>
          <div className="flex gap-2">
            <Button
              disabled={saving || refreshingStatus}
              onClick={() => handleOpenChange(false)}
              variant="outline"
            >
              {t("actions.cancel", "Cancel")}
            </Button>
            <Button
              disabled={
                saving ||
                refreshingStatus ||
                conflict ||
                isLoading ||
                isError ||
                !validConfig ||
                !routingChanged ||
                (routingChanged &&
                  !inheritRouting &&
                  (!routing || validateNodeRouting(routing).length > 0))
              }
              form="server-node-config-form"
              type="submit"
            >
              <Icon
                className={saving ? "animate-spin" : "hidden"}
                icon="mdi:loading"
              />
              {t("actions.save", "Save")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
