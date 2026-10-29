"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { Textarea } from "@workspace/ui/components/textarea";
import { EnhancedInput } from "@workspace/ui/composed/enhanced-input";
import { cn } from "@workspace/ui/lib/utils";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CirclePlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { newRoutingID } from "./node-routing";
import { validateOutboundCapability } from "./outbound-capability";
import {
  getOutboundFields,
  getOutboundProtocolLabel,
  getOutboundSecurityOptions,
  type OutboundConnection,
  type OutboundFieldConfig,
  type OutboundFieldGroup,
  validateOutboundNames,
} from "./outbound-config";

const FIELD_GROUPS: {
  group: OutboundFieldGroup;
  labelKey: string;
  fallback: string;
}[] = [
  {
    group: "basic",
    labelKey: "basic",
    fallback: "Basic Configuration",
  },
  {
    group: "auth",
    labelKey: "auth",
    fallback: "Authentication",
  },
  {
    group: "transport",
    labelKey: "transport",
    fallback: "Transport",
  },
  {
    group: "security",
    labelKey: "security",
    fallback: "Security",
  },
  {
    group: "reality",
    labelKey: "reality",
    fallback: "Reality",
  },
  {
    group: "protocol",
    labelKey: "protocol_options",
    fallback: "Protocol Options",
  },
];

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function StringListInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const id = useId();
  const serialized = value.join("\n");
  const [draft, setDraft] = useState(serialized);
  const lastEmitted = useRef(serialized);
  useEffect(() => {
    if (serialized !== lastEmitted.current) {
      lastEmitted.current = serialized;
      setDraft(serialized);
    }
  }, [serialized]);
  return (
    <>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        className="min-h-24"
        id={id}
        onChange={(event) => {
          const text = event.target.value;
          const lines = splitLines(text);
          setDraft(text);
          lastEmitted.current = lines.join("\n");
          onChange(lines);
        }}
        placeholder={placeholder}
        value={draft}
      />
    </>
  );
}

function getFieldValue(
  item: OutboundConnection,
  field: OutboundFieldConfig
): string | number | boolean | string[] {
  const value = item[field.name];
  if (field.type === "string-list" || field.name === "rules") {
    return Array.isArray(value) ? value.join("\n") : "";
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((entry) => typeof entry === "string"))
  ) {
    return value;
  }
  return "";
}

function getSelectOptions(
  item: OutboundConnection,
  field: OutboundFieldConfig
) {
  if (field.name === "security")
    return getOutboundSecurityOptions(item.protocol);
  if (field.name === "cipher" && item.protocol === "vmess")
    return ["auto", "aes-128-gcm", "chacha20-poly1305"].map((value) => ({
      label: value,
      value,
    }));
  if (field.name === "transport" && item.security === "reality")
    return (field.options || []).filter((option) =>
      ["tcp", "grpc", "xhttp"].includes(option.value)
    );
  return field.options || [];
}

function getItemTitle(item: OutboundConnection, index: number) {
  return (
    item.name || `${getOutboundProtocolLabel(item.protocol)} #${index + 1}`
  );
}

function getItemBadges(item: OutboundConnection) {
  return [
    getOutboundProtocolLabel(item.protocol),
    item.transport && !["tuic", "hysteria2"].includes(item.transport)
      ? item.transport.toUpperCase()
      : "",
    item.security && item.security !== "none"
      ? item.security.toUpperCase()
      : "",
    item.port ? String(item.port) : "",
  ].filter(Boolean);
}

export function OutboundConfigInput({
  value,
  onChange,
  deleteReason,
}: {
  value: API.NodeRoutingOutbound[];
  onChange: (value: API.NodeRoutingOutbound[]) => void;
  deleteReason: (id: string) => string | undefined;
}) {
  const { t } = useTranslation("servers");
  const [deleteError, setDeleteError] = useState("");
  const rowIDPrefix = useId();
  const nextRowID = useRef(value.length);
  const [accordionValue, setAccordionValue] = useState("");
  const rowIDs = useRef(value.map((_, index) => `${rowIDPrefix}-${index}`));
  const fields = getOutboundFields(t);
  const items = value;
  const outboundNameIssues = validateOutboundNames(items);

  function allocateRowID() {
    const id = `${rowIDPrefix}-${nextRowID.current}`;
    nextRowID.current += 1;
    return id;
  }

  if (rowIDs.current.length > items.length) {
    rowIDs.current = rowIDs.current.slice(0, items.length);
  }
  while (rowIDs.current.length < items.length) {
    rowIDs.current.push(allocateRowID());
  }

  function emit(nextItems: API.NodeRoutingOutbound[]) {
    onChange(nextItems);
  }

  function addItem() {
    const item = {
      id: newRoutingID("ob"),
      name: "",
      protocol: "http",
      address: "",
      port: 0,
      password: "",
      rules: [],
      ip_rules: [],
      protocol_rules: [],
    };
    const nextItems = [...items, item];
    rowIDs.current.push(allocateRowID());
    emit(nextItems);
    setAccordionValue(String(nextItems.length - 1));
  }

  function deleteItem(index: number) {
    const reason = deleteReason(items[index]?.id || "");
    if (reason) {
      setDeleteError(reason);
      return;
    }
    setDeleteError("");
    rowIDs.current = rowIDs.current.filter((_, rowIndex) => rowIndex !== index);
    emit(items.filter((_, itemIndex) => itemIndex !== index));
    const activeIndex = Number(accordionValue);
    if (accordionValue === String(index)) {
      setAccordionValue("");
    } else if (Number.isInteger(activeIndex) && index < activeIndex) {
      setAccordionValue(String(activeIndex - 1));
    }
  }

  function moveItem(index: number, offset: -1 | 1) {
    const destination = index + offset;
    if (destination < 0 || destination >= items.length) return;
    const nextItems = [...items];
    [nextItems[index], nextItems[destination]] = [
      nextItems[destination]!,
      nextItems[index]!,
    ];
    [rowIDs.current[index], rowIDs.current[destination]] = [
      rowIDs.current[destination]!,
      rowIDs.current[index]!,
    ];
    emit(nextItems);
    setAccordionValue(String(destination));
  }

  function updateItem(
    index: number,
    field: OutboundFieldConfig,
    fieldValue: string | number | boolean | string[]
  ) {
    const current = items[index];
    if (!current) return;
    let next: API.NodeRoutingOutbound;

    if (field.name === "protocol") {
      next = {
        ...current,
        protocol: String(fieldValue),
      };
    } else {
      next = {
        ...current,
        [field.name]: fieldValue,
      };
    }

    emit(items.map((item, i) => (i === index ? next : item)));
  }

  function renderField(
    item: OutboundConnection,
    index: number,
    field: OutboundFieldConfig
  ) {
    if (field.visible && !field.visible(item)) {
      return null;
    }

    const value = getFieldValue(item, field);
    const label = (
      <>
        {field.label}
        {field.required ? (
          <span aria-hidden="true" className="ml-1 text-destructive">
            *
          </span>
        ) : null}
      </>
    );

    switch (field.type) {
      case "select": {
        const options = getSelectOptions(item, field);
        if (options.length === 0) {
          return null;
        }
        return (
          <div className={cn("space-y-2", field.className)} key={field.name}>
            <Label>{label}</Label>
            <Select
              onValueChange={(nextValue) => updateItem(index, field, nextValue)}
              value={String(value || "")}
            >
              <SelectTrigger aria-label={field.label}>
                <SelectValue placeholder={field.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      }

      case "boolean":
        return (
          <div
            className={cn("flex items-center gap-2 pt-7", field.className)}
            key={field.name}
          >
            <Switch
              aria-label={field.label}
              checked={Boolean(value)}
              onCheckedChange={(checked) => updateItem(index, field, checked)}
            />
            <Label>{field.label}</Label>
          </div>
        );

      case "string-list":
        return (
          <div className={cn("space-y-2", field.className)} key={field.name}>
            <StringListInput
              label={field.label}
              onChange={(lines) => updateItem(index, field, lines)}
              placeholder={field.placeholder}
              value={
                Array.isArray(item[field.name])
                  ? (item[field.name] as string[])
                  : []
              }
            />
          </div>
        );
      case "textarea":
        return (
          <div className={cn("space-y-2", field.className)} key={field.name}>
            <Label>{label}</Label>
            <Textarea
              aria-label={field.label}
              className="min-h-24"
              onChange={(event) => updateItem(index, field, event.target.value)}
              placeholder={field.placeholder}
              value={String(value || "")}
            />
            {field.name === "settings" ? (
              <p className="text-muted-foreground text-xs">
                {t(
                  "ordered_routing.raw_settings_hint",
                  "When non-empty, raw settings replace the projected connection fields. Include the complete settings for this protocol; the panel will not fill missing fields from the form."
                )}
              </p>
            ) : null}
          </div>
        );

      default: {
        const nameIssue =
          field.name === "name"
            ? outboundNameIssues.find((issue) => issue.index === index)
            : undefined;
        return (
          <div className={cn("space-y-2", field.className)} key={field.name}>
            <Label>{label}</Label>
            {field.type === "number" ? (
              <EnhancedInput
                aria-invalid={Boolean(nameIssue)}
                aria-label={field.label}
                max={field.max}
                min={field.min}
                onValueChange={(nextValue) =>
                  updateItem(index, field, nextValue)
                }
                placeholder={field.placeholder}
                step={field.step}
                suffix={field.suffix}
                type="number"
                value={value}
              />
            ) : (
              <Input
                aria-invalid={Boolean(nameIssue)}
                aria-label={field.label}
                onChange={(event) =>
                  updateItem(index, field, event.target.value)
                }
                placeholder={field.placeholder}
                value={String(value || "")}
              />
            )}
            {nameIssue ? (
              <p className="text-destructive text-xs" role="alert">
                {nameIssue.code === "empty"
                  ? t(
                      "route_rules.outbound_name_empty",
                      "Outbound name must not be empty."
                    )
                  : t(
                      "route_rules.outbound_name_duplicate",
                      'Outbound name "{{name}}" must be unique.',
                      { name: nameIssue.name }
                    )}
              </p>
            ) : null}
          </div>
        );
      }
    }
  }

  function renderGroup(
    item: OutboundConnection,
    index: number,
    group: (typeof FIELD_GROUPS)[number]
  ) {
    const groupFields = fields.filter((field) => field.group === group.group);
    const visibleFields = groupFields.filter(
      (field) => !field.visible || field.visible(item)
    );
    if (visibleFields.length === 0) {
      return null;
    }

    return (
      <fieldset className="rounded-lg border border-border" key={group.group}>
        <legend className="ml-3 bg-background px-1 py-1 font-medium text-foreground text-sm">
          {t(group.labelKey, group.fallback)}
        </legend>
        <div className="grid grid-cols-2 gap-4 p-4 pt-2">
          {visibleFields.map((field) => renderField(item, index, field))}
        </div>
      </fieldset>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        {t(
          "ordered_routing.connections_description",
          "Connections are referenced by stable ID; their order does not affect routing."
        )}
      </p>
      {deleteError ? (
        <p className="text-destructive text-sm" role="alert">
          {deleteError}
        </p>
      ) : null}
      {items.length > 0 && (
        <Accordion
          className="space-y-3"
          collapsible
          onValueChange={setAccordionValue}
          type="single"
          value={accordionValue}
        >
          {items.map((item, index) => (
            <div
              className="flex items-start gap-2"
              key={rowIDs.current[index]!}
            >
              <AccordionItem
                className="min-w-0 flex-1 rounded-lg border"
                value={String(index)}
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex w-full min-w-0 flex-col items-start gap-2">
                    <span className="max-w-full truncate font-medium text-sm">
                      {getItemTitle(item, index)}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {getItemBadges(item).map((badge) => (
                        <Badge
                          className="text-xs"
                          key={badge}
                          variant="outline"
                        >
                          {badge}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pt-0 pb-4">
                  <div className="-mx-4 space-y-4 rounded-b-lg border-t px-4 pt-4">
                    {FIELD_GROUPS.map((group) =>
                      renderGroup(item, index, group)
                    )}
                    {validateOutboundCapability(item).length > 0 ? (
                      <div
                        className="space-y-2 rounded border border-destructive p-3 text-sm"
                        role="alert"
                      >
                        <p>
                          {t(
                            "ordered_routing.unsupported_connection_hint",
                            "This connection contains unsupported or incomplete settings. They are preserved but the routing package cannot be saved until corrected."
                          )}
                        </p>
                        {validateOutboundCapability(item).map(
                          (issue, issueIndex) => (
                            <p
                              key={`${issue.field}-${issue.code}-${issueIndex}`}
                            >
                              {issue.field}:{" "}
                              {t(
                                `ordered_routing.errors.${issue.code}`,
                                issue.code
                              )}
                            </p>
                          )
                        )}
                        {validateOutboundCapability(item).some((issue) =>
                          ["uot", "multiplex", "encryption", "plugin"].includes(
                            issue.field
                          )
                        ) ? (
                          <Button
                            onClick={() => {
                              const next = { ...item };
                              const fieldsByIssue: Record<string, string[]> = {
                                uot: ["uot", "uot_version"],
                                multiplex: ["multiplex"],
                                encryption: [
                                  "encryption",
                                  "encryption_mode",
                                  "encryption_rtt",
                                  "encryption_ticket",
                                  "encryption_client_padding",
                                  "encryption_password",
                                ],
                                plugin: ["plugin", "plugin_opts"],
                              };
                              for (const issue of validateOutboundCapability(
                                item
                              ))
                                for (const field of fieldsByIssue[
                                  issue.field
                                ] || [])
                                  Reflect.deleteProperty(next, field);
                              emit(
                                items.map((candidate, i) =>
                                  i === index ? next : candidate
                                )
                              );
                            }}
                            type="button"
                            variant="outline"
                          >
                            {t(
                              "ordered_routing.clear_unsupported",
                              "Remove unsupported connection options"
                            )}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </AccordionContent>
              </AccordionItem>
              <div className="mt-2 flex shrink-0 flex-col gap-1">
                <Button
                  aria-label={t(
                    "route_rules.move_outbound_up",
                    "Move {{name}} up",
                    { name: getItemTitle(item, index) }
                  )}
                  disabled={index === 0}
                  onClick={() => moveItem(index, -1)}
                  size="icon"
                  title={t("route_rules.move_up", "Move up")}
                  type="button"
                  variant="ghost"
                >
                  <ArrowUpIcon className="h-4 w-4" />
                </Button>
                <Button
                  aria-label={t(
                    "route_rules.move_outbound_down",
                    "Move {{name}} down",
                    { name: getItemTitle(item, index) }
                  )}
                  disabled={index === items.length - 1}
                  onClick={() => moveItem(index, 1)}
                  size="icon"
                  title={t("route_rules.move_down", "Move down")}
                  type="button"
                  variant="ghost"
                >
                  <ArrowDownIcon className="h-4 w-4" />
                </Button>
                <Button
                  aria-label={t(
                    "route_rules.delete_outbound",
                    "Delete {{name}}",
                    { name: getItemTitle(item, index) }
                  )}
                  onClick={() => deleteItem(index)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </Accordion>
      )}
      <Button onClick={addItem} type="button" variant="outline">
        <CirclePlusIcon className="mr-2 h-4 w-4" />
        {t("server_config.fields.add_outbound", "Add outbound")}
      </Button>
    </div>
  );
}
