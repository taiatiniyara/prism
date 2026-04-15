import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantPanel } from "@/components/ai/assistant-panel";

describe("assistant keyboard accessibility", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders focusable interactive controls", () => {
    render(<AssistantPanel />);

    const prompt = screen.getByLabelText("Ask a reporting question");
    const queryClass = screen.getByLabelText("Query class");
    const reportPeriod = screen.getByLabelText("Report period ID");
    const serviceArea = screen.getByLabelText("Service area ID");
    const submit = screen.getByRole("button", { name: "Run query" });

    prompt.focus();
    expect(prompt).toHaveFocus();

    queryClass.focus();
    expect(queryClass).toHaveFocus();

    reportPeriod.focus();
    expect(reportPeriod).toHaveFocus();

    serviceArea.focus();
    expect(serviceArea).toHaveFocus();

    submit.focus();
    expect(submit).toHaveFocus();
  });
});
