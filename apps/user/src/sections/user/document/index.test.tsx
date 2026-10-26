// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Document from "./index";

const mocks = vi.hoisted(() => ({
  getDocumentList: vi.fn(),
  getTutorialList: vi.fn(),
  showTutorial: false,
  tutorialDocument: "./assets/tutorial" as string | null,
  tutorialModuleLoaded: vi.fn(),
  tutorialUiModuleLoaded: vi.fn(),
}));

vi.mock("@/config", async (importOriginal) => {
  const config = await importOriginal<typeof import("@/config")>();
  return {
    ...config,
    get TUTORIAL_DOCUMENT() {
      return mocks.tutorialDocument;
    },
  };
});

vi.mock("@workspace/ui/services/user/user", () => ({
  getV1PublicDocumentList: mocks.getDocumentList,
}));

vi.mock("@/sections/user/document/tutorial", () => {
  mocks.tutorialModuleLoaded();
  return { getTutorialList: mocks.getTutorialList };
});

vi.mock("@/sections/user/document/document-button", () => ({
  DocumentButton: () => null,
}));

vi.mock("@/sections/user/document/tutorial-button", () => {
  mocks.tutorialUiModuleLoaded();
  return { TutorialButton: () => null };
});

vi.mock("@workspace/ui/composed/empty", () => ({
  default: () => <div>Empty</div>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en-US" },
    t: (_key: string, fallback: string) => fallback,
  }),
}));

vi.mock("@/stores/global", () => ({
  useGlobalStore: () => ({
    common: { subscribe: { show_tutorial: mocks.showTutorial } },
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.showTutorial = false;
  mocks.tutorialDocument = "./assets/tutorial";
});

describe("user documents", () => {
  it("does not load the tutorial index when the backend disables tutorials", async () => {
    mocks.getDocumentList.mockResolvedValue({
      data: { data: { list: [] } },
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Document />
      </QueryClientProvider>
    );

    await waitFor(() => expect(mocks.getDocumentList).toHaveBeenCalledOnce());
    expect(mocks.getTutorialList).not.toHaveBeenCalled();
    expect(mocks.tutorialModuleLoaded).not.toHaveBeenCalled();
    expect(mocks.tutorialUiModuleLoaded).not.toHaveBeenCalled();
    queryClient.clear();
  });

  it("does not load tutorial code when no local tutorial is configured", async () => {
    mocks.showTutorial = true;
    mocks.tutorialDocument = null;
    mocks.getDocumentList.mockResolvedValue({
      data: { data: { list: [] } },
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Document />
      </QueryClientProvider>
    );

    await waitFor(() => expect(mocks.getDocumentList).toHaveBeenCalledOnce());
    expect(mocks.getTutorialList).not.toHaveBeenCalled();
    expect(mocks.tutorialModuleLoaded).not.toHaveBeenCalled();
    expect(mocks.tutorialUiModuleLoaded).not.toHaveBeenCalled();
    queryClient.clear();
  });
});
