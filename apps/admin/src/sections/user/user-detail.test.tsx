// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UserDetail, UserSubscribeDetail } from "./user-detail";

const api = vi.hoisted(() => ({
  getUserList: vi.fn(),
  getUserSubscribe: vi.fn(),
  getUserSubscribeDetail: vi.fn(),
}));
const getUserList = api.getUserList;
vi.mock("@workspace/ui/services/admin/admin", () => api);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: any) => <a href="/">{children}</a>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, f?: string) => f ?? _k }),
}));
vi.mock("@workspace/ui/components/hover-card", () => ({
  HoverCard: ({ children }: any) => <div>{children}</div>,
  HoverCardTrigger: ({ children }: any) => children,
  HoverCardContent: () => null,
}));

afterEach(cleanup);

it("loads every visible user with one list call, without hovering", async () => {
  getUserList.mockResolvedValue({
    data: {
      data: {
        list: [
          {
            id: 1,
            auth_methods: [{ auth_type: "email", auth_identifier: "a@x" }],
          },
          {
            id: 2,
            auth_methods: [{ auth_type: "mobile", auth_identifier: "+1 2" }],
          },
        ],
      },
    },
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UserDetail id={1} />
      <UserDetail id={2} />
      <UserDetail id={3} />
    </QueryClientProvider>
  );

  expect(await screen.findByText("a@x")).toBeTruthy();
  expect(await screen.findByText("+1 2")).toBeTruthy();
  // id 3 is not listed (deleted) and keeps the fallback.
  expect(screen.getByText("#3")).toBeTruthy();
  expect(getUserList).toHaveBeenCalledTimes(1);
  expect(getUserList).toHaveBeenCalledWith({
    page: 1,
    size: 3,
    ids: [1, 2, 3],
  });
});

it("loads subscription cells with one list call, without hovering", async () => {
  api.getUserSubscribe.mockResolvedValue({
    data: { data: { list: [{ id: 5, subscribe: { name: "Pro" } }] } },
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UserSubscribeDetail enabled hoverCard id={5} />
      <UserSubscribeDetail enabled hoverCard id={6} />
    </QueryClientProvider>
  );

  expect(await screen.findByText("Pro")).toBeTruthy();
  expect(screen.getByText("#6")).toBeTruthy();
  expect(api.getUserSubscribe).toHaveBeenCalledTimes(1);
  expect(api.getUserSubscribe).toHaveBeenCalledWith({
    page: 1,
    size: 2,
    ids: [5, 6],
  });
  expect(api.getUserSubscribeDetail).not.toHaveBeenCalled();
});
