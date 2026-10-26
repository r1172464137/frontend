// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Payment from ".";

vi.mock("./payment-table", () => ({
  default: () => <div>Payment configuration</div>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("payment", () => {
  it("renders operator payment configuration without requesting remote sponsor data", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<Payment />);

    expect(screen.getByText("Payment configuration")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
