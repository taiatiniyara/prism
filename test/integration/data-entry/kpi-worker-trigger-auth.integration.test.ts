import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

describe("kpi worker trigger auth", () => {
  it("denies unauthorized worker-trigger mutation access", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("auth session missing"));

    const { updateDataEntryValueAction } =
      await import("@/app/data-entry/enter-data/service");

    await expect(
      updateDataEntryValueAction({
        inputDefId: 100,
        value: "12",
      }),
    ).rejects.toThrow("auth session missing");
  });
});
