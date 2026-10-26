export interface Env {
  API_BASE_URL?: string;
}

const UNTRUSTED_FORWARDING_HEADERS = new Set([
  "cf-connecting-ip",
  "cf-connecting-ipv6",
  "forwarded",
  "true-client-ip",
  "via",
  "x-client-ip",
  "x-cluster-client-ip",
  "x-envoy-external-address",
  "x-original-forwarded-for",
  "x-original-url",
  "x-proxyuser-ip",
  "x-real-ip",
  "x-rewrite-url",
]);

function isIPv4(value: string) {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255
    )
  );
}

function isIPv6(value: string) {
  if (!(value.includes(":") && /^[0-9a-f:.]+$/i.test(value))) {
    return false;
  }
  try {
    return new URL(`http://[${value}]/`).hostname.length > 2;
  } catch {
    return false;
  }
}

function getCloudflareClientIp(headers: Headers) {
  const ipv6 = headers.get("cf-connecting-ipv6")?.trim();
  if (ipv6 && ipv6.length <= 45 && isIPv6(ipv6)) {
    return ipv6;
  }

  const value = headers.get("cf-connecting-ip")?.trim();
  if (!value || value.length > 45 || !(isIPv4(value) || isIPv6(value))) {
    return;
  }
  return value;
}

export function buildUpstreamHeaders(
  requestHeaders: Headers,
  upstreamHost: string,
  clientUrl: URL
) {
  const clientIp = getCloudflareClientIp(requestHeaders);
  const headers = new Headers(requestHeaders);

  for (const header of [...headers.keys()]) {
    if (
      header.startsWith("x-forwarded-") ||
      UNTRUSTED_FORWARDING_HEADERS.has(header)
    ) {
      headers.delete(header);
    }
  }

  if (clientIp) {
    // Hertz reads X-Forwarded-For before X-Real-IP. Replace both values so a
    // caller cannot prepend a spoofed address to the forwarding chain.
    headers.set("x-forwarded-for", clientIp);
    headers.set("x-real-ip", clientIp);
  }

  headers.set("Host", upstreamHost);
  headers.set("x-forwarded-host", clientUrl.host);
  headers.set(
    "x-forwarded-port",
    clientUrl.port || (clientUrl.protocol === "https:" ? "443" : "80")
  );
  headers.set("x-forwarded-proto", clientUrl.protocol.replace(/:$/, ""));
  headers.delete("cf-ipcountry");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");

  return headers;
}

function configurationError(message: string) {
  return new Response(message, {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function withCorsHeaders(headers: Headers, origin: string) {
  const corsHeaders = new Headers(headers);
  corsHeaders.set("Access-Control-Allow-Origin", origin);
  corsHeaders.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  corsHeaders.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  return corsHeaders;
}

export async function proxyRequest(
  request: Request,
  env: Env,
  upstreamFetch: typeof fetch = fetch
) {
  const configuredApiBase = env.API_BASE_URL?.trim();
  if (!configuredApiBase) {
    return configurationError(
      "API proxy is not configured: API_BASE_URL is required."
    );
  }

  let apiBaseUrl: URL;
  try {
    apiBaseUrl = new URL(configuredApiBase);
  } catch {
    return configurationError(
      "API proxy is misconfigured: API_BASE_URL must be a valid HTTP(S) URL."
    );
  }

  if (apiBaseUrl.protocol !== "http:" && apiBaseUrl.protocol !== "https:") {
    return configurationError(
      "API proxy is misconfigured: API_BASE_URL must use HTTP(S)."
    );
  }

  if (
    apiBaseUrl.username ||
    apiBaseUrl.password ||
    apiBaseUrl.pathname !== "/" ||
    configuredApiBase.includes("?") ||
    configuredApiBase.includes("#")
  ) {
    return configurationError(
      "API proxy is misconfigured: API_BASE_URL must be an origin without credentials, path, query, or fragment."
    );
  }

  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: withCorsHeaders(new Headers(), url.origin),
    });
  }

  const targetUrl = `${apiBaseUrl.origin}${url.pathname}${url.search}`;

  const headers = buildUpstreamHeaders(request.headers, apiBaseUrl.host, url);

  const init: RequestInit = {
    method: request.method,
    headers,
    // Apple Sign-In posts to the backend callback, which responds with a 302
    // to the frontend callback page. That redirect must reach the browser;
    // following it inside the proxy loses both the Location and navigation.
    redirect: "manual",
  };

  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.body !== null
  ) {
    init.body = request.body;
  }

  const response = await upstreamFetch(targetUrl, init);

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("set-cookie");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: withCorsHeaders(responseHeaders, url.origin),
  });
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) =>
  proxyRequest(request, env);
