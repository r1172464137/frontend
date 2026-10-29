import { canonicalDNSAddress } from "./dns-config";
import { isRoutingRevision, routingReadbackMatches } from "./node-routing";
import { canonicalizeRouteRules } from "./route-rules";

export { dnsIsValid } from "./dns-config";

export function safeBackendError(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  const body = (
    error as {
      response?: {
        data?: { code?: unknown; msg?: unknown; message?: unknown };
      };
    }
  ).response?.data;
  if (
    ![400, 140_001, 140_002, 140_003, 160_001, 160_003].includes(
      Number(body?.code)
    )
  )
    return;
  const value = typeof body?.msg === "string" ? body.msg : body?.message;
  if (typeof value !== "string" || !value.trim()) return;
  return value
    .replace(/\p{Cc}/gu, " ")
    .replace(
      /(["']?\b[a-z0-9_.-]*(?:password|secret|token|authorization|uuid|key)[a-z0-9_.-]*["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)/gi,
      "$1[redacted]"
    )
    .replace(/(https?:\/\/)[^\s/@]+@/gi, "$1[redacted]@")
    .slice(0, 500);
}

export function isDefiniteRejection(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const response = (
    error as { response?: { status?: unknown; data?: { code?: unknown } } }
  ).response;
  return (
    response?.status === 409 ||
    response?.status === 422 ||
    (response?.status === 200 && response.data?.code === 400)
  );
}

/** The node-config API is presence-sensitive. Only requested fields are read back. */
export function editableDNS(
  value: API.NodeDNS[] | null | undefined
): API.NodeDNS[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    proto:
      typeof item?.proto === "string" && item.proto.trim() ? item.proto : "udp",
    address: typeof item?.address === "string" ? item.address : "",
    server_name: typeof item?.server_name === "string" ? item.server_name : "",
    domains: Array.isArray(item?.domains) ? item.domains : [],
  }));
}

function canonicalDNS(dns: API.NodeDNS[] | null | undefined) {
  if (!Array.isArray(dns)) return null;
  return dns.map((entry) => ({
    proto: entry.proto.trim().toLowerCase() || "udp",
    address: canonicalDNSAddress(entry.address) ?? entry.address,
    server_name: (entry.server_name || "").trim(),
    domains: canonicalizeRouteRules("domain", entry.domains || []),
  }));
}

export function globalWriteMatches(
  payload: API.UpdateNodeConfigRequest,
  current: API.NodeConfig,
  previousRevision: number
) {
  for (const field of [
    "node_secret",
    "node_pull_interval",
    "node_push_interval",
    "traffic_report_threshold",
    "ip_strategy",
  ] as const) {
    if (Object.hasOwn(payload, field) && payload[field] !== current[field])
      return false;
  }
  if (
    Object.hasOwn(payload, "dns") &&
    JSON.stringify(canonicalDNS(payload.dns)) !==
      JSON.stringify(canonicalDNS(current.dns))
  )
    return false;
  if (
    payload.routing &&
    !(
      isRoutingRevision(current.routing_revision) &&
      current.routing_revision > previousRevision &&
      routingReadbackMatches(payload.routing, current.routing)
    )
  )
    return false;
  return true;
}

export function serverWriteMatches(
  payload: API.UpdateServerNodeConfigRequest,
  current: API.GetServerNodeConfigResponse,
  previousRevision: number
) {
  const actual = current.override;
  if (Object.hasOwn(payload, "inherit_ip_strategy")) {
    if (payload.inherit_ip_strategy !== actual.inherit_ip_strategy)
      return false;
    if (
      !payload.inherit_ip_strategy &&
      Object.hasOwn(payload, "ip_strategy") &&
      payload.ip_strategy !== actual.ip_strategy
    )
      return false;
  }
  if (Object.hasOwn(payload, "inherit_dns")) {
    if (payload.inherit_dns !== actual.inherit_dns) return false;
    if (
      !payload.inherit_dns &&
      Object.hasOwn(payload, "dns") &&
      JSON.stringify(canonicalDNS(payload.dns)) !==
        JSON.stringify(canonicalDNS(actual.dns))
    )
      return false;
  }
  if (payload.routing || payload.inherit_routing === true) {
    if (
      !(
        isRoutingRevision(actual.routing_revision) &&
        actual.routing_revision > previousRevision
      )
    )
      return false;
    if (payload.inherit_routing === true)
      return actual.inherit_routing && actual.routing === null;
    return Boolean(
      payload.routing &&
        !actual.inherit_routing &&
        routingReadbackMatches(payload.routing, actual.routing)
    );
  }
  return true;
}
