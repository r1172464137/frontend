// Test-only: completes a routing package with the format 3 fields a test
// does not exercise (no account defaults, system DNS, no IP preference,
// rules for every account).
export const systemDNS = (): API.NodeRoutingDNS => ({
  query_strategy: "UseIP",
  resolvers: [
    {
      id: "dns_00000000-0000-4000-8000-000000000009",
      protocol: "system",
      address: "",
      domains: [],
      outbound_id: "direct",
    },
  ],
});

type Draft = Omit<
  API.NodeRouting,
  "version" | "user_defaults" | "dns" | "target_ip_preference" | "rules"
> &
  Partial<
    Pick<API.NodeRouting, "user_defaults" | "dns" | "target_ip_preference">
  > & {
    version?: number;
    rules: (Omit<API.NodeRouteRule, "user_ids"> & { user_ids?: number[] })[];
  };

export function v3(draft: Draft): API.NodeRouting {
  return {
    user_defaults: [],
    dns: systemDNS(),
    target_ip_preference: "none",
    ...draft,
    version: 3,
    rules: draft.rules.map((rule) => ({
      ...rule,
      user_ids: rule.user_ids ?? [],
    })),
  } as API.NodeRouting;
}
