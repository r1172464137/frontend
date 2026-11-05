// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Subscribe from "./index";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  purchase: vi.fn(async () => ({
    data: { data: { order_no: "purchase-order" } },
  })),
  renewal: vi.fn(async () => ({ data: { data: { order_no: "renew-order" } } })),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ navigate: mocks.navigate }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en-US" },
    t: (_key: string, fallback: string, values?: { name?: string }) =>
      fallback.replace("{{name}}", values?.name ?? ""),
  }),
}));
vi.mock("@/stores/global", () => ({
  useGlobalStore: () => ({ getUserInfo: vi.fn() }),
}));
vi.mock("@workspace/ui/services/user/user", () => {
  const plan = {
    id: 1,
    name: "Fixture Plan",
    show: true,
    sell: true,
    description: "{}",
    unit_price: 1000,
    unit_time: "Month",
  };
  return {
    getV1PublicSubscribeList: async () => ({
      data: { data: { list: [plan] } },
    }),
    getV1PublicUserSubscribe: async () => ({
      data: {
        data: {
          list: [
            {
              id: 42,
              subscribe_id: 1,
              subscribe: plan,
              expire_time: Date.now() + 86_400_000,
            },
          ],
        },
      },
    }),
    postV1PublicOrderPre: async () => ({ data: { data: {} } }),
    postV1PublicOrderPurchase: mocks.purchase,
    postV1PublicOrderRenewal: mocks.renewal,
  };
});
vi.mock("./detail", () => ({ SubscribeDetail: () => null }));
vi.mock("./billing", () => ({ SubscribeBilling: () => null }));
vi.mock("./coupon-input", () => ({ default: () => null }));
vi.mock("./duration-selector", () => ({ default: () => null }));
vi.mock("./payment-methods", () => ({ default: () => null }));
vi.mock("@/components/display", () => ({ Display: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("subscription reminder transitions", () => {
  it.each([
    "renew",
    "purchase",
  ])("replaces the reminder with one usable %s dialog", async (action) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Subscribe />
      </QueryClientProvider>
    );
    fireEvent.click(await screen.findByRole("button", { name: /^Buy$/ }));
    const reminder = await screen.findByRole("dialog", {
      name: "You already have a subscription",
    });
    fireEvent.click(
      within(reminder).getByRole("button", {
        name:
          action === "renew"
            ? "Renew"
            : "Buy Fixture Plan as a new subscription",
      })
    );
    const target = await screen.findByRole("dialog", {
      name: action === "renew" ? "Renew Subscription" : "Buy Subscription",
    });
    await waitFor(() => {
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
      expect(
        document.querySelectorAll('[data-slot="dialog-overlay"]')
      ).toHaveLength(1);
    });
    fireEvent.click(within(target).getByRole("button", { name: "Buy Now" }));
    await waitFor(() =>
      expect(
        action === "renew" ? mocks.renewal : mocks.purchase
      ).toHaveBeenCalledOnce()
    );
    if (action === "renew")
      expect(mocks.renewal).toHaveBeenCalledWith(
        expect.objectContaining({ user_subscribe_id: 42, subscribe_id: 1 })
      );
    else
      expect(mocks.purchase).toHaveBeenCalledWith(
        expect.objectContaining({ subscribe_id: 1 })
      );
  });
});
