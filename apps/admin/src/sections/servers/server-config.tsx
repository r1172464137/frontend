"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { EnhancedInput } from "@workspace/ui/composed/enhanced-input";
import { Icon } from "@workspace/ui/composed/icon";
import {
  getSystemNodeConfig as getNodeConfig,
  putSystemNodeConfig as updateNodeConfig,
} from "@workspace/ui/services/node-config";
import { unitConversion } from "@workspace/ui/utils/unit-conversions";
import { DicesIcon } from "lucide-react";
import { uid } from "radash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { dnsForWrite } from "./dns-config";
import { DNSEditor } from "./dns-editor";
import {
  dnsIsValid,
  editableDNS,
  globalWriteMatches,
  isDefiniteRejection,
  safeBackendError,
} from "./node-config-write";
import {
  isRoutingConflict,
  isRoutingRevision,
  routingContentFromProjection,
  validateNodeRouting,
} from "./node-routing";
import { NodeRoutingEditor } from "./node-routing-editor";
import { RoutingConflict } from "./routing-status";

const dnsConfigSchema = z.object({
  proto: z.string(), // z.enum(['tcp', 'udp', 'tls', 'https', 'quic']),
  address: z.string(),
  server_name: z.string().optional(),
  domains: z.array(z.string()),
});

function createNodeConfigSchema(intervalMessage: string) {
  const interval = z
    .number()
    .refine(
      (value) => Number.isInteger(value) && value >= 0 && value <= 86_400,
      intervalMessage
    )
    .optional();
  return z.object({
    node_secret: z.string().optional(),
    node_pull_interval: interval,
    node_push_interval: interval,
    traffic_report_threshold: z.number().optional(),
    ip_strategy: z.string().optional(),
    dns: z.array(dnsConfigSchema).optional(),
  });
}
type NodeConfigFormData = z.infer<ReturnType<typeof createNodeConfigSchema>>;

export default function ServerConfig() {
  const { t } = useTranslation("servers");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("basic");
  const [saving, setSaving] = useState(false);
  const [routing, setRouting] = useState<API.NodeRouting>();
  const [routingDirty, setRoutingDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [cfgResp, setCfgResp] = useState<API.NodeConfig>();
  const holdDraft = useRef(false);

  const {
    data: queryConfig,
    refetch: refetchCfg,
    isError,
    isLoading,
  } = useQuery({
    queryKey: ["getNodeConfig"],
    queryFn: async () => {
      const { data } = await getNodeConfig();
      return data.data as API.NodeConfig | undefined;
    },
    enabled: open,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const intervalMessage = t(
    "ordered_routing.interval_invalid",
    "Enter an integer from 0 to 86400 seconds."
  );
  const nodeConfigSchema = useMemo(
    () => createNodeConfigSchema(intervalMessage),
    [intervalMessage]
  );
  const form = useForm<NodeConfigFormData>({
    resolver: zodResolver(nodeConfigSchema),
    defaultValues: {
      node_secret: "",
      node_pull_interval: undefined,
      node_push_interval: undefined,
      traffic_report_threshold: undefined,
      ip_strategy: "prefer_ipv4",
      dns: [],
    },
  });

  const resetConfig = useCallback(
    (config: API.NodeConfig) => {
      setCfgResp(config);
      setRouting(routingContentFromProjection(config.routing));
      setRoutingDirty(false);
      form.reset({
        node_secret: config.node_secret ?? "",
        node_pull_interval: config.node_pull_interval,
        node_push_interval: config.node_push_interval,
        traffic_report_threshold: config.traffic_report_threshold,
        ip_strategy: config.ip_strategy ?? "",
        dns: editableDNS(config.dns),
      });
    },
    [form]
  );
  const { isDirty, dirtyFields } = form.formState;
  useEffect(() => {
    if (isDirty) holdDraft.current = true;
  }, [isDirty]);
  useEffect(() => {
    if (queryConfig && !holdDraft.current) resetConfig(queryConfig);
  }, [queryConfig, resetConfig]);

  const validConfig = Boolean(
    cfgResp &&
      cfgResp.routing_mode === "global-v1" &&
      isRoutingRevision(cfgResp.routing_revision) &&
      cfgResp.routing_revision > 0 &&
      routing
  );

  async function onSubmit(values: NodeConfigFormData) {
    if (
      conflict ||
      !validConfig ||
      !(isDirty || routingDirty) ||
      (routingDirty && (!routing || validateNodeRouting(routing).length))
    )
      return;
    if (dirtyFields.dns && !dnsIsValid(values.dns || [])) {
      setTab("dns");
      form.setError("dns", {
        message: t(
          "ordered_routing.dns_required",
          "Check the UDP resolver addresses and domain rules before saving."
        ),
      });
      return;
    }
    for (const field of ["node_pull_interval", "node_push_interval"] as const) {
      if (dirtyFields[field] && values[field] === undefined) {
        setTab("basic");
        form.setError(field, {
          message: t(
            "ordered_routing.interval_invalid",
            "Enter an integer from 0 to 86400 seconds."
          ),
        });
        return;
      }
    }
    const payload: API.UpdateNodeConfigRequest = {
      routing_revision: cfgResp!.routing_revision,
    };
    if (dirtyFields.node_secret) payload.node_secret = values.node_secret ?? "";
    if (dirtyFields.node_pull_interval)
      payload.node_pull_interval = values.node_pull_interval;
    if (dirtyFields.node_push_interval)
      payload.node_push_interval = values.node_push_interval;
    if (dirtyFields.traffic_report_threshold)
      payload.traffic_report_threshold = values.traffic_report_threshold;
    if (dirtyFields.ip_strategy) payload.ip_strategy = values.ip_strategy ?? "";
    if (dirtyFields.dns) payload.dns = dnsForWrite(values.dns || []);
    if (routingDirty) payload.routing = routing;
    const revision = cfgResp!.routing_revision;
    holdDraft.current = true;
    setSaveError(undefined);
    setSaving(true);
    async function readBack(recovered: boolean) {
      try {
        const refreshed = await refetchCfg();
        if (
          !refreshed.error &&
          refreshed.data &&
          globalWriteMatches(payload, refreshed.data, revision)
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
          resetConfig(refreshed.data);
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
      await updateNodeConfig(payload, { skipErrorHandler: true });
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
    <Sheet
      onOpenChange={(nextOpen) => {
        if (!nextOpen && saving) return;
        if (nextOpen && queryConfig && !conflict) {
          holdDraft.current = false;
          resetConfig(queryConfig);
        }
        setOpen(nextOpen);
      }}
      open={open}
    >
      <SheetTrigger asChild>
        <Card>
          <CardContent>
            <div className="flex cursor-pointer items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon
                    className="h-5 w-5 text-primary"
                    icon="mdi:resistor-nodes"
                  />
                </div>
                <div className="flex-1">
                  <p className="font-medium">
                    {t("server_config.title", "Node configuration")}
                  </p>
                  <p className="truncate text-muted-foreground text-sm">
                    {t(
                      "server_config.description",
                      "Manage node communication keys, pull/push intervals."
                    )}
                  </p>
                </div>
              </div>
              <Icon className="size-6" icon="mdi:chevron-right" />
            </div>
          </CardContent>
        </Card>
      </SheetTrigger>

      <SheetContent className="w-[720px] max-w-full md:max-w-3xl">
        <SheetHeader>
          <SheetTitle>
            {t("server_config.title", "Node configuration")}
          </SheetTitle>
          <SheetDescription>
            {t(
              "server_config.description",
              "Manage node communication, DNS and routing defaults."
            )}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="[&_[data-slot=scroll-area-viewport]>div]:!block min-h-0 min-w-0 flex-1 px-6">
          {isError ? (
            <div
              className="space-y-2 rounded-lg border border-destructive p-4"
              role="alert"
            >
              <p>
                {t(
                  "server_node_config.loadErrorTitle",
                  "Unable to load configuration"
                )}
              </p>
              <Button
                onClick={() => refetchCfg()}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("server_node_config.retry", "Retry")}
              </Button>
            </div>
          ) : null}
          {isLoading && !cfgResp ? (
            <p role="status">
              {t("server_node_config.loading", "Loading configuration")}
            </p>
          ) : null}
          {saveError ? (
            <p className="break-words text-destructive text-sm" role="alert">
              {saveError}
            </p>
          ) : null}
          {conflict ? (
            <RoutingConflict
              onRefresh={async () => {
                const result = await refetchCfg();
                if (result.data && !result.error) {
                  holdDraft.current = false;
                  resetConfig(result.data);
                  setConflict(false);
                  setUncertain(false);
                  setSaveError(undefined);
                }
              }}
              uncertain={uncertain}
            />
          ) : null}
          <Tabs className="pt-4" onValueChange={setTab} value={tab}>
            <TabsList className="flex h-auto w-full flex-wrap [&_[role=tab]]:h-auto [&_[role=tab]]:min-w-0 [&_[role=tab]]:whitespace-normal">
              <TabsTrigger value="basic">
                {t("server_config.tabs.basic", "Basic Configuration")}
              </TabsTrigger>
              <TabsTrigger value="dns">
                {t("server_config.tabs.dns", "DNS Configuration")}
              </TabsTrigger>
              <TabsTrigger value="routing">
                {t("ordered_routing.tab", "Ordered routing")}
              </TabsTrigger>
            </TabsList>

            <Form {...form}>
              <form
                className="mt-4"
                id="server-config-form"
                noValidate
                onChangeCapture={() => {
                  holdDraft.current = true;
                }}
                onSubmit={form.handleSubmit(onSubmit, (errors) => {
                  if (errors.dns) setTab("dns");
                  else setTab("basic");
                })}
              >
                <fieldset disabled={saving}>
                  <TabsContent className="space-y-4" value="basic">
                    <FormField
                      control={form.control}
                      name="node_secret"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t(
                              "server_config.fields.communication_key",
                              "Communication key"
                            )}
                          </FormLabel>
                          <FormControl>
                            <div className="flex gap-2">
                              <Input
                                onChange={field.onChange}
                                placeholder={t(
                                  "server_config.fields.communication_key_placeholder",
                                  "Please enter"
                                )}
                                value={field.value ?? ""}
                              />
                              <Button
                                aria-label={t(
                                  "ordered_routing.generate_secret",
                                  "Generate communication key"
                                )}
                                onClick={() => {
                                  const id = uid(32).toLowerCase();
                                  const formatted = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
                                  holdDraft.current = true;
                                  form.setValue("node_secret", formatted, {
                                    shouldDirty: true,
                                  });
                                }}
                                type="button"
                                variant="outline"
                              >
                                <DicesIcon />
                              </Button>
                            </div>
                          </FormControl>
                          <FormDescription>
                            {t(
                              "server_config.fields.communication_key_desc",
                              "Used for node authentication."
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="node_pull_interval"
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <FormLabel>
                            {t(
                              "server_config.fields.node_pull_interval",
                              "Node pull interval"
                            )}
                          </FormLabel>
                          <FormControl>
                            <Input
                              max={86_400}
                              min={0}
                              onChange={(event) =>
                                field.onChange(
                                  event.target.value === ""
                                    ? undefined
                                    : Number(event.target.value)
                                )
                              }
                              step={1}
                              type="number"
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormDescription>
                            {t(
                              "server_config.fields.node_pull_interval_desc",
                              "How often the node pulls configuration (seconds)."
                            )}
                          </FormDescription>
                          <FormMessage>
                            {fieldState.error
                              ? t(
                                  "ordered_routing.interval_invalid",
                                  "Enter an integer from 0 to 86400 seconds."
                                )
                              : undefined}
                          </FormMessage>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="node_push_interval"
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <FormLabel>
                            {t(
                              "server_config.fields.node_push_interval",
                              "Node push interval"
                            )}
                          </FormLabel>
                          <FormControl>
                            <Input
                              max={86_400}
                              min={0}
                              onChange={(event) =>
                                field.onChange(
                                  event.target.value === ""
                                    ? undefined
                                    : Number(event.target.value)
                                )
                              }
                              step={1}
                              type="number"
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormDescription>
                            {t(
                              "server_config.fields.node_push_interval_desc",
                              "How often the node pushes stats (seconds)."
                            )}
                          </FormDescription>
                          <FormMessage>
                            {fieldState.error
                              ? t(
                                  "ordered_routing.interval_invalid",
                                  "Enter an integer from 0 to 86400 seconds."
                                )
                              : undefined}
                          </FormMessage>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="traffic_report_threshold"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t(
                              "server_config.fields.traffic_report_threshold",
                              "Traffic Report Threshold"
                            )}
                          </FormLabel>
                          <FormControl>
                            <EnhancedInput
                              min={0}
                              onValueChange={(value) => {
                                field.onChange(
                                  unitConversion("mbToBits", value)
                                );
                              }}
                              placeholder="1"
                              suffix="MB"
                              type="number"
                              value={unitConversion(
                                "bitsToMb",
                                field.value as number | undefined
                              )}
                            />
                          </FormControl>
                          <FormDescription>
                            {t(
                              "server_config.fields.traffic_report_threshold_desc",
                              "Set the minimum threshold for traffic reporting."
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>

                  <TabsContent className="space-y-4" value="dns">
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
                                value === "__node_default__" ? "" : value
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
                          <FormDescription>
                            {t(
                              "server_config.fields.ip_strategy_desc",
                              "Choose IP version preference for network connections"
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

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
                  </TabsContent>

                  <TabsContent className="space-y-4" value="routing">
                    <p className="text-sm">
                      {t(
                        "ordered_routing.global_v1",
                        "Global ordered routing v1"
                      )}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {t(
                        "ordered_routing.global_status",
                        "Saving the global policy does not confirm node application. Check each server's routing status."
                      )}
                    </p>
                    {cfgResp && !validConfig ? (
                      <p className="text-destructive" role="alert">
                        {t(
                          "ordered_routing.unsupported_policy",
                          "This routing policy is invalid or uses an unsupported version. It cannot be edited."
                        )}
                      </p>
                    ) : null}
                    {validConfig && routing ? (
                      <NodeRoutingEditor
                        onChange={(next) => {
                          holdDraft.current = true;
                          setRouting(next);
                          setRoutingDirty(true);
                        }}
                        onDraftStart={() => {
                          holdDraft.current = true;
                        }}
                        value={routing}
                      />
                    ) : null}
                  </TabsContent>
                </fieldset>
              </form>
            </Form>
          </Tabs>
        </ScrollArea>

        <SheetFooter className="flex-row justify-end gap-2 pt-3">
          <Button
            disabled={saving}
            onClick={() => setOpen(false)}
            variant="outline"
          >
            {t("actions.cancel", "Cancel")}
          </Button>
          <Button
            disabled={
              saving ||
              conflict ||
              isError ||
              isLoading ||
              !validConfig ||
              !(isDirty || routingDirty) ||
              (routingDirty &&
                (!routing || validateNodeRouting(routing).length > 0))
            }
            form="server-config-form"
            type="submit"
          >
            <Icon
              className={saving ? "mr-2 animate-spin" : "hidden"}
              icon="mdi:loading"
            />
            {t("actions.save", "Save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
