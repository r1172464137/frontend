import { describe, expect, it } from "vitest";
import {
  DEFAULT_TUTORIAL_BASE_PATH,
  resolveTutorialBasePath,
  resolveTutorialRelativePath,
} from "./tutorial";

describe("tutorial document configuration", () => {
  it("is disabled unless a local tutorial path is explicitly enabled", () => {
    expect(resolveTutorialBasePath(undefined)).toBeNull();
    expect(resolveTutorialBasePath("")).toBeNull();
    expect(resolveTutorialBasePath("false")).toBeNull();
    expect(resolveTutorialBasePath("FALSE")).toBeNull();
  });

  it("normalizes path-only same-origin tutorial roots", () => {
    expect(resolveTutorialBasePath("true")).toBe(DEFAULT_TUTORIAL_BASE_PATH);
    expect(resolveTutorialBasePath("assets/tutorial")).toBe(
      "./assets/tutorial"
    );
    expect(resolveTutorialBasePath("./assets/tutorial/")).toBe(
      "./assets/tutorial"
    );
    expect(resolveTutorialBasePath("/assets/tutorial")).toBe(
      "/assets/tutorial"
    );
  });

  it.each([
    "https://example.com/tutorial",
    "//example.com/tutorial",
    "file:///tmp/tutorial",
    "../tutorial",
    "assets/../tutorial",
    "assets/%2e%2e/tutorial",
    "assets/%252e%252e/tutorial",
    "assets\\tutorial",
    "assets/tutorial?version=latest",
    "assets/tutorial#section",
  ])("rejects an unsafe tutorial root: %s", (value) => {
    expect(resolveTutorialBasePath(value)).toBeNull();
  });
});

describe("tutorial index paths", () => {
  it("accepts nested relative paths", () => {
    expect(resolveTutorialRelativePath("guides/start.md")).toBe(
      "guides/start.md"
    );
    expect(resolveTutorialRelativePath("./guides/start.md")).toBe(
      "guides/start.md"
    );
  });

  it.each([
    "/guides/start.md",
    "https://example.com/start.md",
    "//example.com/start.md",
    "../start.md",
    "guides/../../start.md",
    "%2e%2e/start.md",
    "C:\\start.md",
  ])("rejects traversal or an absolute document path: %s", (value) => {
    expect(resolveTutorialRelativePath(value)).toBeNull();
  });
});
