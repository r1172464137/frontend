import { Button } from "@workspace/ui/components/button";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  isRoutingRevision,
  ROUTING_STATUS_TTL_MS,
  routingApplicationState,
} from "./node-routing";

export function RoutingConflict({
  onRefresh,
  uncertain = false,
}: {
  onRefresh: () => void;
  uncertain?: boolean;
}) {
  const { t } = useTranslation("servers");
  return (
    <div
      className="space-y-2 rounded-lg border border-destructive p-4 text-sm"
      role="alert"
    >
      <p>
        {uncertain
          ? t(
              "ordered_routing.readback_mismatch",
              "The request may have been saved, but readback did not confirm it. Refresh and verify the current policy before editing again."
            )
          : t(
              "ordered_routing.conflict",
              "Routing changed on the server. Your draft has not been saved. Refresh and discard this draft before editing again."
            )}
      </p>
      <Button onClick={onRefresh} type="button" variant="outline">
        {t("ordered_routing.refresh", "Refresh and discard draft")}
      </Button>
    </div>
  );
}

export function RoutingStatus({
  status,
  expected,
  onRefresh,
  refreshDisabled = false,
}: {
  status?: API.RoutingStatusView;
  expected?: API.RoutingIdentity;
  onRefresh: () => void;
  refreshDisabled?: boolean;
}) {
  const { t } = useTranslation("servers");
  const [clock, setClock] = useState(Date.now);
  const received = status?.report?.received_at;
  useEffect(() => {
    if (!isRoutingRevision(received) || received === 0) return;
    const delay = received * 1000 + ROUTING_STATUS_TTL_MS - Date.now();
    if (delay <= 0) return;
    const timer = window.setTimeout(
      () => setClock(Date.now()),
      Math.min(delay + 1, 2_147_483_647)
    );
    return () => window.clearTimeout(timer);
  }, [received]);
  const state = routingApplicationState(
    status,
    expected,
    Math.max(clock, Date.now())
  );
  const fallback = {
    pending: "Pending node application",
    applied: "Applied by node",
    failed: "Node application failed",
    unknown: "Node application status unknown",
  };
  return (
    <div className="space-y-2 rounded border p-3 text-sm" role="status">
      <p>{t(`ordered_routing.status_${state}`, fallback[state])}</p>
      {state === "failed" && status?.report?.routing_error ? (
        <p className="break-words text-destructive [overflow-wrap:anywhere]">
          {status.report.routing_error.stage}:{" "}
          {status.report.routing_error.message}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {t(
          "ordered_routing.status_as_of",
          "Status reflects the last refresh, not a live guarantee."
        )}
      </p>
      <Button
        disabled={refreshDisabled}
        onClick={onRefresh}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("ordered_routing.refresh_status", "Refresh status")}
      </Button>
    </div>
  );
}
