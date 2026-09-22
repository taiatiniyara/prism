import { describe, expect, it } from "vitest";

import { buildRequestContext, getAudienceRegister, isAdminRole } from "@/lib/ai/request-context";

const blo = { role: "BLO", org_id: 24 };
const dev = { role: "DEV", org_id: 12 };

describe("buildRequestContext", () => {
  it("tells a utility user which utility they belong to", () => {
    const s = buildRequestContext(blo);
    expect(s).toContain("Current audience register: Staff / Analyst.");
    expect(s).toContain("This user is a utility role");
    expect(s).toContain("This user belongs to utility_id 24");
    expect(s).toContain("Don't ask which utility they belong to");
  });

  it("gives admins fleet-wide framing and no own-utility line", () => {
    const s = buildRequestContext(dev);
    expect(s).toContain("platform administrator (BMO/DEV)");
    expect(s).not.toContain("belongs to utility_id");
  });

  it("frames external stakeholders and omits the own-utility line without an org", () => {
    const s = buildRequestContext({ role: "EXT", org_id: null });
    expect(s).toContain("external stakeholder");
    expect(s).not.toContain("belongs to utility_id");
  });

  it("appends the earlier-turn summary, utility notice and recap note only when given", () => {
    const bare = buildRequestContext(blo);
    expect(bare).not.toContain("Conversation context");
    expect(bare).not.toContain("IMPORTANT:");
    expect(bare).not.toContain("NOTE: This conversation");

    const full = buildRequestContext(blo, {
      contextSummary: { topics: ["SAIDI", "losses"], key_findings: ["SAIDI improved"] },
      utilityNotice: "Your account is not linked to a utility.",
      conversationTurns: 9,
    });
    expect(full).toContain("Previous topics: SAIDI, losses. Previous findings: SAIDI improved");
    expect(full).toContain("IMPORTANT: Your account is not linked to a utility.");
    expect(full).toContain("This conversation has 9 turns");
    expect(buildRequestContext(blo, { conversationTurns: 8 })).not.toContain("NOTE: This conversation");
  });

  it("is empty for a user with no role", () => {
    expect(buildRequestContext({ role: "", org_id: null })).toBe("");
  });
});

describe("role helpers", () => {
  it("classifies admin roles case-insensitively", () => {
    expect(isAdminRole("bmo")).toBe(true);
    expect(isAdminRole("BLO")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });

  it("maps roles to audience registers with a manager default", () => {
    expect(getAudienceRegister("CEO")).toBe("CEO / Executive / Board");
    expect(getAudienceRegister("DAOF")).toBe("Staff / Analyst");
    expect(getAudienceRegister("EXT")).toBe("Consultant");
    expect(getAudienceRegister("something-else")).toBe("Manager / Operations");
  });
});
