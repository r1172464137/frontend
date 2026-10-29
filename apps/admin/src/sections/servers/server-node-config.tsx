"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
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
import { cn } from "@workspace/ui/lib/utils";
import {
  getServerNodeConfig,
  postServerNodeConfigUpdate as updateServerNodeConfig,
} from "@workspace/ui/services/node-config";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Control, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { dnsForWrite } from "./dns-config";
import { DNSEditor } from "./dns-editor";
import {
  dnsIsValid,
  editableDNS,
  isDefiniteRejection,
  safeBackendError,
  serverWriteMatches,
} from "./node-config-write";
import {
  isRoutingConflict,
  isRoutingRevision,
  routingContentFromProjection,
  routingIdentityFromProjection,
  validateNodeRouting,
} from "./node-routing";
import { NodeRoutingEditor } from "./node-routing-editor";
import { RoutingConflict, RoutingStatus } from "./routing-status";

const dnsConfigSchema = z.object({
  proto: z.string(),
  address: z.string(),
  server_name: z.string().optional(),
  domains: z.array(z.string()),
});

const serverNodeConfigSchema = z.object({
  inherit_ip_strategy: z.boolean(),
  ip_strategy: z.string(),
  inherit_dns: z.boolean(),
  dns: z.array(dnsConfigSchema),
});

type ServerNodeConfigFormData = z.infer<typeof serverNodeConfigSchema>;
type IPStrategy = ServerNodeConfigFormData["ip_strategy"];

function normalizeIPStrategy(value?: string): IPStrategy {
  return value ?? "";
}

function ToggleField({
  control,
  name,
  label,
  description,
  inheritedText,
  customText,
  onDraftStart,
}: {
  control: Control<ServerNodeConfigFormData>;
  name: "inherit_ip_strategy" | "inherit_dns";
  label: string;
  description: string;
  inheritedText: string;
  customText: string;
  onDraftStart: () => void;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <div
          className={cn(
            "flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors",
            field.value ? "bg-muted/30" : "border-primary/30 bg-primary/5"
          )}
        >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-sm">{label}</span>
              <Badge variant={field.value ? "secondary" : "outline"}>
                {field.value ? inheritedText : customText}
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">{description}</p>
          </div>
          <Switch
            aria-label={label}
            checked={field.value}
            onCheckedChange={(value) => {
              onDraftStart();
              field.onChange(value);
            }}
          />
        </div>
      )}
    />
  );
}

function InheritedPreview({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/20 p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
        <Icon
          className="size-4 text-muted-foreground"
          icon="mdi:source-branch-sync"
        />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
    </div>
  );
}

function getFormValues(
  config: API.GetServerNodeConfigResponse
): ServerNodeConfigFormData {
  const { effective, override } = config;
  return {
    inherit_ip_strategy: override.inherit_ip_strategy,
    ip_strategy: normalizeIPStrategy(
      override.inherit_ip_strategy
        ? effective.ip_strategy
        : override.ip_strategy
    ),
    inherit_dns: override.inherit_dns,
    dns: editableDNS(override.inherit_dns ? effective.dns : override.dns),
  };
}

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
  const [tab, setTab] = useState("dns");
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

  const form = useForm<ServerNodeConfigFormData>({
    resolver: zodResolver(serverNodeConfigSchema),
    defaultValues: {
      inherit_ip_strategy: true,
      ip_strategy: "prefer_ipv4",
      inherit_dns: true,
      dns: [],
    },
  });

  const resetConfig = useCallback(
    (config: API.GetServerNodeConfigResponse) => {
      setSnapshot({ serverId: server.id, config });
      setRouting(routingContentFromProjection(config.effective.routing));
      setInheritRouting(config.override.inherit_routing);
      setRoutingDirty(false);
      form.reset(getFormValues(config));
    },
    [form, server.id]
  );
  useEffect(() => {
    holdDraft.current = false;
    setOpen(false);
    setConflict(false);
    setUncertain(false);
  }, [server.id]);
  const { isDirty, dirtyFields } = form.formState;
  useEffect(() => {
    if (isDirty) holdDraft.current = true;
  }, [isDirty]);
  useEffect(() => {
    if (queryConfig && !holdDraft.current) resetConfig(queryConfig);
  }, [queryConfig, resetConfig]);

  const inheritIPStrategy = form.watch("inherit_ip_strategy");
  const inheritDNS = form.watch("inherit_dns");
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
      cfgResp.global.routing_mode === "global-v1" &&
      cfgResp.effective.routing_mode ===
        (cfgResp.override.inherit_routing ? "global-v1" : "local-v1") &&
      cfgResp.override.inherit_routing === (cfgResp.override.routing === null)
  );

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && (saving || refreshingStatus)) return;
    if (nextOpen && queryConfig && !conflict) {
      holdDraft.current = false;
      resetConfig(queryConfig);
    }
    setOpen(nextOpen);
  }

  async function refreshStatus() {
    if (saving || refreshingStatus || conflict || routingChanged || isDirty)
      return;
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

  function getIPStrategyLabel(value?: string) {
    if (value === "prefer_ipv6")
      return t("server_config.fields.ip_strategy_ipv6", "Prefer IPv6");
    if (value === "prefer_ipv4")
      return t("server_config.fields.ip_strategy_ipv4", "Prefer IPv4");
    return value || t("ordered_routing.ip_default", "Node default");
  }

  async function onSubmit(values: ServerNodeConfigFormData) {
    if (
      conflict ||
      !validConfig ||
      (routingChanged &&
        !inheritRouting &&
        (!routing || validateNodeRouting(routing).length))
    )
      return;
    const payload: API.UpdateServerNodeConfigRequest = {
      server_id: server.id,
      routing_revision: cfgResp!.override.routing_revision,
    };
    if (dirtyFields.inherit_ip_strategy || dirtyFields.ip_strategy) {
      payload.inherit_ip_strategy = values.inherit_ip_strategy;
      if (!values.inherit_ip_strategy) payload.ip_strategy = values.ip_strategy;
    }
    if (dirtyFields.inherit_dns || dirtyFields.dns) {
      payload.inherit_dns = values.inherit_dns;
      if (!values.inherit_dns) {
        if (!dnsIsValid(values.dns)) {
          setTab("dns");
          form.setError("dns", {
            message: t(
              "ordered_routing.dns_required",
              "Check the UDP resolver addresses and domain rules before saving."
            ),
          });
          return;
        }
        payload.dns = dnsForWrite(values.dns);
      }
    }
    if (routingChanged) {
      if (inheritRouting) payload.inherit_routing = true;
      else payload.routing = routing;
    }
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
      if (message) setSaveError(message);
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
                      variant={
                        inheritIPStrategy && inheritDNS
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {inheritIPStrategy && inheritDNS
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

                <Form {...form}>
                  <form
                    className="space-y-4 pt-4"
                    id="server-node-config-form"
                    onChangeCapture={() => {
                      holdDraft.current = true;
                    }}
                    onSubmit={form.handleSubmit(onSubmit, () => setTab("dns"))}
                  >
                    <fieldset disabled={saving || refreshingStatus}>
                      <TabsContent className="space-y-4" value="dns">
                        <section className="space-y-3">
                          <ToggleField
                            control={form.control}
                            customText={t(
                              "server_node_config.modeCustom",
                              "Custom"
                            )}
                            description={t(
                              "server_node_config.inherit_ip_strategy_desc",
                              "Turn this off to choose a different IP preference for this server."
                            )}
                            inheritedText={t(
                              "server_node_config.modeInherited",
                              "Inherited"
                            )}
                            label={t(
                              "server_node_config.inherit_ip_strategy",
                              "Use global IP strategy"
                            )}
                            name="inherit_ip_strategy"
                            onDraftStart={() => {
                              holdDraft.current = true;
                            }}
                          />
                          {inheritIPStrategy ? (
                            <InheritedPreview
                              description={t(
                                "server_node_config.global_ip_strategy_summary",
                                "Current global value: {{value}}",
                                {
                                  value: getIPStrategyLabel(
                                    cfgResp.global.ip_strategy
                                  ),
                                }
                              )}
                              title={t(
                                "server_node_config.globalPreview",
                                "Using global configuration"
                              )}
                            />
                          ) : (
                            <FormField
                              control={form.control}
                              name="ip_strategy"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    {t(
                                      "server_config.fields.ip_strategy",
                                      "IP Strategy"
                                    )}
                                  </FormLabel>
                                  <Select
                                    onValueChange={(value) => {
                                      holdDraft.current = true;
                                      field.onChange(
                                        value === "__node_default__"
                                          ? ""
                                          : value
                                      );
                                    }}
                                    value={
                                      field.value === ""
                                        ? "__node_default__"
                                        : field.value
                                    }
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue
                                          placeholder={t(
                                            "server_config.fields.ip_strategy_placeholder",
                                            "Select IP strategy"
                                          )}
                                        />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="__node_default__">
                                        {t(
                                          "ordered_routing.ip_default",
                                          "Node default"
                                        )}
                                      </SelectItem>
                                      <SelectItem value="prefer_ipv4">
                                        {t(
                                          "server_config.fields.ip_strategy_ipv4",
                                          "Prefer IPv4"
                                        )}
                                      </SelectItem>
                                      <SelectItem value="prefer_ipv6">
                                        {t(
                                          "server_config.fields.ip_strategy_ipv6",
                                          "Prefer IPv6"
                                        )}
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                        </section>

                        <section className="space-y-3 border-t pt-4">
                          <ToggleField
                            control={form.control}
                            customText={t(
                              "server_node_config.modeCustom",
                              "Custom"
                            )}
                            description={t(
                              "server_node_config.inherit_dns_desc",
                              "Turn this off to maintain a DNS list only for this server."
                            )}
                            inheritedText={t(
                              "server_node_config.modeInherited",
                              "Inherited"
                            )}
                            label={t(
                              "server_node_config.inherit_dns",
                              "Use global DNS configuration"
                            )}
                            name="inherit_dns"
                            onDraftStart={() => {
                              holdDraft.current = true;
                            }}
                          />
                          {inheritDNS ? (
                            <InheritedPreview
                              description={t(
                                "server_node_config.global_dns_summary",
                                "{{count}} DNS entries are provided by the global configuration.",
                                { count: cfgResp.global.dns?.length || 0 }
                              )}
                              title={t(
                                "server_node_config.globalPreview",
                                "Using global configuration"
                              )}
                            />
                          ) : (
                            <FormField
                              control={form.control}
                              name="dns"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    {t(
                                      "server_config.fields.dns_config",
                                      "DNS Configuration"
                                    )}
                                  </FormLabel>
                                  <DNSEditor
                                    onChange={(values) => {
                                      holdDraft.current = true;
                                      form.clearErrors("dns");
                                      field.onChange(values);
                                    }}
                                    value={field.value || []}
                                  />
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                        </section>
                      </TabsContent>

                      <TabsContent className="space-y-4" value="routing">
                        <RoutingStatus
                          expected={routingIdentityFromProjection(
                            cfgResp.effective.routing
                          )}
                          onRefresh={refreshStatus}
                          refreshDisabled={
                            saving ||
                            refreshingStatus ||
                            conflict ||
                            routingChanged ||
                            isDirty
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
                </Form>
              </Tabs>
            ) : null}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row items-center justify-between gap-3 border-t">
          <p className="text-muted-foreground text-xs">
            {isDirty || routingChanged
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
                !(isDirty || routingChanged) ||
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
