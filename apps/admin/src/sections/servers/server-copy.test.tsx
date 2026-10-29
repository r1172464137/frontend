// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Servers from "./index";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@workspace/ui/services/admin/admin", () => ({
  postServerCreate: mocks.create,
  postServerOpenApiDelete: vi.fn(),
  getServerList: vi.fn(),
  postServerServerSort: vi.fn(),
  postServerUpdate: vi.fn(),
}));
vi.mock("@workspace/ui/services/node-config", () => ({
  getServerNodeConfig: mocks.getConfig,
  postServerNodeConfigUpdate: mocks.updateConfig,
}));
vi.mock("@workspace/ui/composed/pro-table/pro-table", () => ({
  ProTable: ({
    actions,
  }: {
    actions: { render: (row: unknown) => React.ReactNode };
  }) => (
    <div>
      {actions.render({
        id: 7,
        name: "source",
        address: "host",
        country: "US",
        city: "",
        protocols: [],
        status: { status: "online" },
      })}
    </div>
  ),
}));
vi.mock("@workspace/ui/composed/icon", () => ({ Icon: () => null }));
vi.mock("@/stores/node", () => ({
  useNode: () => ({ isServerReferencedByNodes: () => false }),
}));
vi.mock("@/stores/server", () => ({
  useServer: () => ({ fetchServers: mocks.refresh }),
}));
vi.mock("./dynamic-multiplier", () => ({ default: () => null }));
vi.mock("./server-config", () => ({ default: () => null }));
vi.mock("./server-form", () => ({ default: () => null }));
vi.mock("./server-install", () => ({ default: () => null }));
vi.mock("./server-node-config", () => ({
  default: ({
    server,
    triggerLabel,
  }: {
    server: API.Server;
    triggerLabel?: string;
  }) => (
    <button data-server-id={server.id} type="button">
      {triggerLabel || "Node Config"}
    </button>
  ),
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.error, success: mocks.success },
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

const copySavedMessage =
  "Copied and verified in the panel; node application is not yet confirmed.";
const routing: API.NodeRouting = {
  version: 1,
  outbounds: [],
  rules: [
    {
      id: "rr_22222222-2222-4222-8222-222222222222",
      enabled: false,
      remark: "local",
      kind: "domain",
      values: ["geosite:cn"],
      outbound_id: "block",
    },
  ],
  default_outbound_id: "direct",
};
function fixture(local: boolean): API.GetServerNodeConfigResponse {
  const policy: API.NodeRouting = local ? routing : { ...routing, rules: [] };
  const projection: API.NodeRoutingProjection = {
    ...policy,
    mode: local ? "ordered-v1-local" : "ordered-v1-inherited",
    source: local ? "server" : "global",
    source_server_id: local ? 7 : 0,
    source_revision: local ? 4 : 1,
    local_transition_revision: local ? 4 : 0,
  };
  const values: API.ServerNodeConfigValues = {
    dns: [],
    ip_strategy: "",
    routing: projection,
    routing_revision: 1,
    routing_mode: local ? "local-v1" : "global-v1",
  };
  return {
    global: { ...values, routing_mode: "global-v1" },
    effective: values,
    override: {
      inherit_dns: !local,
      dns: local ? [{ proto: "udp", address: "1.1.1.1:53", domains: [] }] : [],
      inherit_ip_strategy: !local,
      ip_strategy: "",
      inherit_routing: !local,
      routing: local ? routing : null,
      routing_revision: local ? 4 : 0,
    },
    routing_status: { known: false, reporter_verified: false },
  };
}
let source: API.GetServerNodeConfigResponse;
let target: API.GetServerNodeConfigResponse;
function commit(payload: API.UpdateServerNodeConfigRequest) {
  if (payload.inherit_dns !== undefined) {
    target.override.inherit_dns = payload.inherit_dns;
    target.override.dns = payload.inherit_dns ? [] : payload.dns || [];
  }
  if (payload.inherit_ip_strategy !== undefined) {
    target.override.inherit_ip_strategy = payload.inherit_ip_strategy;
    target.override.ip_strategy = payload.inherit_ip_strategy
      ? ""
      : payload.ip_strategy || "";
  }
  if (payload.routing) {
    target.override.inherit_routing = false;
    target.override.routing = structuredClone(payload.routing);
    target.override.routing_revision += 1;
  }
  if (payload.inherit_routing) {
    target.override.inherit_routing = true;
    target.override.routing = null;
    target.override.routing_revision += 1;
  }
}
function clickCopy() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "More actions" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy" }));
}
beforeEach(() => {
  source = fixture(true);
  target = fixture(false);
  mocks.create.mockResolvedValue({
    data: { code: 200, msg: "", data: { id: 42 } },
  });
  mocks.getConfig.mockImplementation(
    async ({ server_id }: { server_id: number }) => ({
      data: {
        code: 200,
        data: structuredClone(server_id === 7 ? source : target),
      },
    })
  );
  mocks.updateConfig.mockImplementation(
    async (payload: API.UpdateServerNodeConfigRequest) => {
      commit(payload);
      return { data: { code: 200 } };
    }
  );
  mocks.refresh.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("server copy", () => {
  it("uses the backend's data.id, copies local DNS/IP/routing while offline, and verifies readback", async () => {
    render(<Servers />);
    clickCopy();
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(copySavedMessage)
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0]![1]).toEqual({
      timeout: 15_000,
      skipErrorHandler: true,
    });
    expect(mocks.getConfig.mock.calls[0]![1]).toEqual({
      timeout: 15_000,
      skipErrorHandler: true,
    });
    expect(mocks.updateConfig.mock.calls[0]![1]).toEqual({
      timeout: 15_000,
      skipErrorHandler: true,
    });
    expect(mocks.create.mock.calls[0]![0]).toEqual({
      name: "source",
      address: "host",
      country: "US",
      city: "",
      protocols: [],
    });
    expect(mocks.updateConfig).toHaveBeenCalledTimes(1);
    const payload = mocks.updateConfig.mock
      .calls[0]![0] as API.UpdateServerNodeConfigRequest;
    expect(payload).toMatchObject({
      server_id: 42,
      routing_revision: 0,
      inherit_dns: false,
      inherit_ip_strategy: false,
      ip_strategy: "",
      dns: source.override.dns,
      routing,
    });
    expect(target.override).toMatchObject({
      inherit_dns: false,
      inherit_ip_strategy: false,
      inherit_routing: false,
      routing,
      routing_revision: 1,
    });
    expect(
      mocks.getConfig.mock.calls.filter(([arg]) => arg.server_id === 42)
    ).toHaveLength(2);
    expect(screen.queryByText(/configuration copy is incomplete/i)).toBeNull();
  });
  it("blocks repeated clicks while the create request is in flight", async () => {
    let release: ((value: unknown) => void) | undefined;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    render(<Servers />);
    clickCopy();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "More actions" }),
      { button: 0, ctrlKey: false }
    );
    const copy = screen.getByRole("menuitem", { name: "Copy" });
    expect(copy.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(copy);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    release?.({ data: { code: 200, data: { id: 42 } } });
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(copySavedMessage)
    );
  });
  it.each([
    ["missing", {}],
    ["null", null],
    ["source ID", { id: 7 }],
    ["unsafe ID", { id: Number.MAX_SAFE_INTEGER + 1 }],
  ])("reports %s create ID as unknown and never retries creation automatically", async (_label, data) => {
    mocks.create.mockResolvedValue({ data: { code: 200, msg: "", data } });
    render(<Servers />);
    clickCopy();
    expect(
      await screen.findByText(
        "Create result for source is unknown (server ID not confirmed)."
      )
    ).toBeTruthy();
    expect(screen.getByText(/violates the backend contract/i)).toBeTruthy();
    expect(screen.getByText(/request may have created a server/i)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Retry configuration" })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Refresh server list" })
    ).toBeTruthy();
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "More actions" }),
      { button: 0, ctrlKey: false }
    );
    const copy = screen.getByRole("menuitem", { name: "Copy" });
    expect(copy.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(copy);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });
  it("shows the created ID and permits retry/edit after a post-create failure without another create", async () => {
    mocks.updateConfig.mockRejectedValueOnce({
      response: { status: 200, data: { code: 10_002 } },
    });
    render(<Servers />);
    clickCopy();
    expect(
      await screen.findByText(
        "Server created (ID 42, source), but configuration copy is incomplete."
      )
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Edit configuration" })
        .getAttribute("data-server-id")
    ).toBe("42");
    expect(screen.getByText(/never creates another server/i)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry configuration" })
    );
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(copySavedMessage)
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.updateConfig).toHaveBeenCalledTimes(2);
    expect(target.override.routing).toEqual(routing);
  });
  it("does not claim success when an accepted configuration write is absent from readback", async () => {
    mocks.updateConfig.mockResolvedValue({ data: { code: 200 } });
    render(<Servers />);
    clickCopy();
    expect(
      await screen.findByText(
        "Server created (ID 42, source), but configuration copy is incomplete."
      )
    ).toBeTruthy();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("checks readback before retrying a write whose confirmation was lost", async () => {
    let targetReads = 0;
    mocks.getConfig.mockImplementation(
      async ({ server_id }: { server_id: number }) => {
        if (server_id === 42 && ++targetReads === 2)
          throw new Error("readback unavailable");
        return {
          data: {
            code: 200,
            data: structuredClone(server_id === 7 ? source : target),
          },
        };
      }
    );
    render(<Servers />);
    clickCopy();
    expect(
      await screen.findByText(
        "Server created (ID 42, source), but configuration copy is incomplete."
      )
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry configuration" })
    );
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(copySavedMessage)
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.updateConfig).toHaveBeenCalledTimes(1);
  });
  it("uses a fresh target revision only after an explicit retry of a conflict", async () => {
    mocks.updateConfig.mockImplementationOnce(async () => {
      target.override.routing_revision = 9;
      throw Object.assign(new Error("conflict"), {
        response: { status: 409, data: { code: 140_002 } },
      });
    });
    render(<Servers />);
    clickCopy();
    expect(
      await screen.findByText(
        "Server created (ID 42, source), but configuration copy is incomplete."
      )
    ).toBeTruthy();
    expect(mocks.updateConfig).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry configuration" })
    );
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(copySavedMessage)
    );
    expect(mocks.updateConfig.mock.calls[1]![0]).toMatchObject({
      server_id: 42,
      routing_revision: 9,
      routing,
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("preserves inherited routing and clears a local target with CAS rather than sending routing null", async () => {
    source = fixture(false);
    target = fixture(true);
    render(<Servers />);
    clickCopy();
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(copySavedMessage)
    );
    const payload = mocks.updateConfig.mock
      .calls[0]![0] as API.UpdateServerNodeConfigRequest;
    expect(payload).toMatchObject({
      server_id: 42,
      routing_revision: 4,
      inherit_routing: true,
    });
    expect(Object.hasOwn(payload, "routing")).toBe(false);
    expect(target.override).toMatchObject({
      inherit_routing: true,
      routing: null,
      routing_revision: 5,
    });
  });
  it("validates source routing before creating and treats a create timeout as unknown", async () => {
    source.override.routing = {
      ...routing,
      version: 2,
    } as unknown as API.NodeRouting;
    render(<Servers />);
    clickCopy();
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        expect.stringContaining("No server was created")
      )
    );
    expect(mocks.create).not.toHaveBeenCalled();
    source = fixture(true);
    mocks.create.mockRejectedValueOnce(new Error("timeout"));
    clickCopy();
    expect(
      await screen.findByText(
        "Create result for source is unknown (server ID not confirmed)."
      )
    ).toBeTruthy();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });
  it("accepts a post-commit HTTP 200 error only after the target readback matches", async () => {
    mocks.updateConfig.mockImplementation(
      async (payload: API.UpdateServerNodeConfigRequest) => {
        commit(payload);
        throw Object.assign(new Error("cache"), {
          response: { status: 200, data: { code: 10_002 } },
        });
      }
    );
    render(<Servers />);
    clickCopy();
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(copySavedMessage)
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(target.override.routing).toEqual(routing);
  });
});
