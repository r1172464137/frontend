// @vitest-environment jsdom

import { AxiosError } from "axios";
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

  it.each([
    [160_001, "Global routing has changed"],
    [160_002, "Settings were saved but could not be applied"],
  ])("distinguishes platform error %i", async (code, message) => {
    respond(code, "server message");
    await expect(request.get("/fixture")).rejects.toThrow(message);
    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining(`components:error.${code}`)
    );
  });

  it("shows the routing conflict message for an HTTP 409", async () => {
    request.defaults.adapter = async (config) => {
      throw new AxiosError(
        "Request failed with status code 409",
        AxiosError.ERR_BAD_REQUEST,
        config,
        undefined,
        {
          config,
          status: 409,
          statusText: "Conflict",
          headers: {},
          data: { code: 160_001 },
        }
      );
    };
    await expect(request.get("/fixture")).rejects.toBeDefined();
    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining(
        "components:error.160001:Global routing has changed"
      )
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
