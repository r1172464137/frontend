import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { validDNSAddress } from "./dns-config";
import { RuleErrors } from "./route-rule-editor";
import { validateRouteRules } from "./route-rules";

/** Controlled text preserves blank lines and caret position between keystrokes. */
export function DNSEditor({
  value,
  onChange,
}: {
  value: API.NodeDNS[];
  onChange: (value: API.NodeDNS[]) => void;
}) {
  const { t } = useTranslation("servers");
  const id = useId();
  function update(index: number, patch: Partial<API.NodeDNS>) {
    onChange(
      value.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  }
  return (
    <div className="space-y-3">
      {value.map((item, index) => {
        const prefix = `${id}-${index}`;
        const issues = validateRouteRules("domain", item.domains || []);
        const unsupportedProto = Boolean(
          item.proto.trim() && item.proto.trim().toLowerCase() !== "udp"
        );
        const badAddress = Boolean(
          item.address && !validDNSAddress(item.address)
        );
        return (
          <div className="space-y-3 rounded-lg border p-3" key={prefix}>
            <p className="font-medium text-sm">UDP</p>
            {unsupportedProto ? (
              <div className="text-destructive text-sm" role="alert">
                {t(
                  "dns_editor.unsupported_protocol",
                  "Only UDP is supported. Convert or remove this resolver."
                )}
                <Button
                  onClick={() => update(index, { proto: "udp" })}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("dns_editor.use_udp", "Use UDP")}
                </Button>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor={`${prefix}-address`}>
                {t("dns_editor.address", "Resolver address")}
              </Label>
              <Input
                aria-invalid={badAddress}
                id={`${prefix}-address`}
                onChange={(event) =>
                  update(index, { address: event.target.value })
                }
                placeholder="1.1.1.1:53"
                value={item.address}
              />
              {badAddress ? (
                <p className="text-destructive text-xs" role="alert">
                  {t(
                    "dns_editor.invalid_address",
                    "Enter a hostname or IP address with an optional port from 1 to 65535; schemes and paths are not supported."
                  )}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${prefix}-domains`}>
                {t("dns_editor.domains", "Domain rules")}
              </Label>
              <Textarea
                aria-invalid={issues.length > 0}
                id={`${prefix}-domains`}
                onChange={(event) =>
                  update(index, { domains: event.target.value.split("\n") })
                }
                placeholder={t(
                  "server_config.fields.dns_domains_placeholder",
                  "One domain rule per line"
                )}
                value={(item.domains || []).join("\n")}
              />
              <RuleErrors issues={issues} />
            </div>
            <Button
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("dns_editor.remove", "Remove resolver")}
            </Button>
          </div>
        );
      })}
      <Button
        onClick={() =>
          onChange([
            ...value,
            { proto: "udp", address: "", server_name: "", domains: [] },
          ])
        }
        size="sm"
        type="button"
        variant="outline"
      >
        {t("dns_editor.add", "Add UDP resolver")}
      </Button>
    </div>
  );
}
