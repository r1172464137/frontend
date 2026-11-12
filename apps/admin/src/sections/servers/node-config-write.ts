import { isRoutingRevision, routingReadbackMatches } from "./node-routing";

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
    ![
      400, 140_001, 140_002, 140_003, 140_005, 160_001, 160_003, 160_004,
    ].includes(Number(body?.code))
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

// Saving identical routing content keeps the revision (backend no-op), so the
// readback check accepts an unchanged revision when the content matches.
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
  ] as const) {
    if (Object.hasOwn(payload, field) && payload[field] !== current[field])
      return false;
  }
  if (
    payload.routing &&
    !(
      isRoutingRevision(current.routing_revision) &&
      current.routing_revision >= previousRevision &&
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
  if (payload.routing || payload.inherit_routing === true) {
    if (
      !(
        isRoutingRevision(actual.routing_revision) &&
        actual.routing_revision >= previousRevision
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
