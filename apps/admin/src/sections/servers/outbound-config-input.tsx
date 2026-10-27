"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
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
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createOutboundConfig,
  getOutboundFields,
  getOutboundProtocolLabel,
  getOutboundSecurityOptions,
  normalizeOutboundConfig,
  type OutboundCollectionIssueCode,
  type OutboundConfigFormData,
  type OutboundFieldConfig,
  type OutboundFieldGroup,
  validateOutboundCollection,
  validateOutboundNames,
} from "./outbound-config";
import {
  RouteMatchGroupsEditor,
  StructuredRulesCapabilityNotice,
} from "./route-rule-editor";

const OUTBOUND_COLLECTION_ERROR_FALLBACKS: Record<
  OutboundCollectionIssueCode,
  string
> = {
  outboundAggregateBytes:
    "Outbound route rules exceed 49152 aggregate UTF-8 bytes.",
  outboundAggregateRules: "Outbound routing contains more than 4096 rules.",
  outboundSerializedTooLarge:
    "Serialized outbound configuration must be below 61440 UTF-8 bytes.",
  tooManyOutbounds: "No more than 128 outbounds can be configured.",
};

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

function getFieldValue(
  item: OutboundConfigFormData,
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
  item: OutboundConfigFormData,
  field: OutboundFieldConfig
) {
  if (field.name === "security") {
    return getOutboundSecurityOptions(item.protocol);
  }
  return field.options || [];
}

function getItemTitle(item: OutboundConfigFormData, index: number) {
  return (
    item.name || `${getOutboundProtocolLabel(item.protocol)} #${index + 1}`
  );
}

function getItemBadges(item: OutboundConfigFormData) {
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

function normalizeItems(values: OutboundConfigFormData[] = []) {
  return values.map((item) => normalizeOutboundConfig(item));
}

export function OutboundConfigInput({
  value = [],
  onChange,
  structuredRulesSupported = true,
}: {
  value?: OutboundConfigFormData[];
  onChange: (value: OutboundConfigFormData[]) => void;
  structuredRulesSupported?: boolean;
}) {
  const { t } = useTranslation("servers");
  const rowIDPrefix = useId();
  const nextRowID = useRef(value.length);
  const [accordionValue, setAccordionValue] = useState("");
  const rowIDs = useRef(value.map((_, index) => `${rowIDPrefix}-${index}`));
  const fields = getOutboundFields(t);
  const items = normalizeItems(value);
  const outboundNameIssues = validateOutboundNames(items);
  const outboundCollectionIssues = validateOutboundCollection(items);

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

  function emit(nextItems: OutboundConfigFormData[]) {
    onChange(normalizeItems(nextItems));
  }

  function addItem() {
    const nextItems = [...items, createOutboundConfig()];
    rowIDs.current.push(allocateRowID());
    emit(nextItems);
    setAccordionValue(String(nextItems.length - 1));
  }

  function deleteItem(index: number) {
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

  function updateRouteItem(
    index: number,
    field: "rules" | "ip_rules" | "protocol_rules",
    fieldValue: string[]
  ) {
    emit(
      items.map((item, itemIndex) =>
        itemIndex === index
          ? normalizeOutboundConfig({ ...item, [field]: fieldValue })
          : item
      )
    );
  }

  function updateItem(
    index: number,
    field: OutboundFieldConfig,
    fieldValue: string | number | boolean | string[]
  ) {
    const current = items[index] || createOutboundConfig();
    let next: Record<string, unknown>;

    if (field.name === "protocol") {
      next = {
        ...current,
        protocol: String(fieldValue),
      };
    } else {
      next = {
        ...current,
        [field.name]:
          field.name === "rules" || field.type === "string-list"
            ? splitLines(String(fieldValue))
            : fieldValue,
      };
    }

    emit(
      items.map((item, i) =>
        i === index ? normalizeOutboundConfig(next) : item
      )
    );
  }

  function renderField(
    item: OutboundConfigFormData,
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
        if (options.length <= 1) {
          return null;
        }
        return (
          <div className={cn("space-y-2", field.className)} key={field.name}>
            <Label>{label}</Label>
            <Select
              onValueChange={(nextValue) => updateItem(index, field, nextValue)}
              value={String(value || "")}
            >
              <SelectTrigger>
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
              checked={Boolean(value)}
              onCheckedChange={(checked) => updateItem(index, field, checked)}
            />
            <Label>{field.label}</Label>
          </div>
        );

      case "textarea":
      case "string-list":
        return (
          <div className={cn("space-y-2", field.className)} key={field.name}>
            <Label>{label}</Label>
            <Textarea
              className="min-h-24"
              onChange={(event) => updateItem(index, field, event.target.value)}
              placeholder={field.placeholder}
              value={String(value || "")}
            />
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
            <EnhancedInput
              aria-invalid={Boolean(nameIssue)}
              max={field.max}
              min={field.min}
              onValueChange={(nextValue) => updateItem(index, field, nextValue)}
              placeholder={field.placeholder}
              step={field.step}
              suffix={field.suffix}
              type={field.type === "number" ? "number" : "text"}
              value={value}
            />
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
    item: OutboundConfigFormData,
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
          "route_rules.outbound_priority_description",
          "Routing priority follows this top-to-bottom order; the first matching outbound wins."
        )}
      </p>
      {structuredRulesSupported ? null : <StructuredRulesCapabilityNotice />}
      {outboundCollectionIssues.length > 0 ? (
        <div className="space-y-1 text-destructive text-xs" role="alert">
          {outboundCollectionIssues.map((issue) => (
            <p key={issue}>
              {t(
                `route_rules.${issue}`,
                OUTBOUND_COLLECTION_ERROR_FALLBACKS[issue]
              )}
            </p>
          ))}
        </div>
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
                    <fieldset className="min-w-0 rounded-lg border border-border">
                      <legend className="ml-3 bg-background px-1 py-1 font-medium text-foreground text-sm">
                        {t("routing", "Routing")}
                      </legend>
                      <div className="space-y-3 p-4 pt-2">
                        <RouteMatchGroupsEditor
                          domains={item.rules}
                          ips={item.ip_rules}
                          onDomainsChange={(rules) =>
                            updateRouteItem(index, "rules", rules)
                          }
                          onIPsChange={(rules) =>
                            updateRouteItem(index, "ip_rules", rules)
                          }
                          onProtocolsChange={(rules) =>
                            updateRouteItem(index, "protocol_rules", rules)
                          }
                          protocols={item.protocol_rules}
                          structuredRulesSupported={structuredRulesSupported}
                        />
                        {item.protocol === "socks" &&
                        item.protocol_rules.includes("bittorrent") ? (
                          <Alert>
                            <AlertTitle>
                              {t(
                                "route_rules.socks_udp_title",
                                "SOCKS5 UDP support required"
                              )}
                            </AlertTitle>
                            <AlertDescription>
                              {t(
                                "route_rules.socks_udp_warning",
                                "BitTorrent peer traffic can use µTP and DHT. The SOCKS5 server must support UDP Associate or that traffic will fail."
                              )}
                            </AlertDescription>
                          </Alert>
                        ) : null}
                      </div>
                    </fieldset>
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
