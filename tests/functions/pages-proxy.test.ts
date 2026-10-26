import { describe, expect, test } from "bun:test";
import {
  buildUpstreamHeaders,
  proxyRequest,
} from "../../functions/v1/[[path]]";

describe("Pages API proxy configuration", () => {
  test("fails closed without API_BASE_URL and does not consume or forward credentials", async () => {
    let upstreamCalls = 0;
    const upstreamFetch = (async () => {
      upstreamCalls += 1;
      return new Response("unexpected upstream call");
    }) as typeof fetch;
    const request = new Request("https://panel.example.com/v1/auth/login", {
      method: "POST",
      headers: {
        authorization: "Bearer private-session",
        "content-type": "application/json",
      },
      body: JSON.stringify({ password: "private-password" }),
    });

    const response = await proxyRequest(request, {}, upstreamFetch);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("API_BASE_URL is required");
    expect(upstreamCalls).toBe(0);
    expect(request.bodyUsed).toBe(false);
    expect(request.headers.get("authorization")).toBe("Bearer private-session");
  });

  for (const apiBase of [
    "https://user:password@10.0.0.8:8080",
    "https://10.0.0.8:8080/base",
    "https://10.0.0.8:8080?tenant=private",
    "https://10.0.0.8:8080#private",
  ]) {
    test(`rejects non-origin API_BASE_URL ${apiBase}`, async () => {
      let upstreamCalls = 0;
      const response = await proxyRequest(
        new Request("https://panel.example.com/v1/config"),
        { API_BASE_URL: apiBase },
        (async () => {
          upstreamCalls += 1;
          return new Response("unexpected upstream call");
        }) as typeof fetch
      );

      expect(response.status).toBe(503);
      expect(await response.text()).toContain("must be an origin");
      expect(upstreamCalls).toBe(0);
    });
  }

  test("answers configured OPTIONS requests locally with the CORS contract", async () => {
    let upstreamCalls = 0;
    const response = await proxyRequest(
      new Request("https://panel.example.com:8443/v1/auth/login", {
        method: "OPTIONS",
        headers: {
          authorization: "Bearer private-session",
          "x-forwarded-host": "attacker.example",
        },
      }),
      { API_BASE_URL: "http://10.0.0.8:8080" },
      (async () => {
        upstreamCalls += 1;
        return new Response("unexpected upstream call");
      }) as typeof fetch
    );

    expect(response.status).toBe(204);
    expect(upstreamCalls).toBe(0);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://panel.example.com:8443"
    );
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, PUT, DELETE, PATCH, OPTIONS"
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Content-Type, Authorization"
    );
  });
});

describe("Pages API proxy forwarding headers", () => {
  test("replaces caller forwarding metadata with trusted values", () => {
    const headers = new Headers({
      authorization: "Bearer token",
      "cf-connecting-ip": "203.0.113.8",
      forwarded: "for=198.51.100.1",
      "true-client-ip": "198.51.100.2",
      via: "1.1 attacker.example",
      "x-client-ip": "198.51.100.3",
      "x-forwarded-for": "198.51.100.4, 203.0.113.8",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-port": "81",
      "x-forwarded-proto": "http",
      "x-forwarded-server": "attacker-proxy",
      "x-original-url": "/admin",
      "x-real-ip": "198.51.100.5",
    });

    const upstream = buildUpstreamHeaders(
      headers,
      "api.example.com",
      new URL("https://panel.example.com:8443/v1/auth/login")
    );

    expect(upstream.get("host")).toBe("api.example.com");
    expect(upstream.get("authorization")).toBe("Bearer token");
    expect(upstream.get("x-forwarded-for")).toBe("203.0.113.8");
    expect(upstream.get("x-forwarded-host")).toBe("panel.example.com:8443");
    expect(upstream.get("x-forwarded-port")).toBe("8443");
    expect(upstream.get("x-forwarded-proto")).toBe("https");
    expect(upstream.get("x-real-ip")).toBe("203.0.113.8");
    expect(upstream.has("cf-connecting-ip")).toBe(false);
    expect(upstream.has("forwarded")).toBe(false);
    expect(upstream.has("true-client-ip")).toBe(false);
    expect(upstream.has("via")).toBe(false);
    expect(upstream.has("x-client-ip")).toBe(false);
    expect(upstream.has("x-forwarded-server")).toBe(false);
    expect(upstream.has("x-original-url")).toBe(false);
  });

  test("preserves a trusted IPv6 client address", () => {
    const headers = new Headers({
      "cf-connecting-ip": "2001:db8::8",
      "x-forwarded-for": "198.51.100.4",
    });

    const upstream = buildUpstreamHeaders(
      headers,
      "api.example.com",
      new URL("https://panel.example.com/v1/config")
    );

    expect(upstream.get("x-forwarded-for")).toBe("2001:db8::8");
    expect(upstream.get("x-real-ip")).toBe("2001:db8::8");
  });

  test("prefers the original IPv6 address over a Cloudflare pseudo IPv4", () => {
    const headers = new Headers({
      "cf-connecting-ip": "240.0.0.8",
      "cf-connecting-ipv6": "2001:db8::9",
    });

    const upstream = buildUpstreamHeaders(
      headers,
      "api.example.com",
      new URL("https://panel.example.com/v1/config")
    );

    expect(upstream.get("x-forwarded-for")).toBe("2001:db8::9");
    expect(upstream.get("x-real-ip")).toBe("2001:db8::9");
    expect(upstream.has("cf-connecting-ipv6")).toBe(false);
  });

  test("drops forwarding headers when Cloudflare provides no valid address", () => {
    const headers = new Headers({
      "cf-connecting-ip": "not-an-ip",
      forwarded: "for=198.51.100.1",
      "x-forwarded-for": "198.51.100.2",
      "x-real-ip": "198.51.100.3",
    });

    const upstream = buildUpstreamHeaders(
      headers,
      "api.example.com",
      new URL("https://panel.example.com/v1/config")
    );

    expect(upstream.has("cf-connecting-ip")).toBe(false);
    expect(upstream.has("forwarded")).toBe(false);
    expect(upstream.has("x-forwarded-for")).toBe(false);
    expect(upstream.has("x-real-ip")).toBe(false);
  });

  test("forwards to a configured private target with sanitized IP headers", async () => {
    const body = JSON.stringify({ password: "private-password" });
    let upstreamCalls = 0;
    const upstreamFetch = (async (input, init) => {
      upstreamCalls += 1;
      expect(String(input)).toBe(
        "http://10.0.0.8:8080/v1/auth/login?source=private"
      );
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("manual");

      const headers = new Headers(init?.headers);
      expect(headers.get("host")).toBe("10.0.0.8:8080");
      expect(headers.get("authorization")).toBe("Bearer private-session");
      expect(headers.get("x-forwarded-for")).toBe("203.0.113.8");
      expect(headers.get("x-forwarded-host")).toBe("panel.example.com");
      expect(headers.get("x-forwarded-port")).toBe("443");
      expect(headers.get("x-forwarded-proto")).toBe("https");
      expect(headers.get("x-real-ip")).toBe("203.0.113.8");
      expect(headers.has("cf-connecting-ip")).toBe(false);
      expect(headers.has("forwarded")).toBe(false);
      expect(headers.has("true-client-ip")).toBe(false);
      expect(headers.has("via")).toBe(false);
      expect(headers.has("x-client-ip")).toBe(false);
      expect(headers.has("x-forwarded-server")).toBe(false);
      expect(headers.has("cf-ray")).toBe(false);
      expect(await new Response(init?.body).text()).toBe(body);

      return Response.json({ forwarded: true });
    }) as typeof fetch;

    const response = await proxyRequest(
      new Request("https://panel.example.com/v1/auth/login?source=private", {
        method: "POST",
        headers: {
          authorization: "Bearer private-session",
          "cf-connecting-ip": "203.0.113.8",
          "cf-ray": "spoofed-ray",
          "content-type": "application/json",
          forwarded: "for=198.51.100.1",
          "true-client-ip": "198.51.100.2",
          via: "1.1 attacker.example",
          "x-client-ip": "198.51.100.3",
          "x-forwarded-for": "198.51.100.4",
          "x-forwarded-host": "attacker.example",
          "x-forwarded-port": "81",
          "x-forwarded-proto": "http",
          "x-forwarded-server": "attacker-proxy",
          "x-real-ip": "198.51.100.5",
        },
        body,
      }),
      { API_BASE_URL: " http://10.0.0.8:8080/ " },
      upstreamFetch
    );

    expect(upstreamCalls).toBe(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://panel.example.com"
    );
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "OPTIONS"
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Content-Type, Authorization"
    );
    expect(await response.json()).toEqual({ forwarded: true });
  });

  test("preserves upstream redirects for browser-handled OAuth callbacks", async () => {
    let redirectMode: RequestRedirect | undefined;
    const upstreamFetch = (async (_url: string | URL | Request, init) => {
      redirectMode = init?.redirect;
      return Response.redirect(
        "https://panel.example.com/oauth/apple/?code=code&state=state",
        302
      );
    }) as typeof fetch;

    const response = await proxyRequest(
      new Request("https://panel.example.com/v1/auth/oauth/callback/apple", {
        method: "POST",
        body: "code=code&state=state",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
      }),
      { API_BASE_URL: "https://api.example.com" },
      upstreamFetch
    );

    expect(redirectMode).toBe("manual");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://panel.example.com/oauth/apple/?code=code&state=state"
    );
  });
});
