import { describe, expect, it } from "vitest";
import { parseQuickInput } from "./parser";
import { DEFAULT_CATEGORIES } from "./types";
import { nextOccurrence, occurrencesBetween } from "./recurrence";

// Mercredi 7 octobre 2026, 12:42
const now = new Date(2026, 9, 7, 12, 42);
const categories = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sort: i }));
const p = (s: string) => parseQuickInput(s, { now, categories, defaultReminders: [15] }).draft;

describe("parseur FR", () => {
  it("Relancer Lucas vendredi à 14h", () => {
    const d = p("Relancer Lucas vendredi à 14h");
    expect(d).toMatchObject({ title: "Relancer Lucas", date: "2026-10-09", time: "14:00", categoryId: "followup", reminders: [15] });
  });
  it("RDV Martin mardi 10h", () => {
    const d = p("RDV Martin mardi 10h");
    expect(d).toMatchObject({ title: "RDV Martin", date: "2026-10-13", time: "10:00", categoryId: "event", kind: "event" });
  });
  it("Envoyer dossier demain", () => {
    expect(p("Envoyer dossier demain")).toMatchObject({ title: "Envoyer dossier", date: "2026-10-08", time: null, reminders: [] });
  });
  it("Appeler fournisseur dans 2 heures", () => {
    expect(p("Appeler fournisseur dans 2 heures")).toMatchObject({ title: "Appeler fournisseur", date: "2026-10-07", time: "14:45", categoryId: "call" });
  });
  it("Appeler Thomas demain 14h", () => {
    expect(p("Appeler Thomas demain 14h")).toMatchObject({ title: "Appeler Thomas", date: "2026-10-08", time: "14:00", categoryId: "call" });
  });
  it("même jour de semaine : heure passée → semaine prochaine", () => {
    expect(p("RDV banque mercredi 10h").date).toBe("2026-10-14");
    expect(p("RDV banque mercredi 16h").date).toBe("2026-10-07");
  });
  it("heure seule passée → demain", () => {
    expect(p("Point équipe 9h")).toMatchObject({ date: "2026-10-08", time: "09:00" });
    expect(p("Point équipe à 18h30")).toMatchObject({ date: "2026-10-07", time: "18:30", title: "Point équipe" });
  });
  it("dates absolues", () => {
    expect(p("Payer loyer le 1er novembre").date).toBe("2026-11-01");
    expect(p("Anniversaire Paul 12/03").date).toBe("2027-03-12");
    expect(p("Envoyer facture le 20").date).toBe("2026-10-20");
    expect(p("Envoyer facture le 3").date).toBe("2026-11-03");
    expect(p("Salon 15 octobre 2027").date).toBe("2027-10-15");
  });
  it("moments de journée", () => {
    expect(p("Appeler maman ce soir")).toMatchObject({ date: "2026-10-07", time: "19:00", title: "Appeler maman" });
    expect(p("Préparer réunion demain matin")).toMatchObject({ date: "2026-10-08", time: "09:00", title: "Préparer réunion" });
    expect(p("Déjeuner Lucas jeudi midi")).toMatchObject({ date: "2026-10-08", time: "12:00", categoryId: "event" });
  });
  it("priorités", () => {
    expect(p("Envoyer devis Martin urgent").priority).toBe(2);
    expect(p("Envoyer devis Martin !!").priority).toBe(2);
    expect(p("Envoyer devis Martin !")).toMatchObject({ priority: 1, title: "Envoyer devis Martin" });
  });
  it("récurrences", () => {
    const a = p("Faire comptabilité tous les premiers du mois");
    expect(a).toMatchObject({ title: "Faire comptabilité", date: "2026-11-01", recurrence: { freq: "monthly", byMonthDay: 1 } });
    const b = p("Sport tous les mardi et jeudi à 18h");
    expect(b).toMatchObject({ title: "Sport", date: "2026-10-08", time: "18:00", categoryId: "personal", recurrence: { freq: "weekly", byWeekday: [1, 3] } });
    const c = p("Relancer prospects chaque lundi");
    expect(c).toMatchObject({ title: "Relancer prospects", date: "2026-10-12", recurrence: { freq: "weekly", byWeekday: [0] } });
    expect(p("Méditer tous les jours 7h").recurrence).toMatchObject({ freq: "daily", interval: 1 });
  });
  it("plage horaire", () => {
    expect(p("Réunion client demain de 14h à 15h30")).toMatchObject({ time: "14:00", durationMin: 90, title: "Réunion client" });
  });
  it("hashtag de catégorie", () => {
    expect(p("Préparer slides #travail")).toMatchObject({ categoryId: "work", title: "Préparer slides" });
  });
  it("dans 10 minutes → rappel à l'heure exacte", () => {
    expect(p("Sortir le linge dans 10 minutes")).toMatchObject({ time: "12:52", reminders: [0], title: "Sortir le linge" });
  });
  it("ne casse pas un titre sans date", () => {
    expect(p("Modifier présentation")).toMatchObject({ title: "Modifier présentation", date: null, time: null });
    expect(p("Lire le livre")).toMatchObject({ title: "Lire le livre", date: null });
  });
});

describe("récurrence", () => {
  it("mensuelle clampée au dernier jour", () => {
    expect(nextOccurrence({ freq: "monthly", interval: 1, byMonthDay: 31 }, "2026-01-31", "2026-01-31")).toBe("2026-02-28");
  });
  it("hebdo multi-jours", () => {
    expect(occurrencesBetween({ freq: "weekly", interval: 1, byWeekday: [1, 3] }, "2026-10-06", "2026-10-05", "2026-10-18")).toEqual([
      "2026-10-06", "2026-10-08", "2026-10-13", "2026-10-15",
    ]);
  });
});

describe("combinaisons", () => {
  it("priorité + date + heure", () => {
    expect(p("Appeler Thomas demain 14h !")).toMatchObject({ title: "Appeler Thomas", date: "2026-10-08", time: "14:00", priority: 1 });
    expect(p("! Envoyer devis lundi 9h30")).toMatchObject({ title: "Envoyer devis", date: "2026-10-12", time: "09:30", priority: 1 });
  });
});

describe("durée et projets", () => {
  const projects = [{ id: "spotwise", name: "Spotwise", color: "", sort: 0 }, { id: "mpfinance", name: "MP Finance", color: "", sort: 1 }];
  const q = (s: string) => parseQuickInput(s, { now, categories, projects, defaultReminders: [15] }).draft;
  it("pendant 2h", () => expect(q("Rédiger dossier Défi demain 14h pendant 2h")).toMatchObject({ title: "Rédiger dossier Défi", time: "14:00", durationMin: 120 }));
  it("(1h30) et 45 min", () => {
    expect(q("Montage vidéo (1h30)").durationMin).toBe(90);
    expect(q("Point équipe durée 45 min").durationMin).toBe(45);
  });
  it("tâche sans durée = 0, RDV = 1 h", () => {
    expect(q("Envoyer devis").durationMin).toBe(0);
    expect(q("RDV banque mardi 10h").durationMin).toBe(60);
  });
  it("projet par hashtag ou cité", () => {
    expect(q("Préparer pitch #spotwise")).toMatchObject({ title: "Préparer pitch", projectId: "spotwise" });
    expect(q("Dev Spotwise demain 9h")).toMatchObject({ title: "Dev Spotwise", projectId: "spotwise" });
    expect(q("Flyers #mpfinance #appel")).toMatchObject({ projectId: "mpfinance", categoryId: "call", title: "Flyers" });
  });
});
