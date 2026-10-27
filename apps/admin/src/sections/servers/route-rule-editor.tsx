"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { Icon } from "@workspace/ui/composed/icon";
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
  serializedTooLarge:
    "This section's serialized JSON must be below 61440 UTF-8 bytes.",
  tooManyRules: "This section contains more than 1024 unique rules.",
  unknownPrefix: "Line {{line}}: {{value}} uses an unknown rule prefix.",
  unsupportedProtocol: "Protocol rule: {{value}} is not supported.",
};

function RuleErrors({ issues }: { issues: RouteRuleIssue[] }) {
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

export function StructuredRulesCapabilityNotice() {
  const { t } = useTranslation("servers");
  return (
    <Alert>
      <Icon icon="mdi:information-outline" />
      <AlertTitle>
        {t(
          "route_rules.capability_title",
          "Backend upgrade required for structured route rules"
        )}
      </AlertTitle>
      <AlertDescription>
        {t(
          "route_rules.capability_description",
          "IP and protocol match groups are read-only. Legacy domain rules can still be edited and saved."
        )}
      </AlertDescription>
    </Alert>
  );
}

export function RouteMatchGroupsEditor({
  domains,
  ips,
  protocols,
  onDomainsChange,
  onIPsChange,
  onProtocolsChange,
  structuredRulesSupported,
  showCapabilityNotice = false,
}: {
  domains: string[];
  ips: string[];
  protocols: string[];
  onDomainsChange: (value: string[]) => void;
  onIPsChange: (value: string[]) => void;
  onProtocolsChange: (value: string[]) => void;
  structuredRulesSupported: boolean;
  showCapabilityNotice?: boolean;
}) {
  const { t } = useTranslation("servers");
  const protocolId = useId();
  const protocolIssues = validateRouteRules("protocol", protocols);
  const bittorrent = protocols.includes("bittorrent");

  function setBittorrent(checked: boolean) {
    const withoutBittorrent = protocols.filter((item) => item !== "bittorrent");
    onProtocolsChange(
      checked ? [...withoutBittorrent, "bittorrent"] : withoutBittorrent
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      {showCapabilityNotice && !structuredRulesSupported ? (
        <StructuredRulesCapabilityNotice />
      ) : null}
      <RuleTextarea
        description={t(
          "route_rules.domain_description",
          "Accepted: example.com, full:, domain:, keyword:, suffix:, geosite:, regex: and regexp:. One terminal DNS root dot is removed; keywords cannot contain whitespace. RE2 regex checks domains only, not URL paths or content."
        )}
        kind="domain"
        label={t("route_rules.domain_label", "Domain / GeoSite / RE2 Regex")}
        onChange={onDomainsChange}
        placeholder={t(
          "route_rules.domain_placeholder",
          "geosite:category-pt\nsuffix:example.com\nregex:(?i)(^|\\.)(tracker|announce)\\."
        )}
        value={domains}
      />
      <RuleTextarea
        description={t(
          "route_rules.ip_description",
          "Accepted: geoip:private, IPv4/IPv6 addresses, and CIDR such as 10.0.0.0/8 or fc00::/7."
        )}
        disabled={!structuredRulesSupported}
        kind="ip"
        label={t("route_rules.ip_label", "IP / GeoIP / CIDR")}
        onChange={onIPsChange}
        placeholder={t(
          "route_rules.ip_placeholder",
          "geoip:private\n10.0.0.0/8\nfc00::/7"
        )}
        value={ips}
      />
      <section className="space-y-2 rounded-lg border p-4">
        <p className="font-medium text-sm">
          {t("route_rules.protocol_label", "Protocol")}
        </p>
        <div className="flex items-start gap-2">
          <Checkbox
            aria-invalid={protocolIssues.length > 0}
            checked={bittorrent}
            disabled={!structuredRulesSupported}
            id={protocolId}
            onCheckedChange={(checked) => setBittorrent(checked === true)}
          />
          <div className="space-y-1">
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
        <RuleErrors issues={protocolIssues} />
      </section>
    </div>
  );
}
