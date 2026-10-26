const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const MAX_DECODE_PASSES = 5;

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
  });
}

export const DEFAULT_TUTORIAL_BASE_PATH = "./assets/tutorial";

function decodePath(value: string): string | null {
  let decoded = value;

  try {
    for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        return decoded;
      }
      decoded = next;
    }
  } catch {
    return null;
  }

  // Excessively nested encoding is not useful for a static asset path and can
  // obscure traversal or an absolute URL.
  return null;
}

function normalizeRelativePath(value: string): string | null {
  const decoded = decodePath(value.trim());
  if (
    !decoded ||
    decoded.startsWith("/") ||
    decoded.includes("\\") ||
    decoded.includes("?") ||
    decoded.includes("#") ||
    containsControlCharacter(decoded) ||
    URL_SCHEME_PATTERN.test(decoded)
  ) {
    return null;
  }

  const withoutCurrentDirectory = decoded.startsWith("./")
    ? decoded.slice(2)
    : decoded;
  const segments = withoutCurrentDirectory.split("/");

  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null;
  }

  return segments.join("/");
}

/**
 * Accept only path-based, same-origin tutorial roots. An unset or false value
 * disables tutorials. `true` keeps the former boolean setting useful by
 * selecting the conventional local public directory.
 */
export function resolveTutorialBasePath(
  value: string | undefined
): string | null {
  const setting = value?.trim();
  if (!setting || setting.toLowerCase() === "false") {
    return null;
  }

  const candidate =
    setting.toLowerCase() === "true" ? DEFAULT_TUTORIAL_BASE_PATH : setting;
  const decoded = decodePath(candidate);
  if (!decoded || decoded.startsWith("//")) {
    return null;
  }

  const withoutTrailingSlash = decoded.endsWith("/")
    ? decoded.slice(0, -1)
    : decoded;
  const rootRelative = withoutTrailingSlash.startsWith("/");
  const relative = normalizeRelativePath(
    rootRelative ? withoutTrailingSlash.slice(1) : withoutTrailingSlash
  );
  if (!relative) {
    return null;
  }

  return rootRelative ? `/${relative}` : `./${relative}`;
}

/** Validate a path read from the local tutorial index. */
export function resolveTutorialRelativePath(value: string): string | null {
  return normalizeRelativePath(value);
}

// Disabled by default: this repository currently has no reviewed tutorial
// snapshot. Operators may opt in only after placing one in a local public path.
export const TUTORIAL_DOCUMENT = resolveTutorialBasePath(
  import.meta.env.VITE_TUTORIAL_DOCUMENT
);
