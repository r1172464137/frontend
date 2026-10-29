import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { SingleRouteMatchEditor } from "./route-rule-editor";
import { canonicalizeRouteRules, validateRouteRules } from "./route-rules";

export function RoutingRuleDialog({
  rule,
  outbounds,
  onSave,
  onClose,
}: {
  rule: API.NodeRouteRule;
  outbounds: { id: string; label: string; protocol?: string }[];
  onSave: (rule: API.NodeRouteRule) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("servers");
  const [draft, setDraft] = useState(rule);
  const remarkId = useId();
  const kindId = useId();
  const outboundId = useId();
  const values = canonicalizeRouteRules(draft.kind, draft.values);
  const invalid =
    !values.length ||
    draft.values.length > 1024 ||
    validateRouteRules(draft.kind, draft.values).length > 0 ||
    [...draft.remark].length > 200 ||
    /\p{Cc}/u.test(draft.remark) ||
    !outbounds.some((item) => item.id === draft.outbound_id);
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("ordered_routing.rule_editor", "Edit routing rule")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "ordered_routing.rule_description",
              "Each rule matches one category; its values are alternatives."
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              aria-label={t("ordered_routing.rule_enabled", "Rule enabled")}
              checked={draft.enabled}
              onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
            />
            <span>{t("enabled", "Enabled")}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor={remarkId}>
              {t("ordered_routing.remark", "Remark")}
            </Label>
            <Input
              id={remarkId}
              maxLength={400}
              onChange={(event) =>
                setDraft({ ...draft, remark: event.target.value })
              }
              value={draft.remark}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={kindId}>
              {t("ordered_routing.kind", "Match type")}
            </Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              id={kindId}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  kind: event.target.value as API.NodeRouteRule["kind"],
                  values: [],
                })
              }
              value={draft.kind}
            >
              <option value="domain">
                {t("ordered_routing.domain", "Domain")}
              </option>
              <option value="ip">{t("ordered_routing.ip", "IP")}</option>
              <option value="protocol">
                {t("ordered_routing.protocol", "Protocol")}
              </option>
            </select>
          </div>
          <SingleRouteMatchEditor
            key={draft.kind}
            kind={draft.kind}
            onChange={(next) => setDraft({ ...draft, values: next })}
            value={draft.values}
          />
          <div className="space-y-2">
            <Label htmlFor={outboundId}>
              {t("ordered_routing.target", "Outbound")}
            </Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              id={outboundId}
              onChange={(event) =>
                setDraft({ ...draft, outbound_id: event.target.value })
              }
              value={draft.outbound_id}
            >
              {outbounds.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          {draft.kind === "protocol" &&
          values.includes("bittorrent") &&
          outbounds.find((item) => item.id === draft.outbound_id)?.protocol ===
            "socks" ? (
            <div className="rounded-lg border p-3 text-sm">
              <strong>
                {t(
                  "route_rules.socks_udp_title",
                  "SOCKS5 UDP support required"
                )}
              </strong>
              <p>
                {t(
                  "route_rules.socks_udp_warning",
                  "BitTorrent peer traffic can use µTP and DHT. The SOCKS5 server must support UDP Associate or that traffic will fail."
                )}
              </p>
            </div>
          ) : null}
          {invalid ? (
            <p className="text-destructive text-sm" role="alert">
              {t(
                "ordered_routing.rule_invalid",
                "Provide valid non-empty match values, a valid target and a remark of at most 200 characters."
              )}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t("actions.cancel", "Cancel")}
          </Button>
          <Button
            disabled={invalid}
            onClick={() => onSave({ ...draft, values })}
            type="button"
          >
            {t("ordered_routing.apply_rule", "Apply rule")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
