import { postServerCreate } from "@workspace/ui/services/admin/admin";
import {
  getServerNodeConfig,
  postServerNodeConfigUpdate,
} from "@workspace/ui/services/node-config";
import {
  isRoutingRevision,
  routingReadbackMatches,
  validateNodeRouting,
} from "./node-routing";

const copyRequestOptions = { timeout: 15_000, skipErrorHandler: true };

export type ServerCopyTask = {
  target: API.Server;
  desired: API.ServerNodeConfigOverride;
};
export type BeginCopyResult =
  | { kind: "created"; task: ServerCopyTask }
  | { kind: "source_error" }
  | { kind: "invalid_source" }
  | { kind: "create_unknown" };

/** Create exactly once. A missing ID or transport error is never retried here. */
export async function beginServerCopy(
  source: API.Server
): Promise<BeginCopyResult> {
  let config: API.GetServerNodeConfigResponse | undefined;
  try {
    config = (
      await getServerNodeConfig({ server_id: source.id }, copyRequestOptions)
    ).data.data;
  } catch {
    return { kind: "source_error" };
  }
  if (
    !(
      config?.override && isRoutingRevision(config.override.routing_revision)
    ) ||
    config.override.inherit_routing !== (config.override.routing === null) ||
    (!config.override.inherit_routing &&
      (!config.override.routing ||
        validateNodeRouting(config.override.routing).length > 0))
  ) {
    return { kind: "invalid_source" };
  }
  const desired = structuredClone(config.override);
  const body: API.CreateServerRequest = {
    name: source.name,
    country: source.country,
    city: source.city,
    address: source.address,
    protocols: source.protocols || [],
  };
  try {
    const result = await postServerCreate(body, copyRequestOptions);
    const id = result.data.data?.id;
    if (!(Number.isSafeInteger(id) && id) || id <= 0 || id === source.id)
      return { kind: "create_unknown" };
    return {
      kind: "created",
      task: { target: { ...source, id }, desired },
    };
  } catch {
    return { kind: "create_unknown" };
  }
}

function routingMatches(
  task: ServerCopyTask,
  current: API.ServerNodeConfigOverride
) {
  return task.desired.inherit_routing
    ? current.inherit_routing && current.routing === null
    : Boolean(
        task.desired.routing &&
          !current.inherit_routing &&
          routingReadbackMatches(task.desired.routing, current.routing)
      );
}
function copyMatches(
  task: ServerCopyTask,
  current: API.GetServerNodeConfigResponse
) {
  return routingMatches(task, current.override);
}

/** Retry only configuration on the already-created server; never call create. */
export async function applyServerCopy(task: ServerCopyTask): Promise<boolean> {
  let initial: API.GetServerNodeConfigResponse | undefined;
  try {
    initial = (
      await getServerNodeConfig(
        { server_id: task.target.id },
        copyRequestOptions
      )
    ).data.data;
  } catch {
    return false;
  }
  if (
    !(initial?.override && isRoutingRevision(initial.override.routing_revision))
  )
    return false;
  const revision = initial.override.routing_revision;
  const payload: API.UpdateServerNodeConfigRequest = {
    server_id: task.target.id,
  };
  if (!routingMatches(task, initial.override)) {
    payload.routing_revision = revision;
    if (task.desired.inherit_routing) payload.inherit_routing = true;
    else if (task.desired.routing) payload.routing = task.desired.routing;
    else return false;
  }
  if (Object.keys(payload).length === 1) return copyMatches(task, initial);
  try {
    await postServerNodeConfigUpdate(payload, copyRequestOptions);
  } catch {
    /* A post-commit error still needs authoritative readback. */
  }
  try {
    const readback = (
      await getServerNodeConfig(
        { server_id: task.target.id },
        copyRequestOptions
      )
    ).data.data;
    return Boolean(readback && copyMatches(task, readback));
  } catch {
    return false;
  }
}
