import { describe, expect, it } from "vitest";
import uiPackage from "../../../package.json";
import editorSource from "./monaco-editor.tsx?raw";
import runtimeSource from "./monaco-runtime.ts?raw";
import { getMonacoWorkerKind } from "./monaco-worker-label.js";

const MONACO_CDN_PATTERN = /https:\/\/cdn\.jsdelivr\.net\/npm\/monaco-editor/iu;

describe("local Monaco runtime", () => {
  it.each([
    ["json", "json"],
    ["scss", "css"],
    ["handlebars", "html"],
    ["javascript", "typescript"],
    ["markdown", "editor"],
    ["go-template", "editor"],
  ] as const)("routes %s to the %s worker", (label, expected) => {
    expect(getMonacoWorkerKind(label)).toBe(expected);
  });

  it("constructs the editor directly from the installed Monaco package", () => {
    expect(runtimeSource).toContain('import * as monaco from "monaco-editor"');
    expect(runtimeSource).toContain("?worker");
    expect(editorSource).toContain("monaco.editor.create(container");
    expect(editorSource).not.toContain("@monaco-editor/react");
    expect(uiPackage.dependencies).not.toHaveProperty("@monaco-editor/react");
  });

  it("keeps the production source graph free of Monaco CDN URLs", () => {
    expect(runtimeSource).not.toMatch(MONACO_CDN_PATTERN);
    expect(editorSource).not.toMatch(MONACO_CDN_PATTERN);
    expect(JSON.stringify(uiPackage)).not.toMatch(MONACO_CDN_PATTERN);
  });
});
