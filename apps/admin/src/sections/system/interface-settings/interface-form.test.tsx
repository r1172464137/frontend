// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InterfaceForm from "./interface-form";
import { filterMenu, interfaceConfigKey } from "@/layout/interface-config";
import zh from "../../../../public/assets/locales/zh-CN/system.json";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@workspace/ui/services/admin/admin", () => ({
  getSystemInterfaceConfig: api.get,
  putSystemInterfaceConfig: api.put,
}));
vi.mock("sonner", () => ({
  toast: { success: api.success, error: api.error },
}));
vi.mock("react-i18next", () => ({
  useTranslation: (ns: string) => ({
    t: (key: string, fallback: string) =>
      ns === "system"
        ? (key
            .split(".")
            .reduce((obj: any, part: string) => obj?.[part], zh as any) ??
          fallback)
        : ((
            {
              Dashboard: "仪表盘",
              "System Config": "系统设置",
              "Server Management": "服务器管理",
            } as Record<string, string>
          )[key] ?? fallback),
  }),
}));
vi.mock("@workspace/ui/composed/icon", () => ({ Icon: () => null }));
vi.mock("@workspace/ui/components/sheet", async () => {
  const React = await import("react");
  const Context = React.createContext<any>(null);
  return {
    Sheet: ({ children, open, onOpenChange }: any) => (
      <Context.Provider value={{ open, onOpenChange }}>
        {children}
      </Context.Provider>
    ),
    SheetTrigger: ({ children }: any) => {
      const context = React.useContext(Context);
      return React.cloneElement(children, {
        onClick: () => context.onOpenChange(true),
      });
    },
    SheetContent: ({ children }: any) =>
      React.useContext(Context).open ? <div>{children}</div> : null,
    SheetHeader: ({ children }: any) => <div>{children}</div>,
    SheetTitle: ({ children }: any) => <h2>{children}</h2>,
    SheetFooter: ({ children }: any) => <div>{children}</div>,
  };
});
vi.mock("@workspace/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@workspace/ui/components/switch", () => ({
  Switch: ({ checked, disabled, onCheckedChange, ...props }: any) => (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    />
  ),
}));
vi.mock("@workspace/ui/components/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.get.mockResolvedValue({ data: { data: { hiddenMenuIds: [] } } });
  api.put.mockResolvedValue({ data: { code: 200 } });
});
afterEach(cleanup);
function mount() {
  return render(
    <QueryClientProvider client={client}>
      <InterfaceForm />
    </QueryClientProvider>
  );
}
async function open() {
  fireEvent.click(screen.getByRole("button", { name: /界面设置/ }));
  await screen.findByRole("switch", { name: "服务器管理" });
}

describe("shared interface settings", () => {
  it("saves, cancels, restores and keeps the system entry visible", async () => {
    mount();
    await open();
    const server = screen.getByRole("switch", { name: "服务器管理" });
    expect(server.getAttribute("aria-checked")).toBe("true");
    expect(
      (screen.getByRole("switch", { name: "系统设置" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.click(server);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(api.put).not.toHaveBeenCalled();
    await open();
    fireEvent.click(screen.getByRole("switch", { name: "服务器管理" }));
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        { hiddenMenuIds: ["/dashboard/servers"] },
        expect.anything()
      )
    );
    expect(client.getQueryData(interfaceConfigKey)).toEqual({
      hiddenMenuIds: ["/dashboard/servers"],
    });
    api.get.mockResolvedValue({
      data: { data: { hiddenMenuIds: ["/dashboard/servers"] } },
    });
    await open();
    expect(
      screen
        .getByRole("switch", { name: "服务器管理" })
        .getAttribute("aria-checked")
    ).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "恢复全部显示" }));
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() =>
      expect(api.put).toHaveBeenLastCalledWith(
        { hiddenMenuIds: [] },
        expect.anything()
      )
    );
  });
  it("does not overwrite drafts on refresh or claim success when saving fails", async () => {
    api.put.mockRejectedValue(new Error("offline"));
    mount();
    await open();
    fireEvent.click(screen.getByRole("switch", { name: "服务器管理" }));
    client.setQueryData(interfaceConfigKey, { hiddenMenuIds: ["/dashboard"] });
    expect(
      screen
        .getByRole("switch", { name: "服务器管理" })
        .getAttribute("aria-checked")
    ).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => expect(api.error).toHaveBeenCalled());
    expect(api.success).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("switch", { name: "服务器管理" })
        .getAttribute("aria-checked")
    ).toBe("false");
  });
  it("makes load failure visible and blocks saving", async () => {
    api.get.mockRejectedValue(new Error("offline"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: /界面设置/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "保存设置" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(api.put).not.toHaveBeenCalled();
  });
  it("removes empty groups but retains the recovery entry even with bad IDs", () => {
    const tree = [
      { title: "a", items: [{ title: "server", url: "/dashboard/servers" }] },
      {
        title: "system",
        items: [{ title: "settings", url: "/dashboard/system" }],
      },
    ];
    expect(
      filterMenu(tree, ["/dashboard/servers", "/dashboard/system", "unknown"])
    ).toEqual([tree[1]]);
  });
});
