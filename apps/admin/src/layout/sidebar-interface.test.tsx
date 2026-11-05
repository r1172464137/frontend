// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarLeft } from "./sidebar-left";

const state = vi.hoisted(() => ({
  mobile: false,
  collapsed: false,
  t: (_key: string, fallback: string) => fallback,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: () => "/dashboard/system",
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: state.t }) }));
vi.mock("@/stores/global", () => ({
  useGlobalStore: () => ({ common: { site: {} } }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@workspace/ui/composed/icon", () => ({ Icon: () => null }));
vi.mock("@workspace/ui/services/admin/admin", () => ({
  getSystemInterfaceConfig: async () => ({
    data: {
      data: {
        hiddenMenuIds: [
          "/dashboard/servers",
          "/dashboard/nodes",
          "/dashboard/subscribe",
          "/dashboard/product",
          "/dashboard/system",
        ],
      },
    },
  }),
  putSystemInterfaceConfig: vi.fn(),
}));
vi.mock("@workspace/ui/components/hover-card", () => ({
  HoverCard: ({ children }: any) => <div>{children}</div>,
  HoverCardTrigger: ({ children }: any) => children,
  HoverCardContent: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@workspace/ui/components/sidebar", () => {
  const Box = ({ children }: any) => <div>{children}</div>;
  return {
    Sidebar: Box,
    SidebarContent: Box,
    SidebarGroup: Box,
    SidebarGroupContent: Box,
    SidebarHeader: Box,
    SidebarMenu: Box,
    SidebarMenuItem: Box,
    SidebarMenuButton: ({ children, asChild, onClick, ...props }: any) =>
      asChild ? (
        children
      ) : (
        <button onClick={onClick} aria-label={props["aria-label"]}>
          {children}
        </button>
      ),
    useSidebar: () => ({
      state: state.collapsed ? "collapsed" : "expanded",
      isMobile: state.mobile,
    }),
  };
});
afterEach(cleanup);
describe.each([
  { name: "desktop expanded", mobile: false, collapsed: false },
  { name: "desktop collapsed", mobile: false, collapsed: true },
  { name: "mobile", mobile: true, collapsed: false },
])("menu filtering in $name", ({ mobile, collapsed }) => {
  it("uses shared settings, removes empty groups and keeps system recovery accessible", async () => {
    state.mobile = mobile;
    state.collapsed = collapsed;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <SidebarLeft />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.queryByText("Maintenance")).toBeNull());
    expect(screen.queryByText("Server Management")).toBeNull();
    expect(screen.getByText("System Config")).toBeTruthy();
  });
});
