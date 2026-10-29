// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DNSEditor } from "./dns-editor";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      fallback: string,
      values?: Record<string, string | number>
    ) =>
      Object.entries(values || {}).reduce(
        (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
        fallback
      ),
  }),
}));
afterEach(cleanup);
function Host() {
  const [value, setValue] = useState<API.NodeDNS[]>([]);
  return (
    <>
      <DNSEditor onChange={setValue} value={value} />
      <button onClick={() => setValue([])} type="button">
        External reset
      </button>
    </>
  );
}
describe("UDP DNS editor", () => {
  it("preserves every typed character and blank line and reports actual regexp line numbers", () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "Add UDP resolver" }));
    expect(screen.getByText("UDP")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByPlaceholderText(/TLS server name/i)).toBeNull();
    const textarea = screen.getByLabelText(
      "Domain rules"
    ) as HTMLTextAreaElement;
    const draft = "geosite:cn\n\nregexp:(?=foo)\nregexp:[\n";
    for (let i = 1; i <= draft.length; i += 1) {
      fireEvent.change(textarea, { target: { value: draft.slice(0, i) } });
      expect(textarea.value).toBe(draft.slice(0, i));
    }
    expect(
      screen.getByText(/Line 3: RE2 does not support lookahead or lookbehind/)
    ).toBeTruthy();
    expect(
      screen.getByText(/Line 4: the regular expression is invalid/)
    ).toBeTruthy();
  });
  it("honors an external empty array and never resurrects a deleted text draft", () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "Add UDP resolver" }));
    fireEvent.change(screen.getByLabelText("Resolver address"), {
      target: { value: "1.1.1.1:53" },
    });
    fireEvent.change(screen.getByLabelText("Domain rules"), {
      target: { value: "geosite:cn\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "External reset" }));
    expect(screen.queryByLabelText("Resolver address")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add UDP resolver" }));
    expect(
      (screen.getByLabelText("Resolver address") as HTMLInputElement).value
    ).toBe("");
    expect(
      (screen.getByLabelText("Domain rules") as HTMLTextAreaElement).value
    ).toBe("");
  });
});
