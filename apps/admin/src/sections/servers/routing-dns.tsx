import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { newRoutingID, validateNodeRouting } from "./node-routing";

function Domains({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const serialized = value.join("\n");
  const [text, setText] = useState(serialized);
  const lastEmitted = useRef(serialized);
  const { t } = useTranslation("servers");
  useEffect(() => {
    if (serialized !== lastEmitted.current) {
      lastEmitted.current = serialized;
      setText(serialized);
    }
  }, [serialized]);
  return (
    <Textarea
      aria-label={t("ordered_routing.dns_domains", "Domains (one per line)")}
      onChange={(e) => {
        const lines = e.target.value
          .split("\n")
          .map((v) => v.trim())
          .filter(Boolean);
        setText(e.target.value);
        lastEmitted.current = lines.join("\n");
        onChange(lines);
      }}
      value={text}
    />
  );
}
export function RoutingDNS({
  value,
  onChange,
  readOnly = false,
}: {
  value: API.NodeRouting;
  onChange: (value: API.NodeRouting) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation("servers");
  const policy = value.dns;
  const update = (dns: API.NodeRoutingDNS) => onChange({ ...value, dns });
  const patch = (index: number, changes: Partial<API.RoutingDNSResolver>) => {
    update({
      ...policy,
      resolvers: policy.resolvers.map((resolver, i) =>
        i === index ? { ...resolver, ...changes } : resolver
      ),
    });
  };
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">
        {t("ordered_routing.dns_policy", "Routing DNS policy")}
      </h3>
      <p className="text-muted-foreground text-sm">
        {t(
          "ordered_routing.dns_policy_hint",
          "Resolvers are matched in order; the last resolver is the default. Failure does not fall back to another resolver or outbound."
        )}
      </p>
      <label className="block text-sm">
        {t("ordered_routing.target_ip_preference", "Target IP preference")}
        <select
          className="mt-1 h-9 w-full rounded-md border bg-background px-3"
          disabled={readOnly}
          onChange={(e) =>
            onChange({
              ...value,
              target_ip_preference: e.target
                .value as API.NodeRouting["target_ip_preference"],
            })
          }
          value={value.target_ip_preference}
        >
          <option value="none">
            {t("ordered_routing.ip_none", "No preference")}
          </option>
          <option value="prefer_ipv4">
            {t("server_config.fields.ip_strategy_ipv4", "Prefer IPv4")}
          </option>
          <option value="prefer_ipv6">
            {t("server_config.fields.ip_strategy_ipv6", "Prefer IPv6")}
          </option>
        </select>
      </label>
      {validateNodeRouting(value)
        .filter((issue) => issue.path.startsWith("dns"))
        .map((issue, index) => (
          <p
            className="text-destructive text-sm"
            key={`${issue.path}-${index}`}
            role="alert"
          >
            {issue.path}:{" "}
            {t(`ordered_routing.errors.${issue.code}`, issue.code)}
          </p>
        ))}
      {
        <fieldset className="space-y-3" disabled={readOnly}>
          <label className="block text-sm">
            {t("ordered_routing.query_strategy", "Query strategy")}
            <select
              className="mt-1 h-9 w-full rounded-md border bg-background px-3"
              onChange={(e) =>
                update({
                  ...policy,
                  query_strategy: e.target
                    .value as typeof policy.query_strategy,
                })
              }
              value={policy.query_strategy}
            >
              <option>UseIP</option>
              <option>UseIPv4</option>
              <option>UseIPv6</option>
            </select>
          </label>
          {policy.resolvers.map((resolver, index) => (
            <div className="space-y-2 rounded border p-3" key={resolver.id}>
              <div className="flex flex-wrap items-center gap-2">
                <strong>
                  {index + 1}.{" "}
                  {index === policy.resolvers.length - 1
                    ? t("ordered_routing.dns_default", "Default resolver")
                    : t("ordered_routing.dns_rule", "Resolver rule")}
                </strong>
                <Button
                  aria-label={t(
                    "ordered_routing.dns_move_up",
                    "Move resolver {{number}} up",
                    { number: index + 1 }
                  )}
                  disabled={
                    index === 0 || index === policy.resolvers.length - 1
                  }
                  onClick={() => {
                    const resolvers = [...policy.resolvers];
                    [resolvers[index - 1], resolvers[index]] = [
                      resolvers[index]!,
                      resolvers[index - 1]!,
                    ];
                    update({ ...policy, resolvers });
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  ↑
                </Button>
                <Button
                  aria-label={t(
                    "ordered_routing.dns_move_down",
                    "Move resolver {{number}} down",
                    { number: index + 1 }
                  )}
                  disabled={index >= policy.resolvers.length - 2}
                  onClick={() => {
                    const resolvers = [...policy.resolvers];
                    [resolvers[index], resolvers[index + 1]] = [
                      resolvers[index + 1]!,
                      resolvers[index]!,
                    ];
                    update({ ...policy, resolvers });
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  ↓
                </Button>
                <Button
                  disabled={index === policy.resolvers.length - 1}
                  onClick={() =>
                    update({
                      ...policy,
                      resolvers: policy.resolvers.filter((_, i) => i !== index),
                    })
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("delete", "Delete")}
                </Button>
              </div>
              <label className="block text-sm">
                {t("ordered_routing.dns_protocol", "Resolver protocol")}
                <select
                  className="mt-1 h-9 w-full rounded-md border bg-background px-3"
                  onChange={(e) => {
                    const protocol = e.target
                      .value as API.RoutingDNSResolver["protocol"];
                    patch(
                      index,
                      protocol === "system"
                        ? {
                            protocol,
                            address: "",
                            bootstrap_ip: undefined,
                            outbound_id: "direct",
                          }
                        : { protocol }
                    );
                  }}
                  value={resolver.protocol}
                >
                  <option>udp</option>
                  <option>tcp</option>
                  <option>https</option>
                  {index === policy.resolvers.length - 1 && (
                    <option value="system">
                      {t("ordered_routing.dns_system", "system (node OS)")}
                    </option>
                  )}
                </select>
              </label>
              {resolver.protocol !== "system" && (
                <>
                  <label className="block text-sm">
                    {t("ordered_routing.dns_address", "Resolver address")}
                    <Input
                      onChange={(e) =>
                        patch(index, { address: e.target.value })
                      }
                      placeholder={
                        resolver.protocol === "https"
                          ? "https://dns.example.com/dns-query"
                          : "192.0.2.53:53"
                      }
                      value={resolver.address}
                    />
                  </label>
                  <label className="block text-sm">
                    {t(
                      "ordered_routing.bootstrap_ip",
                      "Bootstrap IP (hostname resolver)"
                    )}
                    <Input
                      onChange={(e) =>
                        patch(index, { bootstrap_ip: e.target.value })
                      }
                      value={resolver.bootstrap_ip || ""}
                    />
                  </label>
                </>
              )}
              {index < policy.resolvers.length - 1 && (
                <label className="block text-sm">
                  {t("ordered_routing.dns_domains", "Domains (one per line)")}
                  <Domains
                    onChange={(domains) => patch(index, { domains })}
                    value={resolver.domains}
                  />
                </label>
              )}
              <label className="block text-sm">
                {t("ordered_routing.dns_outbound", "DNS query outbound")}
                <select
                  className="mt-1 h-9 w-full rounded-md border bg-background px-3"
                  disabled={resolver.protocol === "system"}
                  onChange={(e) =>
                    patch(index, { outbound_id: e.target.value })
                  }
                  value={resolver.outbound_id}
                >
                  <option value="direct">
                    {t("ordered_routing.direct", "Node direct")}
                  </option>
                  {value.outbounds.map((outbound) => (
                    <option key={outbound.id} value={outbound.id}>
                      {outbound.name || outbound.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
          <Button
            onClick={() => {
              const resolvers = [...policy.resolvers];
              resolvers.splice(Math.max(0, resolvers.length - 1), 0, {
                id: newRoutingID("dns"),
                protocol: "udp",
                address: "",
                domains: [],
                outbound_id: "direct",
              });
              update({ ...policy, resolvers });
            }}
            type="button"
            variant="outline"
          >
            {t("ordered_routing.add_dns_rule", "Add resolver rule")}
          </Button>
        </fieldset>
      }
    </section>
  );
}
