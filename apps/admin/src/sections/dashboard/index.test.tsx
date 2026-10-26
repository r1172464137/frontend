// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Dashboard from ".";

vi.mock("./components/statistics", () => ({
  default: () => <div>Dashboard statistics</div>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dashboard", () => {
  it("renders local statistics without requesting remote sponsor data", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<Dashboard />);

    expect(screen.getByText("Dashboard statistics")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
