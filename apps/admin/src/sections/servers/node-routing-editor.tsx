import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { SortableList } from "@workspace/ui/composed/sortable-list";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  moveRoutingRule,
  newRoutingID,
  outboundReferences,
  validateNodeRouting,
} from "./node-routing";
import { OutboundConfigInput } from "./outbound-config-input";
import { RoutingRuleDialog } from "./routing-rule-dialog";

export function NodeRoutingEditor({
  value,
  onChange,
  readOnly = false,
  onDraftStart,
}: {
  value: API.NodeRouting;
  onChange: (value: API.NodeRouting) => void;
  readOnly?: boolean;
  onDraftStart?: () => void;
}) {
  const { t } = useTranslation("servers");
  const [editing, setEditing] = useState<API.NodeRouteRule | null>(null);
  const defaultID = useId();
  const options = [
    { id: "direct", label: t("ordered_routing.direct", "Node direct") },
    { id: "block", label: t("ordered_routing.block", "Block") },
    ...value.outbounds.map((item) => ({
      id: item.id,
      label: item.name || item.id,
      protocol: item.protocol,
    })),
  ];
  const issues = validateNodeRouting(value);
  function ruleName(rule: API.NodeRouteRule, index: number) {
    return `${index + 1}. ${rule.remark || t("ordered_routing.untitled", "Untitled rule")}`;
  }
  function saveRule(rule: API.NodeRouteRule) {
    const index = value.rules.findIndex((item) => item.id === rule.id);
    const rules = [...value.rules];
    if (index < 0) rules.push(rule);
    else rules[index] = rule;
    onChange({ ...value, rules });
    setEditing(null);
  }
  function renderRule(rule: API.NodeRouteRule, index: number) {
    const name = ruleName(rule, index);
    return (
      <div className="min-w-0 space-y-2 rounded-lg border p-3" key={rule.id}>
        <div className="flex flex-wrap items-center gap-2">
          {readOnly ? (
            <span>
              {rule.enabled
                ? t("enabled", "Enabled")
                : t("disabled", "Disabled")}
            </span>
          ) : (
            <Switch
              aria-label={t("ordered_routing.toggle_rule", "Enable {{name}}", {
                name,
              })}
              checked={rule.enabled}
              onCheckedChange={(enabled) => {
                const rules = value.rules.map((item) =>
                  item.id === rule.id ? { ...item, enabled } : item
                );
                onChange({ ...value, rules });
              }}
            />
          )}
          <strong className="min-w-0 break-words [overflow-wrap:anywhere]">
            {name}
          </strong>
          <span className="text-muted-foreground text-sm">
            {t(`ordered_routing.${rule.kind}`, rule.kind)}
          </span>
          <span className="font-medium text-sm">
            →{" "}
            {options.find((option) => option.id === rule.outbound_id)?.label ||
              rule.outbound_id}
          </span>
        </div>
        <div className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
          {rule.values.join("\n")}
        </div>
        {readOnly ? null : (
          <div className="flex flex-wrap gap-1">
            <Button
              aria-label={t("ordered_routing.move_up", "Move {{name}} up", {
                name,
              })}
              disabled={index === 0}
              onClick={() => onChange(moveRoutingRule(value, index, index - 1))}
              size="sm"
              type="button"
              variant="outline"
            >
              ↑
            </Button>
            <Button
              aria-label={t("ordered_routing.move_down", "Move {{name}} down", {
                name,
              })}
              disabled={index === value.rules.length - 1}
              onClick={() => onChange(moveRoutingRule(value, index, index + 1))}
              size="sm"
              type="button"
              variant="outline"
            >
              ↓
            </Button>
            <Button
              aria-label={t("ordered_routing.edit_rule", "Edit {{name}}", {
                name,
              })}
              onClick={() => {
                onDraftStart?.();
                setEditing(rule);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("edit", "Edit")}
            </Button>
            <Button
              aria-label={t("ordered_routing.delete_rule", "Delete {{name}}", {
                name,
              })}
              onClick={() =>
                onChange({
                  ...value,
                  rules: value.rules.filter((item) => item.id !== rule.id),
                })
              }
              size="sm"
              type="button"
              variant="outline"
            >
              {t("delete", "Delete")}
            </Button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-5">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">
            {t("ordered_routing.rules", "Routing rules")}
          </h3>
          {readOnly ? null : (
            <Button
              onClick={() => {
                onDraftStart?.();
                setEditing({
                  id: newRoutingID("rr"),
                  enabled: true,
                  remark: "",
                  kind: "domain",
                  values: [],
                  outbound_id: "direct",
                });
              }}
              type="button"
              variant="outline"
            >
              {t("ordered_routing.add_rule", "Add rule")}
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {t(
            "ordered_routing.priority",
            "Rules are evaluated top to bottom; the first match wins. The default is used when none match."
          )}
        </p>
        {readOnly ? (
          <div className="space-y-3">{value.rules.map(renderRule)}</div>
        ) : (
          <SortableList
            announce={(event, name, target) => {
              const fallback = {
                start: "Picked up {{name}}.",
                over: "Moving {{name}} over {{target}}.",
                end: "Dropped {{name}} at {{target}}.",
                cancel: "Cancelled moving {{name}}.",
              };
              return t(`ordered_routing.drag_${event}`, fallback[event], {
                name,
                target,
              });
            }}
            dragLabel={(rule, index) =>
              t("ordered_routing.drag_rule", "Drag {{name}} to reorder", {
                name: ruleName(rule, index),
              })
            }
            instructions={t(
              "ordered_routing.drag_instructions",
              "Press Space to pick up a rule, use arrow keys to move it, Space to drop, or Escape to cancel."
            )}
            items={value.rules}
            onMove={(from, to) => onChange(moveRoutingRule(value, from, to))}
            renderItem={renderRule}
          />
        )}
        {value.rules.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t(
              "ordered_routing.empty_rules",
              "No matching rules; all traffic uses the default outbound."
            )}
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor={defaultID}>
            {t("ordered_routing.default", "Default outbound")}
          </Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            disabled={readOnly}
            id={defaultID}
            onChange={(event) =>
              onChange({ ...value, default_outbound_id: event.target.value })
            }
            value={value.default_outbound_id}
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            {t(
              "ordered_routing.direct_hint",
              "Node direct connects from the node server, not the user's device."
            )}
          </p>
        </div>
      </section>
      <section className="space-y-3 border-t pt-4">
        <h3 className="font-semibold">
          {t("ordered_routing.connections", "Outbound connections")}
        </h3>
        {readOnly ? (
          <ul className="space-y-1">
            {value.outbounds.map((item) => (
              <li
                className="break-words [overflow-wrap:anywhere]"
                key={item.id}
              >
                {item.name} ({item.protocol}) — {item.id}
              </li>
            ))}
          </ul>
        ) : (
          <OutboundConfigInput
            deleteReason={(id) => {
              const refs = outboundReferences(value, id);
              if (!(refs.isDefault || refs.rules.length)) return;
              const names = refs.rules
                .map((rule) => rule.remark || rule.id)
                .join(", ");
              return t(
                "ordered_routing.referenced",
                "Cannot delete this connection. Referenced by: {{references}}",
                {
                  references: [
                    refs.isDefault
                      ? t("ordered_routing.default", "Default outbound")
                      : "",
                    names,
                  ]
                    .filter(Boolean)
                    .join(", "),
                }
              );
            }}
            onChange={(outbounds) => onChange({ ...value, outbounds })}
            value={value.outbounds}
          />
        )}
      </section>
      {issues.length ? (
        <div className="space-y-1 text-destructive text-sm" role="alert">
          <p>
            {t(
              "ordered_routing.invalid_policy",
              "Routing cannot be saved until these problems are fixed:"
            )}
          </p>
          {issues.map((issue, index) => (
            <p key={`${issue.path}-${issue.code}-${index}`}>
              {issue.path}:{" "}
              {t(`ordered_routing.errors.${issue.code}`, issue.code)}
            </p>
          ))}
        </div>
      ) : null}
      {editing ? (
        <RoutingRuleDialog
          key={editing.id}
          onClose={() => setEditing(null)}
          onSave={saveRule}
          outbounds={options}
          rule={editing}
        />
      ) : null}
    </div>
  );
}
