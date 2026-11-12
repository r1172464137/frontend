import { v3 } from "./routing-fixtures.test-util";
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ServerNodeConfig from "./server-node-config";

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  updateConfig: vi.fn(),
  useQuery: vi.fn(),
}));

const policy = v3({
  version: 3,
  outbounds: [],
  rules: [],
  default_outbound_id: "direct",
  mode: "inherited",
  source: "global",
  source_server_id: 0,
  source_revision: 3,
  local_transition_revision: 0,
}) as API.NodeRoutingProjection;
const config: API.GetServerNodeConfigResponse = {
  effective: {
    routing: policy,
    routing_revision: 3,
    routing_mode: "inherited",
  },
  global: {
    routing: policy,
    routing_revision: 3,
    routing_mode: "inherited",
  },
  override: {
    inherit_routing: true,
    routing: null,
    routing_revision: 0,
  },
  routing_status: { known: false, reporter_verified: false, synced: false },
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("@workspace/ui/services/node-config", () => ({
  getServerNodeConfig: vi.fn(),
  postServerNodeConfigUpdate: mocks.updateConfig,
}));

vi.mock("@workspace/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("./outbound-config-input", () => ({
  OutboundConfigInput: () => <div>Outbound editor</div>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      fallback: string,
      values?: Record<string, string | number>
    ) =>
      Object.entries(values || {}).reduce(
        (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
        fallback
      ),
  }),
}));

const server = {
  address: "203.0.113.10",
  id: 7,
  name: "Singapore 01",
  protocols: [],
} as unknown as API.Server;

beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: vi.fn(),
    configurable: true,
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }
  );
  mocks.refetch.mockResolvedValue({ data: { serverId: server.id, config } });
  mocks.updateConfig.mockResolvedValue({ data: { data: true } });
  mocks.useQuery.mockReturnValue({
    data: { serverId: server.id, config },
    isError: false,
    isLoading: false,
    refetch: mocks.refetch,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

describe("server node configuration", () => {
  it("blocks editing and offers a retry when loading fails", () => {
    mocks.useQuery.mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
      refetch: mocks.refetch,
    });

    render(<ServerNodeConfig server={server} />);
    fireEvent.click(screen.getByRole("button", { name: "Node Config" }));

    expect(screen.getByText("Unable to load configuration")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});
