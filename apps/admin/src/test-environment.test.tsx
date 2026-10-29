// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act, useState } from "react";
import { afterEach, expect, it } from "vitest";

afterEach(cleanup);

it("runs React component tests in the test environment, not production", () => {
  expect(process.env.NODE_ENV).toBe("test");
  expect(import.meta.env.PROD).toBe(false);
  expect(import.meta.env.DEV).toBe(true);
  expect(typeof act).toBe("function");
  function Counter() {
    const [count, setCount] = useState(0);
    return (
      <button onClick={() => setCount(count + 1)} type="button">
        {count}
      </button>
    );
  }
  render(<Counter />);
  fireEvent.click(screen.getByRole("button", { name: "0" }));
  expect(screen.getByRole("button", { name: "1" })).toBeTruthy();
});
