import { describe, expect, it } from "vitest";
import { addBusinessDays, followupTitle } from "./store";

describe("relances", () => {
  it("titre", () => {
    expect(followupTitle("Appeler Thomas")).toBe("Relancer Thomas");
    expect(followupTitle("RDV avec Iconik Cuisines")).toBe("Relancer Iconik Cuisines");
    expect(followupTitle("Réunion client Martin")).toBe("Relancer client Martin");
    expect(followupTitle("Pitch Défi")).toBe("Relancer — Pitch Défi");
  });
  it("jours ouvrés", () => {
    expect(addBusinessDays("2026-10-07", 3)).toBe("2026-10-12"); // mer. + 3 j ouvrés = lun.
    expect(addBusinessDays("2026-10-09", 1)).toBe("2026-10-12"); // ven. + 1 = lun.
  });
});
