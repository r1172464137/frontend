// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import request from "./request";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

const logout = vi.fn();
Object.assign(window, {
  i18n: {
    t: (key: string, fallback: string) => `translated:${key}:${fallback}`,
  },
  logout,
});

afterEach(() => {
  vi.clearAllMocks();
});

function respond(code: number, msg: string) {
  request.defaults.adapter = async (config) => ({
    config,
    data: { code, msg },
    headers: {},
    status: 200,
    statusText: "OK",
  });
}

describe("backend errors", () => {
  it("translates known errors and rejects with the translated message", async () => {
    respond(20_003, "server password message");
    await expect(request.get("/fixture")).rejects.toThrow(
      "translated:components:error.20003"
    );
    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining("components:error.20003")
    );
  });

  it("keeps unknown server messages and respects skipErrorHandler", async () => {
    respond(999_999, "fixture server message");
    await expect(
      request.get("/fixture", { skipErrorHandler: true } as never)
    ).rejects.toThrow("fixture server message");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("logs out for expired credentials", async () => {
    respond(40_004, "expired");
    await expect(request.get("/fixture")).rejects.toThrow();
    expect(logout).toHaveBeenCalledOnce();
    expect(toastError).not.toHaveBeenCalled();
  });
});
