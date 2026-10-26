// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { Markdown } from "@workspace/ui/composed/markdown";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TutorialMarkdown } from "./tutorial-markdown";

const HOSTILE_MARKDOWN = `# Safe tutorial

![Local image](/assets/tutorial/images/local.png)

![External image](https://tracker.invalid/image.png)

![External reference][tracking-image]

[tracking-image]: https://tracker.invalid/reference.png

<iframe src="https://tracker.invalid/frame"></iframe>

<video src="https://tracker.invalid/video"><source src="https://tracker.invalid/source"></video>

<link rel="stylesheet" href="https://tracker.invalid/style.css">

<style>@import url("https://tracker.invalid/import.css");</style>

<object data="https://tracker.invalid/object"></object>

<embed src="https://tracker.invalid/embed">

<img src="/assets/tutorial/images/raw-local.png" srcset="https://tracker.invalid/one.png 1x, https://tracker.invalid/two.png 2x">
`;

const RESOURCE_BEARING_SELECTOR = [
  "iframe[src]",
  "video[src]",
  "source[src]",
  "link[href]",
  "style",
  "object[data]",
  "embed[src]",
  "[srcset]",
  'img[src^="http://"]',
  'img[src^="https://"]',
  'img[src^="//"]',
].join(",");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("restricted tutorial Markdown", () => {
  it.each([
    { name: "normal", suffix: "" },
    {
      name: "rich",
      suffix: "\n```text\nRich rendering remains available.\n```\n",
    },
  ])("blocks resource-bearing raw HTML and remote images in the $name renderer", async ({
    suffix,
  }) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <TutorialMarkdown>{HOSTILE_MARKDOWN + suffix}</TutorialMarkdown>
    );

    await waitFor(
      () => {
        expect(container.querySelector("h1")?.textContent).toBe(
          "Safe tutorial"
        );
        expect(
          container.querySelector(
            'img[src="/assets/tutorial/images/local.png"]'
          )
        ).not.toBeNull();
      },
      // The rich path cold-loads syntax highlighting and KaTeX chunks on CI.
      // Keep a bounded allowance without sleeping or weakening assertions.
      { timeout: 10_000 }
    );

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(document.querySelectorAll(RESOURCE_BEARING_SELECTOR)).toHaveLength(
      0
    );
    expect(document.documentElement.innerHTML).not.toContain("tracker.invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not change the shared operator Markdown raw HTML default", async () => {
    const { container } = render(
      <Markdown>
        {'<strong data-operator-html="true">Allowed</strong>'}
      </Markdown>
    );

    await waitFor(() => {
      expect(
        container.querySelector('strong[data-operator-html="true"]')
      ).not.toBeNull();
    });
  });
});
