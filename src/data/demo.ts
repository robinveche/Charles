import { addDaysISO, toISODate } from "../core/dates";
import { createItem, completeItem, createPlanning, getState, updateItem } from "./store";
import { parsePlanning } from "../core/planning";
import type { ItemDraft } from "../core/types";

/** Données de démonstration (navigateur uniquement, via ?demo=1). */
export async function seedDemo() {
  if (getState().items.length) return;
  const t = toISODate(new Date());
  const base: ItemDraft = { title: "", notes: "", kind: "task", categoryId: "task", priority: 0, date: t, time: null, durationMin: 60, reminders: [], recurrence: null };
  const mk = (p: Partial<ItemDraft>) => createItem({ ...base, ...p });
  await mk({ title: "RDV Iconik Cuisines", kind: "event", categoryId: "event", time: "14:00", durationMin: 60, projectId: "spotwise", reminders: [15], notes: "Showroom, 12 rue des Carmes — 03 83 00 00 00\nPoints : tarifs pack 5 vidéos, exemple TikTok\nhttps://iconik.example.com" });
  await mk({ title: "Relancer Lucas", categoryId: "followup", priority: 2, time: "16:00", reminders: [15] });
  await mk({ title: "Envoyer devis Martin", categoryId: "work", priority: 1, projectId: "mpfinance", durationMin: 30 });
  await mk({ title: "Modifier présentation", categoryId: "work" });
  await mk({ title: "Appeler fournisseur", categoryId: "call", time: "17:30", reminders: [15] });
  await mk({ title: "Relancer Thomas", categoryId: "followup", date: addDaysISO(t, -1), time: "14:00", reminders: [15] });
  await mk({ title: "Rendez-vous client", kind: "event", categoryId: "event", date: addDaysISO(t, 1), time: "09:30", durationMin: 90 });
  await mk({ title: "Relancer Thomas — devis signé ?", categoryId: "followup", date: addDaysISO(t, 2) });
  await mk({ title: "Sport", categoryId: "personal", date: addDaysISO(t, 1), time: "18:00", recurrence: { freq: "weekly", interval: 1, byWeekday: [1, 3] } });
  await mk({ title: "Faire comptabilité", categoryId: "work", date: addDaysISO(t, 20), recurrence: { freq: "monthly", interval: 1, byMonthDay: 1 } });
  await mk({ title: "Lire « The Mom Test »", categoryId: "personal", date: null });
  const a = await mk({ title: "Préparation présentation", categoryId: "work", date: addDaysISO(t, -1) });
  const b = await mk({ title: "Appeler Thomas", categoryId: "call", projectId: "spotwise", durationMin: 15 });
  await completeItem(a.id);
  await completeItem(b.id);
  await createPlanning(parsePlanning("8h30-9h Routine & mails\n9h-12h30 Dev Spotwise\n12h30-13h30 Déjeuner\n14h-17h Prospection commerces\n17h-18h Admin & préparation du lendemain"), [0, 1, 2, 3, 4], false);
  await updateItem(a.id, { doneAt: new Date(Date.now() - 86400000).toISOString() });
}
