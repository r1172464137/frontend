// Validate JSON object keys before handing raw settings to the backend/node.
// JSON.parse alone silently keeps the last duplicate key.
export function parseUniqueObject(
  raw: string
): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    let index = 0;
    const skip = () => {
      while (/\s/.test(raw[index] || "") && index < raw.length) index += 1;
    };
    function stringToken() {
      const start = index++;
      while (index < raw.length) {
        if (raw[index] === "\\") {
          index += 2;
          continue;
        }
        if (raw[index++] === '"') {
          const value: unknown = JSON.parse(raw.slice(start, index));
          if (typeof value !== "string" || /[\uD800-\uDFFF]/u.test(value))
            throw new Error("invalid string");
          return value;
        }
      }
      throw new Error("unterminated string");
    }
    function value(depth: number): void {
      if (depth > 64) throw new Error("too deeply nested");
      skip();
      if (raw[index] === "{") {
        index += 1;
        skip();
        const keys = new Set<string>();
        if (raw[index] === "}") {
          index += 1;
          return;
        }
        while (index < raw.length) {
          skip();
          if (raw[index] !== '"') throw new Error("invalid key");
          const key = stringToken();
          if (keys.has(key)) throw new Error("duplicate key");
          keys.add(key);
          skip();
          if (raw[index++] !== ":") throw new Error("missing colon");
          value(depth + 1);
          skip();
          if (raw[index] === "}") {
            index += 1;
            return;
          }
          if (raw[index++] !== ",") throw new Error("missing comma");
        }
      } else if (raw[index] === "[") {
        index += 1;
        skip();
        if (raw[index] === "]") {
          index += 1;
          return;
        }
        while (index < raw.length) {
          value(depth + 1);
          skip();
          if (raw[index] === "]") {
            index += 1;
            return;
          }
          if (raw[index++] !== ",") throw new Error("missing comma");
        }
      } else if (raw[index] === '"') {
        stringToken();
        return;
      } else {
        const match = raw
          .slice(index)
          .match(
            /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/
          );
        if (!match) throw new Error("invalid value");
        index += match[0].length;
        return;
      }
      throw new Error("incomplete JSON");
    }
    value(0);
    skip();
    if (index !== raw.length) return;
    return parsed as Record<string, unknown>;
  } catch {
    return;
  }
}
