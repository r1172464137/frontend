// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ServerInstall from "./server-install";
import { buildServerInstallCommand } from "./server-install-command";

const mocks = vi.hoisted(() => ({
  copy: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("@workspace/ui/services/admin/admin", () => ({
  getSystemNodeConfig: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const server = { id: 7 } as API.Server;
const syntheticSecret = "synthetic'; printf SECRET_INJECTION; #";

beforeEach(() => {
  localStorage.clear();
  mocks.useQuery.mockReturnValue({
    data: { node_secret: syntheticSecret },
  });
  mocks.copy.mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText: mocks.copy } });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("server install dialog", () => {
  it("shows the pinned fork command, safely updates the host, and copies it unchanged", async () => {
    localStorage.setItem("API_HOST", "https://stored.example.test");
    render(<ServerInstall server={server} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    const command = screen.getByRole("textbox", {
      name: "Install command",
    }) as HTMLTextAreaElement;
    expect(command.value).toBe(
      buildServerInstallCommand({
        apiHost: "https://stored.example.test",
        serverId: server.id,
        secret: syntheticSecret,
      })
    );
    expect(command.readOnly).toBe(true);
    expect(command.value).toContain(
      "https://github.com/r1172464137/ppanel-node/releases/download/v1.1.14/install.sh"
    );
    const editedHost =
      "https://edited.example.test/a'b; printf HOST_INJECTION; #";
    fireEvent.change(screen.getByPlaceholderText("http(s)://example.com"), {
      target: { value: editedHost },
    });
    expect(localStorage.getItem("API_HOST")).toBe(editedHost);
    const expected = buildServerInstallCommand({
      apiHost: editedHost,
      serverId: server.id,
      secret: syntheticSecret,
    });
    expect(command.value).toBe(expected);
    fireEvent.click(screen.getByRole("button", { name: "Copy and Close" }));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith(expected));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
