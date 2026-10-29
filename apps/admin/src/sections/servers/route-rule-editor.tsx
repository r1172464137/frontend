"use client";

import { Checkbox } from "@workspace/ui/components/checkbox";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  normalizeRuleLines,
  type RouteRuleIssue,
  type RouteRuleIssueCode,
  type RouteRuleKind,
  validateRouteRules,
} from "./route-rules";

const ERROR_FALLBACKS: Record<RouteRuleIssueCode, string> = {
  controlCharacter: "Line {{line}}: control characters are not allowed.",
  domainIpCategory:
    "Line {{line}}: {{value}} belongs in the IP / GeoIP / CIDR section.",
  domainProtocolCategory:
    "Line {{line}}: bittorrent belongs in the Protocol section.",
  emptyGeosite: "Line {{line}}: the GeoSite name is empty or invalid.",
  invalidDomain: "Line {{line}}: {{value}} is not a valid domain rule.",
  invalidGeoip: "Line {{line}}: the GeoIP name is empty or unsafe.",
  invalidIp: "Line {{line}}: {{value}} is not a valid IPv4, IPv6, or CIDR.",
  invalidRegex: "Line {{line}}: the regular expression is invalid.",
  ipDomainCategory:
    "Line {{line}}: {{value}} belongs in the Domain / GeoSite / RE2 Regex section.",
  regexBackreference:
    "Line {{line}}: RE2 does not support regular-expression backreferences.",
  regexLookaround:
    "Line {{line}}: RE2 does not support lookahead or lookbehind.",
  ruleTooLong: "Line {{line}}: this rule exceeds 4096 UTF-8 bytes.",
  tooManyRules: "This section contains more than 1024 unique rules.",
  unknownPrefix: "Line {{line}}: {{value}} uses an unknown rule prefix.",
  unsupportedProtocol: "Protocol rule: {{value}} is not supported.",
};

export function RuleErrors({ issues }: { issues: RouteRuleIssue[] }) {
  const { t } = useTranslation("servers");
  if (issues.length === 0) return null;
  return (
    <div
      className="space-y-1 break-words text-destructive text-xs [overflow-wrap:anywhere]"
      role="alert"
    >
      {issues.map((issue) => (
        <p key={`${issue.index}-${issue.code}`}>
          {t(`route_rules.errors.${issue.code}`, ERROR_FALLBACKS[issue.code], {
            line: issue.line,
            value: issue.value,
          })}
        </p>
      ))}
    </div>
  );
}

function RuleTextarea({
  kind,
  label,
  description,
  placeholder,
  value,
  onChange,
  disabled = false,
}: {
  kind: Exclude<RouteRuleKind, "protocol">;
  label: string;
  description: string;
  placeholder: string;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const serializedValue = value.join("\n");
  const [draft, setDraft] = useState(serializedValue);
  const lastEmittedValue = useRef(serializedValue);
  const normalizedDraft = normalizeRuleLines(draft);
  const issues = validateRouteRules(kind, normalizedDraft);

  useEffect(() => {
    if (serializedValue === lastEmittedValue.current) return;
    lastEmittedValue.current = serializedValue;
    setDraft(serializedValue);
  }, [serializedValue]);

  function handleChange(nextDraft: string) {
    const normalized = normalizeRuleLines(nextDraft);
    setDraft(nextDraft);
    lastEmittedValue.current = normalized.join("\n");
    onChange(normalized);
  }

  return (
    <section className="min-w-0 space-y-2 rounded-lg border p-4">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-muted-foreground text-xs">{description}</p>
      <Textarea
        aria-invalid={issues.length > 0}
        className="field-sizing-fixed max-w-full"
        disabled={disabled}
        id={id}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={placeholder}
        rows={6}
        value={draft}
        wrap="soft"
      />
      <RuleErrors issues={issues} />
    </section>
  );
}

export function SingleRouteMatchEditor({
  kind,
  value,
  onChange,
}: {
  kind: RouteRuleKind;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const { t } = useTranslation("servers");
  const protocolId = useId();
  if (kind === "protocol") {
    return (
      <section className="space-y-2 rounded-lg border p-4">
        <div className="flex items-start gap-2">
          <Checkbox
            checked={value.includes("bittorrent")}
            id={protocolId}
            onCheckedChange={(checked) =>
              onChange(checked === true ? ["bittorrent"] : [])
            }
          />
          <div>
            <Label htmlFor={protocolId}>
              {t("route_rules.bittorrent_label", "BitTorrent / µTP")}
            </Label>
            <p className="text-muted-foreground text-xs">
              {t(
                "route_rules.protocol_description",
                "Matches detectable BitTorrent TCP and µTP traffic. Encrypted, obfuscated, or unknown encapsulations may not be detected."
              )}
            </p>
          </div>
        </div>
        <RuleErrors issues={validateRouteRules(kind, value)} />
      </section>
    );
  }
  return (
    <RuleTextarea
      description={
        kind === "domain"
          ? t(
              "route_rules.domain_description",
              "Accepted: example.com, full:, domain:, keyword:, suffix:, geosite:, regex: and regexp:."
            )
          : t(
              "route_rules.ip_description",
              "Accepted: geoip:private, IPv4/IPv6 addresses and CIDR."
            )
      }
      kind={kind}
      label={
        kind === "domain"
          ? t("route_rules.domain_label", "Domain / GeoSite / RE2 Regex")
          : t("route_rules.ip_label", "IP / GeoIP / CIDR")
      }
      onChange={onChange}
      placeholder={kind === "domain" ? "geosite:google-cn" : "geoip:private"}
      value={value}
    />
  );
}
