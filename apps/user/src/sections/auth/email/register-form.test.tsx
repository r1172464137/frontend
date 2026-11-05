// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RegisterForm from "./register-form";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@/stores/global", () => ({
  useGlobalStore: () => ({
    common: {
      auth: {
        email: { enable_domain_suffix: false, enable_verify: false },
        register: { stop_register: false },
      },
      invite: { forced_invite: false },
      verify: { enable_register_verify: false },
    },
  }),
}));

afterEach(cleanup);

describe("email registration password", () => {
  it.each([
    7, 8, 128, 129,
  ])("validates length %i before submitting", async (length) => {
    const onSubmit = vi.fn();
    const password = "a".repeat(length);
    render(
      <RegisterForm
        initialValues={{
          email: "fixture@example.test",
          password: "",
          repeat_password: "",
        }}
        onSubmit={onSubmit}
        onSwitchForm={vi.fn()}
        setInitialValues={vi.fn()}
      />
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "Enter your password (at least 8 characters)..."
      ),
      { target: { value: password } }
    );
    fireEvent.change(screen.getByPlaceholderText("Enter password again..."), {
      target: { value: password },
    });
    fireEvent.submit(
      screen
        .getByPlaceholderText("Enter your password (at least 8 characters)...")
        .closest("form")!
    );
    if (length < 8 || length > 128) {
      await screen.findByText("Password must be 8-128 characters");
      expect(onSubmit).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ password })
      );
    }
  });
});
