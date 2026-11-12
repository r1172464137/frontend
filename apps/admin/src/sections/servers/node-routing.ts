import { z } from "zod";
import { canonicalDNSAddress } from "./dns-config";
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
  via_outbound_id: z.string().optional(),
});
export const routingRuleSchema = z.looseObject({
  id: z.string().regex(ruleID),
  enabled: z.boolean(),
  remark: z.string(),
  kind: z.enum(["domain", "ip", "protocol"]),
  values: z.array(z.string()),
  outbound_id: z.string(),
  user_ids: z.array(z.number().int().positive().safe()),
});
export const nodeRoutingSchema = z.looseObject({
  version: z.literal(3),
  outbounds: z.array(routingOutboundSchema),
  rules: z.array(routingRuleSchema),
  default_outbound_id: z.string(),
  user_defaults: z.array(
    z.looseObject({
      user_id: z.number().int().positive().safe(),
      outbound_id: z.string(),
    })
  ),
  dns: z.looseObject({
    query_strategy: z.enum(["UseIP", "UseIPv4", "UseIPv6"]),
    resolvers: z.array(
      z.looseObject({
        id: z.string().regex(new RegExp(`^dns_${uuid}$`)),
        protocol: z.enum(["udp", "tcp", "https", "system"]),
        address: z.string(),
        domains: z.array(z.string()),
        outbound_id: z.string(),
        bootstrap_ip: z.string().optional(),
      })
    ),
  }),
  target_ip_preference: z.enum(["none", "prefer_ipv4", "prefer_ipv6"]),
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
    "snapshot_id",
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

function rawFrontHop(outbound: API.NodeRoutingOutbound): {
  tag?: string;
  invalid?: boolean;
} {
  if (!outbound.stream_settings) return {};
  try {
    const stream: unknown = JSON.parse(outbound.stream_settings);
    if (!stream || typeof stream !== "object" || Array.isArray(stream))
      return {};
    const sockopt = Object.entries(stream).find(
      ([key]) => key.toLowerCase() === "sockopt"
    )?.[1];
    if (sockopt == null) return {};
    if (typeof sockopt !== "object" || Array.isArray(sockopt))
      return { invalid: true };
    const tag = Object.entries(sockopt).find(
      ([key]) => key.toLowerCase() === "dialerproxy"
    )?.[1];
    if (tag == null || tag === "") return {};
    return typeof tag === "string" ? { tag } : { invalid: true };
  } catch {
    return {};
  }
}

function rawFrontHopTarget(
  outbound: API.NodeRoutingOutbound
): string | undefined {
  const { tag } = rawFrontHop(outbound);
  return tag?.startsWith("routing_") ? tag.slice("routing_".length) : undefined;
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
  const custom = new Map(
    routing.outbounds.map((outbound) => [outbound.id, outbound])
  );
  const links = new Map<string, string>();
  for (const outbound of routing.outbounds) {
    const raw = rawFrontHop(outbound as API.NodeRoutingOutbound);
    const rawTarget = raw.tag?.startsWith("routing_")
      ? raw.tag.slice("routing_".length)
      : undefined;
    if (raw.invalid)
      add("invalidRawSettings", `outbounds.${outbound.id}.stream_settings`);
    if (raw.tag && outbound.via_outbound_id)
      add("chainConflict", `outbounds.${outbound.id}`);
    if (
      raw.tag &&
      raw.tag !== "Default" &&
      raw.tag !== "block" &&
      (!(rawTarget && custom.has(rawTarget)))
    )
      add("unknownOutbound", `outbounds.${outbound.id}.stream_settings`);
    links.set(
      outbound.id,
      outbound.via_outbound_id ||
        (rawTarget && custom.has(rawTarget) ? rawTarget : "")
    );
  }
  for (const outbound of routing.outbounds) {
    const seen = new Set<string>();
    let current: typeof outbound | undefined = outbound;
    while (current && links.get(current.id)) {
      if (seen.has(current.id)) {
        add("chainCycle", `outbounds.${outbound.id}`);
        break;
      }
      seen.add(current.id);
      const next = custom.get(links.get(current.id)!);
      if (!next) {
        add("unknownOutbound", `outbounds.${outbound.id}`);
        break;
      }
      current = next;
    }
  }
  const users = new Set<number>();
  for (const entry of routing.user_defaults) {
    if (users.has(entry.user_id)) add("duplicateUser", "user_defaults");
    users.add(entry.user_id);
    if (!ids.has(entry.outbound_id)) add("unknownOutbound", "user_defaults");
  }
  const resolvers = routing.dns.resolvers;
  {
    if (!resolvers.length || resolvers.length > 128)
      add("invalidDNS", "dns.resolvers");
    const dnsIDs = new Set<string>();
    resolvers.forEach((resolver, index) => {
      const path = `dns.resolvers.${index + 1}`;
      const last = index === resolvers.length - 1;
      if (dnsIDs.has(resolver.id)) add("duplicateId", path);
      dnsIDs.add(resolver.id);
      // The system resolver is only the last (default) one, direct, no address.
      if (
        resolver.protocol === "system" &&
        (!last ||
          resolver.address.trim() ||
          resolver.bootstrap_ip ||
          resolver.outbound_id !== "direct")
      )
        add("invalidDNS", path);
      if (
        (resolver.protocol !== "system" && !resolver.address.trim()) ||
        (index === resolvers.length - 1
          ? resolver.domains.length !== 0
          : resolver.domains.length === 0) ||
        resolver.domains.length > 1024 ||
        validateRouteRules("domain", resolver.domains).length
      )
        add("invalidDNS", path);
      if (!ids.has(resolver.outbound_id) || resolver.outbound_id === "block")
        add("unknownOutbound", path);
    });
  }
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
    if (rule.user_ids && new Set(rule.user_ids).size !== rule.user_ids.length)
      add("duplicateUser", path);
    if (rule.values.length > 1024) add("tooManyValues", path);
    inputValues += rule.values.length;
    const values = canonicalizeRouteRules(rule.kind, rule.values);
    if (!values.length) add("emptyValues", path);
    canonicalValues += values.length;
    matchBytes += values.reduce((sum, item) => sum + utf8ByteLength(item), 0);
    for (const issue of validateRouteRules(rule.kind, rule.values))
      add(issue.code, path);
  });
  for (const resolver of resolvers) {
    inputValues += resolver.domains.length;
    const values = canonicalizeRouteRules("domain", resolver.domains);
    canonicalValues += values.length;
    matchBytes += values.reduce((sum, item) => sum + utf8ByteLength(item), 0);
  }
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

export function newRoutingID(prefix: "ob" | "rr" | "dns") {
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
  "via_outbound_id",
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
    rules: policy.rules.map((rule) => {
      const result = {
        ...rule,
        values: canonicalizeRouteRules(rule.kind, rule.values),
      };
      result.user_ids = [...new Set(result.user_ids ?? [])].sort(
        (a, b) => a - b
      );
      return result;
    }),
    user_defaults: [...policy.user_defaults].sort(
      (a, b) => a.user_id - b.user_id
    ),
    ...(policy.dns
      ? {
          dns: {
            ...policy.dns,
            resolvers: policy.dns.resolvers.map((resolver) => {
              const result = {
                ...resolver,
                domains: canonicalizeRouteRules("domain", resolver.domains),
              };
              if (
                resolver.protocol !== "https" &&
                resolver.address === resolver.address.trim()
              )
                result.address =
                  canonicalDNSAddress(resolver.address) ?? resolver.address;
              if (!result.bootstrap_ip) result.bootstrap_ip = undefined;
              else if (z.ipv6().safeParse(result.bootstrap_ip).success)
                result.bootstrap_ip =
                  canonicalDNSAddress(result.bootstrap_ip) ??
                  result.bootstrap_ip;
              return result;
            }),
          },
        }
      : {}),
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
    chains: routing.outbounds.filter(
      (outbound) =>
        outbound.via_outbound_id === id || rawFrontHopTarget(outbound) === id
    ),
    users: routing.user_defaults.filter((entry) => entry.outbound_id === id),
    resolvers: routing.dns.resolvers.filter(
      (entry) => entry.outbound_id === id
    ),
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

// Keep in sync with backend routingstatus.TTL (3 minutes). `known` already
// incorporates Redis freshness and multi-instance conflict at response time.
export const ROUTING_STATUS_TTL_MS = 3 * 60 * 1000;
/**
 * The backend decides `synced` (applied identity equals the desired snapshot
 * in every field); pending/failed are shown only for that same snapshot.
 */
export function routingApplicationState(
  status?: API.RoutingStatusView,
  now = Date.now()
) {
  const report = status?.report;
  const desired = status?.desired_snapshot_id;
  if (
    !(
      status?.known &&
      status.reporter_verified &&
      report &&
      desired &&
      isRoutingRevision(report.received_at)
    ) ||
    report.received_at === 0 ||
    report.received_at * 1000 > now ||
    report.received_at * 1000 + ROUTING_STATUS_TTL_MS <= now
  )
    return "unknown";
  if (status.synced) return "applied";
  if (report.routing_error?.identity?.snapshot_id === desired) return "failed";
  if (report.routing_pending?.snapshot_id === desired) return "pending";
  return "unknown";
}
