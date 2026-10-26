import yaml from "js-yaml";
import {
  resolveTutorialBasePath,
  resolveTutorialRelativePath,
  TUTORIAL_DOCUMENT,
} from "@/config";

const MARKDOWN_IMAGE_PATTERN =
  /!\[([^\]]*)\]\(\s*(<[^>\n]+>|[^\s)\n]+)(\s+(?:"[^"\n]*"|'[^'\n]*'|\([^\n)]*\)))?\s*\)/g;

export interface TutorialItem {
  title: string;
  path: string;
  icon?: string;
  updated_at?: string;
  subItems?: TutorialItem[];
}

function getTutorialRequestPath(
  path: string,
  basePath: string | null = TUTORIAL_DOCUMENT
): string {
  const safeBasePath = resolveTutorialBasePath(basePath ?? undefined);
  if (!safeBasePath) {
    throw new Error("Local tutorial documents are disabled");
  }

  const safePath = resolveTutorialRelativePath(path);
  if (!safePath) {
    throw new Error("Tutorial paths must be safe relative paths");
  }

  return `${safeBasePath}/${safePath}`;
}

function getUrlPrefix(url: string): string {
  return url.slice(0, url.lastIndexOf("/") + 1);
}

function resolveSameOriginAssetPath(
  path: string,
  relativePrefix: string
): string | null {
  if (path.startsWith("/")) {
    const rootRelativePath = resolveTutorialRelativePath(path.slice(1));
    return rootRelativePath ? `/${rootRelativePath}` : null;
  }

  const relativePath = resolveTutorialRelativePath(path);
  return relativePath ? `${relativePrefix}${relativePath}` : null;
}

/** Guard image sources, including sources originating in raw Markdown HTML. */
export function isSameOriginTutorialAssetPath(path: unknown): path is string {
  return (
    typeof path === "string" && resolveSameOriginAssetPath(path, "") !== null
  );
}

/**
 * Prefix relative Markdown images with the local document directory. Unsafe,
 * remote, and traversal image destinations are reduced to their alt text so
 * rendering a local tutorial cannot trigger an unexpected asset request.
 */
export function addPrefixToImageUrls(markdown: string, prefix: string): string {
  return markdown.replace(
    MARKDOWN_IMAGE_PATTERN,
    (_match, imgAlt: string, rawImgUrl: string, title = "") => {
      const angleWrapped = rawImgUrl.startsWith("<");
      const imgUrl = angleWrapped ? rawImgUrl.slice(1, -1) : rawImgUrl;
      const resolved = resolveSameOriginAssetPath(imgUrl, prefix);

      if (!resolved) {
        return imgAlt;
      }

      const destination = angleWrapped ? `<${resolved}>` : resolved;
      return `![${imgAlt}](${destination}${title})`;
    }
  );
}

export async function getTutorial(
  path: string,
  basePath: string | null = TUTORIAL_DOCUMENT
): Promise<{
  config?: Record<string, unknown>;
  content: string;
}> {
  const url = getTutorialRequestPath(path, basePath);
  const response = await fetch(url, {
    credentials: "same-origin",
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const text = await response.text();
  const match = text.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n?([\s\S]*)$/);
  let config: Record<string, unknown> | undefined;
  let content = text;

  if (match) {
    content = match[2] || "";
    try {
      const parsed = yaml.load(match[1] || "");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        config = parsed as Record<string, unknown>;
      }
    } catch (error) {
      console.error("Error parsing YAML frontmatter:", error);
    }
  }

  return {
    config,
    content: addPrefixToImageUrls(content, getUrlPrefix(url)),
  };
}

function sanitizeTutorialItem(
  value: unknown,
  basePath: string
): TutorialItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const item = value as Record<string, unknown>;
  const title = typeof item.title === "string" ? item.title.trim() : "";
  const path =
    typeof item.path === "string"
      ? resolveTutorialRelativePath(item.path)
      : null;
  if (!(title && path)) {
    return null;
  }

  const tutorialItem: TutorialItem = { path, title };
  if (typeof item.updated_at === "string") {
    tutorialItem.updated_at = item.updated_at;
  }
  if (typeof item.icon === "string") {
    const icon = resolveSameOriginAssetPath(item.icon, `${basePath}/`);
    if (icon) {
      tutorialItem.icon = icon;
    }
  }
  if (Array.isArray(item.subItems)) {
    const subItems = item.subItems
      .map((subItem) => sanitizeTutorialItem(subItem, basePath))
      .filter((subItem): subItem is TutorialItem => subItem !== null);
    if (subItems.length > 0) {
      tutorialItem.subItems = subItems;
    }
  }

  return tutorialItem;
}

export async function getTutorialList(
  basePath: string | null = TUTORIAL_DOCUMENT
): Promise<Map<string, TutorialItem[]>> {
  const safeBasePath = resolveTutorialBasePath(basePath ?? undefined);
  if (!safeBasePath) {
    return new Map();
  }

  const { config, content } = await getTutorial("SUMMARY.md", safeBasePath);
  if (!config) {
    return parseTutorialToMap(content);
  }

  const navigation = new Map<string, TutorialItem[]>();
  for (const [locale, value] of Object.entries(config)) {
    if (!Array.isArray(value)) {
      continue;
    }

    const items = value
      .map((item) => sanitizeTutorialItem(item, safeBasePath))
      .filter((item): item is TutorialItem => item !== null);
    navigation.set(locale, items);
  }

  return navigation;
}

export function parseTutorialToMap(
  markdown: string
): Map<string, TutorialItem[]> {
  const map = new Map<string, TutorialItem[]>();
  let currentSection = "";
  let currentParent: TutorialItem | undefined;
  const lines = markdown.split("\n");

  for (const line of lines) {
    if (line.startsWith("## ")) {
      currentSection = line.replace("## ", "").trim();
      currentParent = undefined;
      map.set(currentSection, []);
    } else if (line.startsWith("* ")) {
      const [, text, link] = line.match(/\* \[(.*?)\]\((.*?)\)/) || [];
      const path = link ? resolveTutorialRelativePath(link) : null;
      currentParent = undefined;
      if (text && path) {
        if (!map.has(currentSection)) {
          map.set(currentSection, []);
        }
        currentParent = { path, title: text };
        map.get(currentSection)?.push(currentParent);
      }
    } else if (line.startsWith("  * ")) {
      const [, text, link] = line.match(/\* \[(.*?)\]\((.*?)\)/) || [];
      const path = link ? resolveTutorialRelativePath(link) : null;
      if (text && path && currentParent) {
        currentParent.subItems ??= [];
        currentParent.subItems.push({ path, title: text });
      }
    }
  }

  return map;
}
