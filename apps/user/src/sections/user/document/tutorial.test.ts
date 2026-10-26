import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addPrefixToImageUrls,
  getTutorial,
  getTutorialList,
  isSameOriginTutorialAssetPath,
} from "./tutorial";

function markdownResponse(markdown: string): Response {
  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(markdown),
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("local tutorial requests", () => {
  it("fetches Markdown only from the configured same-origin path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      markdownResponse(`---
title: Getting started
---
# Getting started

![Step](images/step.png)
`)
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getTutorial("guides/start.md", "/assets/tutorial")
    ).resolves.toEqual({
      config: { title: "Getting started" },
      content:
        "# Getting started\n\n![Step](/assets/tutorial/guides/images/step.png)\n",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/assets/tutorial/guides/start.md", {
      credentials: "same-origin",
      redirect: "error",
    });
  });

  it.each([
    "../secret.md",
    "guides/../../secret.md",
    "/secret.md",
    "https://example.com/secret.md",
    "//example.com/secret.md",
    "%2e%2e/secret.md",
  ])("rejects an unsafe document path before fetch: %s", async (path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTutorial(path, "/assets/tutorial")).rejects.toThrow(
      "safe relative paths"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fall back to a remote tutorial when the local file fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTutorial("SUMMARY.md", "/assets/tutorial")).rejects.toThrow(
      "status: 404"
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/assets/tutorial/SUMMARY.md");
  });
});

describe("tutorial Markdown", () => {
  it("prefixes local images and prevents remote or traversal image requests", () => {
    const markdown = [
      "![Relative](images/step.png)",
      '![Titled](<images/step two.png> "Step two")',
      "![Root local](/assets/tutorial/shared.png)",
      "![Remote](https://example.com/step.png)",
      "![Traversal](../private.png)",
    ].join("\n");

    expect(addPrefixToImageUrls(markdown, "/assets/tutorial/guides/")).toBe(
      [
        "![Relative](/assets/tutorial/guides/images/step.png)",
        '![Titled](</assets/tutorial/guides/images/step two.png> "Step two")',
        "![Root local](/assets/tutorial/shared.png)",
        "Remote",
        "Traversal",
      ].join("\n")
    );
  });

  it("rejects remote image sources that bypass Markdown prefixing", () => {
    expect(isSameOriginTutorialAssetPath("./assets/tutorial/step.png")).toBe(
      true
    );
    expect(isSameOriginTutorialAssetPath("/assets/tutorial/step.png")).toBe(
      true
    );
    expect(isSameOriginTutorialAssetPath("https://example.com/step.png")).toBe(
      false
    );
    expect(isSameOriginTutorialAssetPath("../step.png")).toBe(false);
  });

  it("parses a Markdown summary while dropping unsafe entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      markdownResponse(`## en-US
* [Getting started](guides/start.md)
  * [Desktop](guides/desktop.md)
* [Remote](https://example.com/remote.md)
* [Traversal](../private.md)
`)
    );
    vi.stubGlobal("fetch", fetchMock);

    const tutorials = await getTutorialList("/assets/tutorial");

    expect(tutorials.get("en-US")).toEqual([
      {
        path: "guides/start.md",
        subItems: [{ path: "guides/desktop.md", title: "Desktop" }],
        title: "Getting started",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/assets/tutorial/SUMMARY.md", {
      credentials: "same-origin",
      redirect: "error",
    });
  });

  it("prefixes frontmatter icons with the local tutorial root", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      markdownResponse(`---
en-US:
  - title: Getting started
    path: guides/start.md
    icon: icons/start.png
  - title: Remote icon is ignored
    path: guides/remote-icon.md
    icon: https://example.com/icon.png
---
`)
    );
    vi.stubGlobal("fetch", fetchMock);

    const tutorials = await getTutorialList("./assets/tutorial");

    expect(tutorials.get("en-US")).toEqual([
      {
        icon: "./assets/tutorial/icons/start.png",
        path: "guides/start.md",
        title: "Getting started",
      },
      {
        path: "guides/remote-icon.md",
        title: "Remote icon is ignored",
      },
    ]);
  });
});
