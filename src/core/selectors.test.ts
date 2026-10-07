import { describe, expect, it } from "vitest";
import type { Item } from "./types";
import { buildHistory, buildToday, isOverdue } from "./selectors";
import { snoozeTarget } from "../data/store";

// Mercredi 7 octobre 2026, 12:42
const now = new Date(2026, 9, 7, 12, 42);
let n = 0;
const mk = (p: Partial<Item>): Item => ({
  id: `i${++n}`, title: "x", notes: "", kind: "task", categoryId: "task", priority: 0, date: null, time: null, durationMin: 60,
  reminders: [], recurrence: null, seriesId: null, doneAt: null, firedKeys: [], contactId: null, source: "local", externalId: null,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", deletedAt: null, projectId: null, ...p,
});

describe("Aujourd'hui", () => {
  const items = [
    mk({ id: "rdv", kind: "event", date: "2026-10-07", time: "14:00" }),
    mk({ id: "late", date: "2026-10-06", time: "14:00" }),
    mk({ id: "late-today", date: "2026-10-07", time: "11:00" }),
    mk({ id: "soon", date: "2026-10-07", time: "12:30" }),
    mk({ id: "urgent", date: "2026-10-07", priority: 2 }),
    mk({ id: "plain", date: "2026-10-07" }),
    mk({ id: "nodate" }),
    mk({ id: "fri", date: "2026-10-09" }),
    mk({ id: "sport", date: "2026-10-08", time: "18:00", recurrence: { freq: "weekly", interval: 1, byWeekday: [1, 3] } }),
    mk({ id: "pastrdv", kind: "event", date: "2026-10-05", time: "10:00" }),
  ];
  const m = buildToday(items, now);
  it("prochain = RDV de 14h", () => expect(m.next?.id).toBe("rdv"));
  it("retards : hier + aujourd'hui (> 30 min), jamais un RDV", () => expect(m.overdue.map((i) => i.id)).toEqual(["late", "late-today"]));
  it("12:30 à 12:42 : pas encore en retard", () => expect(isOverdue(items[3], now)).toBe(false));
  it("urgentes en tête", () => expect(m.today[0].id).toBe("urgent"));
  it("sans date à part", () => expect(m.someday.map((i) => i.id)).toEqual(["nodate"]));
  it("à venir inclut les occurrences récurrentes", () => {
    const dates = m.upcoming.map((g) => g.date);
    expect(dates).toContain("2026-10-08");
    expect(dates).toContain("2026-10-13");
  });
  it("RDV passé → historique", () => expect(buildHistory(items, now)[0].items[0].id).toBe("pastrdv"));
});

describe("report rapide", () => {
  const t = mk({ date: "2026-10-06", time: "14:00" });
  it("+30 min", () => expect(snoozeTarget("30min", t, now)).toEqual({ date: "2026-10-07", time: "13:15" }));
  it("cet après-midi", () => expect(snoozeTarget("afternoon", t, now)).toEqual({ date: "2026-10-07", time: "14:00" }));
  it("demain garde l'heure", () => expect(snoozeTarget("tomorrow", t, now)).toEqual({ date: "2026-10-08", time: "14:00" }));
  it("semaine prochaine = lundi", () => expect(snoozeTarget("nextweek", t, now).date).toBe("2026-10-12"));
});
