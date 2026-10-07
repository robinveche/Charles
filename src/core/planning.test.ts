import { describe, expect, it } from "vitest";
import { parsePlanning } from "./planning";

describe("journée type", () => {
  it("lignes simples", () => {
    const b = parsePlanning(`
- 8h30 - 9h : Routine & mails
09:00–12:30  Dev Spotwise
12h30 Déjeuner
14h à 18h → MP Finance
`);
    expect(b).toEqual([
      { start: "08:30", end: "09:00", title: "Routine & mails", days: null },
      { start: "09:00", end: "12:30", title: "Dev Spotwise", days: null },
      { start: "12:30", end: "13:30", title: "Déjeuner", days: null },
      { start: "14:00", end: "18:00", title: "MP Finance", days: null },
    ]);
  });
  it("sections par jour + fusion", () => {
    const b = parsePlanning(`
**Lundi**
9h-12h Dev Spotwise
**Mardi**
9h-12h MP Finance
**Mercredi**
9h-12h Dev Spotwise
`);
    expect(b).toEqual([
      { start: "09:00", end: "12:00", title: "Dev Spotwise", days: [0, 2] },
      { start: "09:00", end: "12:00", title: "MP Finance", days: [1] },
    ]);
  });
  it("jours sur la ligne", () => {
    expect(parsePlanning("Lundi, mercredi : 14h-16h Prospection")[0]).toMatchObject({ title: "Prospection", days: [0, 2] });
    expect(parsePlanning("Du lundi au vendredi 7h-7h30 Sport")[0]).toMatchObject({ title: "Sport", days: [0, 1, 2, 3, 4] });
    expect(parsePlanning("Week-end 10h-11h Lecture")[0]).toMatchObject({ title: "Lecture", days: [5, 6] });
  });
});
