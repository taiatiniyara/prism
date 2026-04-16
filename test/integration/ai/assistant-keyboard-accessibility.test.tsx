import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantPanel } from "@/components/ai/assistant-panel";

describe("assistant keyboard accessibility", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders focusable interactive controls", () => {
    render(<AssistantPanel />);

    const prompt = screen.getByLabelText("Message the assistant");
    const submit = screen.getByRole("button", { name: "Send" });

    prompt.focus();
    expect(prompt).toHaveFocus();

    submit.focus();
    expect(submit).toHaveFocus();
  });
});
