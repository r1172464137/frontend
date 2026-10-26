import { describe, expect, it } from "vitest";
import { resolveLocalIcon } from "./icon.js";
import iconSource from "./icon.tsx?raw";
import { isBundledIcon, loadBundledIcon } from "./icons.js";

const ADMIN_MDI_ICONS = [
  "mdi:alert-circle-outline",
  "mdi:console-line",
  "mdi:dots-horizontal",
  "mdi:pencil-outline",
  "mdi:refresh",
  "mdi:source-branch-sync",
  "mdi:trash-can-outline",
] as const;

describe("local icons", () => {
  it("uses Iconify's offline-only renderer", () => {
    expect(iconSource).toContain('from "@iconify/react/offline"');
    expect(iconSource).not.toContain('from "@iconify/react";');
  });

  it.each(ADMIN_MDI_ICONS)("bundles the admin icon %s", async (name) => {
    expect(isBundledIcon(name)).toBe(true);
    expect((await loadBundledIcon(name))?.body).toBeTruthy();
  });

  it("preserves names from each existing bundled icon group", () => {
    expect(isBundledIcon("flat-color-icons:globe")).toBe(true);
    expect(isBundledIcon("logos:google")).toBe(true);
    expect(isBundledIcon("lucide:chevron-right")).toBe(true);
    expect(isBundledIcon("simple-icons:ios")).toBe(true);
    expect(isBundledIcon("tabler:external-link")).toBe(true);
    expect(isBundledIcon("uil:dashboard")).toBe(true);
  });

  it.each([
    "operator:private-product",
    "flagpack:zz",
    "",
    "not-an-icon",
  ])("resolves unknown name %j to deterministic icon data", (name) => {
    const first = resolveLocalIcon(name);
    const second = resolveLocalIcon(name);

    expect(first).toBe(second);
    expect(first.body).toBeTruthy();
    expect(typeof first).toBe("object");
  });
});
