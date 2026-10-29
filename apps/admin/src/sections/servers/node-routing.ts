import { z } from "zod";
import { validateOutboundCapability } from "./outbound-capability";
import { outboundConnectionSchema } from "./outbound-config";
import {
  canonicalizeRouteRules,
  serializedJSONByteLength,
  utf8ByteLength,
  validateRouteRules,
} from "./route-rules";

const uuid =
  "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const outboundID = new RegExp(`^ob_${uuid}$`);
const ruleID = new RegExp(`^rr_${uuid}$`);

export const routingOutboundSchema = outboundConnectionSchema.extend({
  id: z.string().regex(outboundID),
});
export const routingRuleSchema = z.looseObject({
  id: z.string().regex(ruleID),
  enabled: z.boolean(),
  remark: z.string(),
  kind: z.enum(["domain", "ip", "protocol"]),
  values: z.array(z.string()),
  outbound_id: z.string(),
});
export const nodeRoutingSchema = z.looseObject({
  version: z.literal(1),
  outbounds: z.array(routingOutboundSchema),
  rules: z.array(routingRuleSchema),
  default_outbound_id: z.string(),
});

export type RoutingIssue = { code: string; path: string };
export const MAX_ROUTING_BYTES = 1024 * 1024;

// Server GET projects delivery identity into routing; it is read-only and
// must never be sent back as part of the persisted policy.
export function routingContentFromProjection(
  value: unknown
): API.NodeRouting | undefined {
  const parsed = nodeRoutingSchema.safeParse(value);
  if (!parsed.success) return;
  const content: Record<string, unknown> = { ...parsed.data };
  for (const field of [
    "mode",
    "source",
    "source_server_id",
    "source_revision",
    "local_transition_revision",
  ]) {
    Reflect.deleteProperty(content, field);
  }
  return content as API.NodeRouting;
}

export function routingIdentityFromProjection(
  value: unknown
): API.RoutingIdentity | undefined {
  const schema = z.object({
    mode: z.string().min(1),
    source: z.string().min(1),
    source_server_id: z.number().int().nonnegative().safe(),
    source_revision: z.number().int().nonnegative().safe(),
    local_transition_revision: z.number().int().nonnegative().safe(),
  });
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Validate without transforming: neither presence nor connection fields change. */
export function validateNodeRouting(value: unknown): RoutingIssue[] {
  const parsed = nodeRoutingSchema.safeParse(value);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      code: "invalidShape",
      path: issue.path.join("."),
    }));
  }
  const routing = parsed.data;
  const issues: RoutingIssue[] = [];
  const add = (code: string, path: string) => issues.push({ code, path });
  const ids = new Set(["direct", "block"]);
  const names = new Set<string>();
  if (routing.outbounds.length > 128) add("tooManyOutbounds", "outbounds");
  if (routing.rules.length > 512) add("tooManyRules", "rules");
  routing.outbounds.forEach((outbound, index) => {
    const path = `outbounds.${index + 1}`;
    if (ids.has(outbound.id)) add("duplicateId", path);
    ids.add(outbound.id);
    const name = outbound.name.trim();
    if (!name || [...name].length > 200 || /\p{Cc}/u.test(name))
      add("invalidName", path);
    if (names.has(name)) add("duplicateName", path);
    names.add(name);
    if (!outbound.protocol.trim() || /\p{Cc}/u.test(outbound.protocol))
      add("invalidProtocol", path);
    for (const issue of validateOutboundCapability(
      outbound as API.NodeRoutingOutbound
    ))
      add(issue.code, `${path}.${issue.field}`);
    if (
      [outbound.rules, outbound.ip_rules, outbound.protocol_rules].some(
        (rules) => rules && rules.length > 0
      )
    ) {
      add("nestedRules", path);
    }
    for (const field of ["settings", "stream_settings"] as const) {
      const raw = outbound[field];
      if (typeof raw === "string" && raw.trim()) {
        try {
          const json: unknown = JSON.parse(raw);
          if (!json || typeof json !== "object" || Array.isArray(json))
            add("invalidJSON", `${path}.${field}`);
        } catch {
          add("invalidJSON", `${path}.${field}`);
        }
      }
    }
  });
  if (!ids.has(routing.default_outbound_id))
    add("unknownOutbound", "default_outbound_id");
  const ruleIDs = new Set<string>();
  let inputValues = 0;
  let canonicalValues = 0;
  let matchBytes = 0;
  routing.rules.forEach((rule, index) => {
    const path = `rules.${index + 1}`;
    if (ruleIDs.has(rule.id)) add("duplicateId", path);
    ruleIDs.add(rule.id);
    if ([...rule.remark].length > 200 || /\p{Cc}/u.test(rule.remark))
      add("invalidRemark", path);
    if (!ids.has(rule.outbound_id)) add("unknownOutbound", path);
    if (rule.values.length > 1024) add("tooManyValues", path);
    inputValues += rule.values.length;
    const values = canonicalizeRouteRules(rule.kind, rule.values);
    if (!values.length) add("emptyValues", path);
    canonicalValues += values.length;
    matchBytes += values.reduce((sum, item) => sum + utf8ByteLength(item), 0);
    for (const issue of validateRouteRules(rule.kind, rule.values))
      add(issue.code, path);
  });
  if (inputValues > 8192 || canonicalValues > 8192)
    add("aggregateValues", "rules");
  if (matchBytes > 256 * 1024) add("aggregateBytes", "rules");
  try {
    if (serializedJSONByteLength(value) > MAX_ROUTING_BYTES)
      add("serializedTooLarge", "routing");
  } catch {
    add("invalidJSON", "routing");
  }
  return issues;
}

export function newRoutingID(prefix: "ob" | "rr") {
  // randomUUID is unavailable on some HTTP admin origins; getRandomValues is
  // still available there. Never fall back to a predictable ID.
  if (typeof crypto.randomUUID === "function")
    return `${prefix}_${crypto.randomUUID()}`;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! % 16) + 64;
  bytes[8] = (bytes[8]! % 64) + 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `${prefix}_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// The backend canonicalizes legacy wire-only match arrays to [] and omits
// zero-valued optional Go connection fields. This is comparison-only; the
// outgoing connection is never normalized or reconstructed.
const omittedConnectionFields = new Set([
  "user",
  "uuid",
  "cipher",
  "plugin",
  "security",
  "sni",
  "alpn",
  "allow_insecure",
  "fingerprint",
  "transport",
  "host",
  "path",
  "service_name",
  "xhttp_mode",
  "xhttp_extra",
  "flow",
  "encryption",
  "encryption_mode",
  "encryption_rtt",
  "encryption_ticket",
  "encryption_client_padding",
  "encryption_password",
  "multiplex",
  "uot",
  "uot_version",
  "congestion_controller",
  "udp_stream",
  "reduce_rtt",
  "heartbeat",
  "reality_public_key",
  "reality_short_id",
  "spider_x",
  "settings",
  "stream_settings",
]);

function canonicalConnection(outbound: API.NodeRoutingOutbound) {
  const result: Record<string, unknown> = {
    ...outbound,
    name: outbound.name.trim(),
    protocol: outbound.protocol.trim(),
  };
  for (const field of omittedConnectionFields) {
    const value = result[field];
    if (
      value === "" ||
      value === 0 ||
      value === false ||
      value == null ||
      (Array.isArray(value) && value.length === 0)
    )
      Reflect.deleteProperty(result, field);
  }
  for (const field of ["rules", "ip_rules", "protocol_rules"]) {
    if (
      result[field] == null ||
      (Array.isArray(result[field]) && result[field].length === 0)
    )
      result[field] = [];
  }
  if (result.plugin_opts == null) Reflect.deleteProperty(result, "plugin_opts");
  return result;
}

function sortedJSON(value: unknown): string {
  function sort(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, sort(entry)])
      );
    }
    return item;
  }
  return JSON.stringify(sort(value));
}

export function routingReadbackMatches(
  expected: API.NodeRouting,
  observed: unknown
) {
  const actual = routingContentFromProjection(observed);
  if (!actual) return false;
  const canonical = (policy: API.NodeRouting) => ({
    ...policy,
    outbounds: policy.outbounds.map(canonicalConnection),
    rules: policy.rules.map((rule) => ({
      ...rule,
      values: canonicalizeRouteRules(rule.kind, rule.values),
    })),
  });
  try {
    return sortedJSON(canonical(expected)) === sortedJSON(canonical(actual));
  } catch {
    return false;
  }
}

export function outboundReferences(routing: API.NodeRouting, id: string) {
  return {
    isDefault: routing.default_outbound_id === id,
    rules: routing.rules.filter((rule) => rule.outbound_id === id),
  };
}

export function moveRoutingRule(
  routing: API.NodeRouting,
  from: number,
  to: number
): API.NodeRouting {
  if (
    from < 0 ||
    to < 0 ||
    from >= routing.rules.length ||
    to >= routing.rules.length ||
    from === to
  )
    return routing;
  const rules = [...routing.rules];
  const [rule] = rules.splice(from, 1);
  rules.splice(to, 0, rule!);
  return { ...routing, rules };
}

export function isRoutingRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isRoutingConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const response = (error as { response?: { status?: unknown } }).response;
  return response?.status === 409;
}

export function isRoutingOutcomeUncertain(error: unknown) {
  if (!error || typeof error !== "object") return true;
  const status = (error as { response?: { status?: unknown } }).response
    ?.status;
  return typeof status !== "number" || status >= 500;
}

function validIdentity(a?: API.RoutingIdentity) {
  if (
    !(a && isRoutingRevision(a.source_revision)) ||
    a.source_revision === 0 ||
    !isRoutingRevision(a.local_transition_revision) ||
    !isRoutingRevision(a.source_server_id)
  )
    return false;
  if (a.mode === "ordered-v1-local")
    return (
      a.source === "server" &&
      a.source_server_id > 0 &&
      a.source_revision === a.local_transition_revision
    );
  if (a.mode === "ordered-v1-inherited")
    return a.source === "global" && a.source_server_id === 0;
  return false;
}

function sameIdentity(a?: API.RoutingIdentity, b?: API.RoutingIdentity) {
  return Boolean(
    validIdentity(a) &&
      validIdentity(b) &&
      a &&
      b &&
      a.mode === b.mode &&
      a.source === b.source &&
      a.source_server_id === b.source_server_id &&
      a.source_revision === b.source_revision &&
      a.local_transition_revision === b.local_transition_revision
  );
}

// Keep in sync with backend routingstatus.TTL (3 minutes). `known` already
// incorporates Redis freshness and multi-instance conflict at response time.
export const ROUTING_STATUS_TTL_MS = 3 * 60 * 1000;
/** A receipt is meaningful only for the exact effective candidate. */
export function routingApplicationState(
  status?: API.RoutingStatusView,
  expected?: API.RoutingIdentity,
  now = Date.now()
) {
  const report = status?.report;
  if (
    !(
      status?.known &&
      status.reporter_verified &&
      report &&
      isRoutingRevision(report.received_at)
    ) ||
    report.received_at === 0 ||
    report.received_at * 1000 > now ||
    report.received_at * 1000 + ROUTING_STATUS_TTL_MS <= now ||
    !sameIdentity(expected, expected)
  )
    return "unknown";
  if (sameIdentity(report.routing_error?.identity, expected)) return "failed";
  if (sameIdentity(report.routing_pending, expected)) return "pending";
  if (sameIdentity(report.routing_applied, expected)) return "applied";
  return "unknown";
}
