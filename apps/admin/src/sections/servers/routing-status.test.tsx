// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoutingStatus } from "./routing-status";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
const desired = "d".repeat(64);
const id: API.RoutingIdentity = {
  mode: "local",
  source: "server",
  source_server_id: 7,
  source_revision: 3,
  local_transition_revision: 3,
  snapshot_id: desired,
};
const instance = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
// The backend decides `synced` (applied identity equals the desired
// snapshot in every field); the page only adds freshness.
function report(synced = true): API.RoutingStatusView {
  return {
    known: true,
    reporter_verified: true,
    desired_snapshot_id: desired,
    synced,
    report: {
      routing_version: 3,
      routing_sequence: Number("9007199254740993"),
      instance_id: instance,
      received_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      routing_applied: id,
    },
  };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("backend routing_status", () => {
  it("displays pending and failure only for the desired snapshot", () => {
    const current = report(false);
    const view = render(
      <RoutingStatus
        onRefresh={vi.fn()}
        status={{
          ...current,
          report: { ...current.report!, routing_pending: id },
        }}
      />
    );
    expect(screen.getByText("Pending node application")).toBeTruthy();
    view.rerender(
      <RoutingStatus
        onRefresh={vi.fn()}
        status={{
          ...current,
          report: {
            ...current.report!,
            routing_error: {
              identity: id,
              stage: "build",
              message: "candidate failed during build",
            },
          },
        }}
      />
    );
    expect(screen.getByText("Node application failed")).toBeTruthy();
    expect(
      screen.getByText("build: candidate failed during build")
    ).toBeTruthy();
    // Same revision, different users: neither applied nor pending.
    view.rerender(
      <RoutingStatus
        onRefresh={vi.fn()}
        status={{
          ...current,
          report: {
            ...current.report!,
            routing_pending: { ...id, snapshot_id: "e".repeat(64) },
          },
        }}
      />
    );
    expect(screen.getByText("Node application status unknown")).toBeTruthy();
  });
  it("expires a synced receipt to unknown while the sheet stays open", () => {
    vi.useFakeTimers();
    render(<RoutingStatus onRefresh={vi.fn()} status={report()} />);
    expect(screen.getByText("Applied by node")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(3 * 60 * 1000 + 1000);
    });
    expect(screen.getByText("Node application status unknown")).toBeTruthy();
  });
  it("shows synced receipts despite zero or backward node updated_at", () => {
    const current = report();
    render(
      <RoutingStatus
        onRefresh={vi.fn()}
        status={{
          ...current,
          report: {
            ...current.report!,
            updated_at: 0,
            liveness_at: Date.now() / 1000,
          },
        }}
      />
    );
    expect(screen.getByText("Applied by node")).toBeTruthy();
  });
  it("shows unknown for multi-instance conflict and unidentified or old reporters", () => {
    const current = report();
    const view = render(
      <RoutingStatus
        onRefresh={vi.fn()}
        status={{ known: false, reporter_verified: false, synced: false }}
      />
    );
    expect(screen.getByText("Node application status unknown")).toBeTruthy();
    view.rerender(
      <RoutingStatus
        onRefresh={vi.fn()}
        status={{
          ...current,
          known: false,
          report: { ...current.report!, conflict: true },
        }}
      />
    );
    expect(screen.getByText("Node application status unknown")).toBeTruthy();
    view.rerender(
      <RoutingStatus
        onRefresh={vi.fn()}
        status={{
          ...current,
          reporter_verified: false,
          report: { ...current.report!, instance_id: "" },
        }}
      />
    );
    expect(screen.getByText("Node application status unknown")).toBeTruthy();
  });
});
