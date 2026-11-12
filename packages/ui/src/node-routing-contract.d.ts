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
      // Empty means every account.
      user_ids: number[];
      [field: string]: unknown;
    };
    type NodeRoutingOutbound = Omit<NodeOutbound, "rules" | "plugin_opts"> & {
      id: string;
      rules?: string[];
      plugin_opts?: unknown;
      via_outbound_id?: string;
      [field: string]: unknown;
    };
    type RoutingDNSResolver = {
      id: string;
      protocol: "udp" | "tcp" | "https" | "system";
      address: string;
      domains: string[];
      outbound_id: string;
      bootstrap_ip?: string;
    };
    type NodeRoutingDNS = {
      query_strategy: "UseIP" | "UseIPv4" | "UseIPv6";
      resolvers: RoutingDNSResolver[];
    };
    type NodeRouting = {
      version: 3;
      outbounds: NodeRoutingOutbound[];
      rules: NodeRouteRule[];
      default_outbound_id: string;
      user_defaults: { user_id: number; outbound_id: string }[];
      dns: NodeRoutingDNS;
      target_ip_preference: "none" | "prefer_ipv4" | "prefer_ipv6";
      [field: string]: unknown;
    };
    type RoutingIdentity = {
      mode: string;
      source: string;
      source_server_id: number;
      source_revision: number;
      local_transition_revision: number;
      snapshot_id?: string;
    };
    type NodeRoutingProjection = NodeRouting & RoutingIdentity;
    type RoutingStatusView = {
      known: boolean;
      reporter_verified: boolean;
      desired_snapshot_id?: string | null;
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
      synced: boolean;
    };
    type NodeConfig = {
      routing: NodeRouting;
      routing_revision: number;
      routing_mode: string;
      routing_capabilities: number[];
      node_pull_interval: number;
      node_push_interval: number;
      node_secret: string;
      traffic_report_threshold: number;
    };
    type UpdateNodeConfigRequest = {
      routing?: NodeRouting;
      routing_revision?: number;
      node_pull_interval?: number;
      node_push_interval?: number;
      node_secret?: string;
      traffic_report_threshold?: number;
    };
    type ServerNodeConfigOverride = {
      inherit_routing: boolean;
      routing: NodeRouting | null;
      routing_revision: number;
    };
    type ServerNodeConfigValues = {
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
      inherit_routing?: boolean;
      routing?: NodeRouting;
      routing_revision?: number;
      server_id: number;
    };
  }
}
