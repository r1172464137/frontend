// Hand-maintained narrow management types. The OpenAPI generator reserves
// these names by mapping wire DTOs to Generated*; regenerating never erases
// nullable/presence guarantees or the single-kind routing union.
export {};
declare global {
  namespace API {
    type NodeRouteRule = {
      id: string;
      enabled: boolean;
      remark: string;
      kind: "domain" | "ip" | "protocol";
      values: string[];
      outbound_id: string;
      [field: string]: unknown;
    };
    type NodeRoutingOutbound = Omit<NodeOutbound, "rules" | "plugin_opts"> & {
      id: string;
      rules?: string[];
      plugin_opts?: unknown;
      [field: string]: unknown;
    };
    type NodeRouting = {
      version: 1;
      outbounds: NodeRoutingOutbound[];
      rules: NodeRouteRule[];
      default_outbound_id: string;
      [field: string]: unknown;
    };
    type RoutingIdentity = {
      mode: string;
      source: string;
      source_server_id: number;
      source_revision: number;
      local_transition_revision: number;
    };
    type NodeRoutingProjection = NodeRouting & RoutingIdentity;
    type RoutingStatusView = {
      known: boolean;
      reporter_verified: boolean;
      report?: {
        routing_version: number;
        routing_sequence?: number;
        instance_id?: string;
        routing_applied?: RoutingIdentity;
        routing_pending?: RoutingIdentity;
        routing_error?: {
          identity?: RoutingIdentity;
          stage: string;
          message: string;
        };
        received_at: number;
        liveness_at?: number;
        updated_at: number;
        conflict?: boolean;
      };
    };
    type NodeConfig = {
      routing: NodeRouting;
      routing_revision: number;
      routing_mode: string;
      routing_capabilities: number[];
      dns?: NodeDNS[] | null;
      ip_strategy: string;
      node_pull_interval: number;
      node_push_interval: number;
      node_secret: string;
      traffic_report_threshold: number;
    };
    type UpdateNodeConfigRequest = {
      routing?: NodeRouting;
      routing_revision?: number;
      dns?: NodeDNS[];
      ip_strategy?: string;
      node_pull_interval?: number;
      node_push_interval?: number;
      node_secret?: string;
      traffic_report_threshold?: number;
    };
    type ServerNodeConfigOverride = {
      dns?: NodeDNS[] | null;
      inherit_dns: boolean;
      inherit_ip_strategy: boolean;
      inherit_routing: boolean;
      ip_strategy: string;
      routing: NodeRouting | null;
      routing_revision: number;
    };
    type ServerNodeConfigValues = {
      dns?: NodeDNS[] | null;
      ip_strategy: string;
      routing: NodeRoutingProjection;
      routing_mode: string;
      routing_revision: number;
    };
    type GetServerNodeConfigResponse = {
      effective: ServerNodeConfigValues;
      global: ServerNodeConfigValues;
      override: ServerNodeConfigOverride;
      routing_status: RoutingStatusView;
    };
    type UpdateServerNodeConfigRequest = {
      dns?: NodeDNS[];
      inherit_dns?: boolean;
      inherit_ip_strategy?: boolean;
      inherit_routing?: boolean;
      ip_strategy?: string;
      routing?: NodeRouting;
      routing_revision?: number;
      server_id: number;
    };
  }
}
