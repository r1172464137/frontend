import { describe, expect, it } from "vitest";
import { parseUniqueObject } from "./json-unique";

describe("raw JSON object validation", () => {
  it("accepts nested unique keys and preserves meaningful raw data", () => {
    expect(
      parseUniqueObject(' {"a": [{"key":1}, {"key":2}], "text":"  keep  "} ')
    ).toEqual({ a: [{ key: 1 }, { key: 2 }], text: "  keep  " });
  });
  it.each([
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"x":{"a":1,"a":2}}',
    "[]",
    '{"value":"\\ud800"}',
  ])("rejects invalid or duplicate object %s", (raw) => {
    expect(parseUniqueObject(raw)).toBeUndefined();
  });
});
