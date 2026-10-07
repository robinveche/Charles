import type { Item } from "./types";
import { PLANNING_CATEGORY } from "./types";
import { addDaysISO, minutesOf, toDateTime, toISODate } from "./dates";
import { occurrencesBetween } from "./recurrence";

/** Toutes les règles « qu'est-ce que je dois faire » vivent ici (fonctions pures, testables). */

export const OVERDUE_GRACE_MIN = 30;
export const nowMinutes =(now: Date) => now.getHours() * 60 + now.getMinutes();

/** Un rendez-vous dont la date est passée est considéré comme fait (il ne passe jamais « en retard »). */
export function isPastEvent(i: Item, now: Date): boolean {
  if (i.kind !== "event" || !i.date || i.recurrence) return false;
  const end = toDateTime(i.date, i.time, true).getTime() + (i.time ? i.durationMin * 60000 : 0);
  return end < now.getTime() && i.date < toISODate(now);
}

export function isOverdue(i: Item, now: Date): boolean {
  if (i.doneAt || !i.date || i.kind === "event") return false;
  const today = toISODate(now);
  if (i.date < today) return true;
  // 30 min de tolérance : à 14:10, une tâche de 14:00 est « maintenant », pas encore « en retard »
  if (i.date === today && i.time) return minutesOf(i.time) + OVERDUE_GRACE_MIN <= nowMinutes(now);
  return false;
}

/** Tri : urgentes d'abord, puis par heure, puis par date de création. */
export function byPriorityThenTime(a: Item, b: Item): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time) return -1;
  if (b.time) return 1;
  return a.createdAt.localeCompare(b.createdAt);
}
export function byDateTime(a: Item, b: Item): number {
  const da = `${a.date ?? "9999"}T${a.time ?? "99:99"}`;
  const db = `${b.date ?? "9999"}T${b.time ?? "99:99"}`;
  return da.localeCompare(db) || b.priority - a.priority;
}

export const isPlanning = (i: Item) => i.categoryId === PLANNING_CATEGORY;

export interface TodayModel {
  next: Item | null; // prochain élément horodaté (aujourd'hui, sinon le prochain à venir) — hors blocs de planning
  planning: Item[]; // blocs de la journée type, aujourd'hui
  current: Item | null; // bloc de planning en cours (ou le suivant)
  currentState: "now" | "next" | null;
  overdue: Item[];
  today: Item[]; // tâches + rendez-vous du jour (hors « next »)
  someday: Item[]; // tâches sans date
  upcoming: { date: string; items: Item[] }[]; // 7 prochains jours
  counts: { today: number; overdue: number; doneToday: number };
}

export function buildToday(items: Item[], now: Date, lingering: Set<string> = new Set()): TodayModel {
  const today = toISODate(now);
  const nm = nowMinutes(now);
  const visible = (i: Item) => !i.deletedAt && (!i.doneAt || lingering.has(i.id));
  const all = items.filter(visible);
  const active = all.filter((i) => !isPlanning(i));

  // Journée type : blocs du jour (occurrences récurrentes incluses)
  const planning = itemsInRange(all.filter(isPlanning), today, today).filter((i) => i.time).sort(byDateTime);
  let current: Item | null = null;
  let currentState: TodayModel["currentState"] = null;
  for (const b of planning) {
    const s = minutesOf(b.time!);
    if (s <= nm && nm < s + b.durationMin) { current = b; currentState = "now"; break; }
    if (s > nm) { current = b; currentState = "next"; break; }
  }

  const overdue = active.filter((i) => !i.doneAt && isOverdue(i, now)).sort(byDateTime);
  const overdueIds = new Set(overdue.map((i) => i.id));

  // Prochain : premier élément horodaté non fait à partir de maintenant (rendez-vous prioritaires à égalité)
  const timed = active
    .filter((i) => !i.doneAt && i.date && i.time && (i.date > today || (i.date === today && minutesOf(i.time) >= nm - (i.kind === "event" ? i.durationMin : 0))))
    .filter((i) => !overdueIds.has(i.id))
    .sort((a, b) => byDateTime(a, b) || (a.kind === "event" ? -1 : 1));
  const next = timed.find((i) => i.date === today) ?? timed.find((i) => i.date! <= addDaysISO(today, 6)) ?? null;

  const todayList = active
    .filter((i) => i.date === today && !overdueIds.has(i.id) && i.id !== next?.id)
    .filter((i) => !(i.kind === "event" && i.time && minutesOf(i.time) + i.durationMin < nm && !lingering.has(i.id)))
    .sort(byPriorityThenTime);

  const someday = active.filter((i) => !i.date && i.kind === "task").sort(byPriorityThenTime);

  const end = addDaysISO(today, 7);
  const groups = new Map<string, Item[]>();
  for (const i of active) {
    if (i.doneAt || !i.date || i.date <= today || i.date > end || i.id === next?.id) continue;
    if (!groups.has(i.date)) groups.set(i.date, []);
    groups.get(i.date)!.push(i);
  }
  // occurrences futures des éléments récurrents (projections)
  for (const i of active) {
    if (!i.recurrence || !i.date || i.doneAt) continue;
    for (const d of occurrencesBetween(i.recurrence, i.date, addDaysISO(i.date, 1), end)) {
      if (d <= today) continue;
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d)!.push({ ...i, date: d, id: `${i.id}@${d}` });
    }
  }
  const upcoming = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, items: list.sort(byPriorityThenTime) }));

  const doneToday = items.filter((i) => !i.deletedAt && i.doneAt && toISODate(new Date(i.doneAt)) === today).length;
  return {
    next,
    planning,
    current,
    currentState,
    overdue,
    today: todayList,
    someday,
    upcoming,
    counts: { today: todayList.filter((i) => !i.doneAt).length + (next && next.date === today ? 1 : 0), overdue: overdue.length, doneToday },
  };
}

/** Historique : éléments terminés + rendez-vous passés, groupés par jour (le plus récent d'abord). */
export function buildHistory(items: Item[], now: Date): { date: string; items: Item[] }[] {
  const groups = new Map<string, Item[]>();
  for (const i of items) {
    if (i.deletedAt) continue;
    let day: string | null = null;
    if (i.doneAt) day = toISODate(new Date(i.doneAt));
    else if (isPastEvent(i, now)) day = i.date;
    if (!day) continue;
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(i);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => ({ date, items: list.sort((a, b) => (b.doneAt ?? b.date ?? "").localeCompare(a.doneAt ?? a.date ?? "")) }));
}

/** Éléments à afficher sur une plage de dates (calendrier), projections récurrentes incluses. */
export function itemsInRange(items: Item[], start: string, end: string): Item[] {
  // NB : utilisée aussi pour la journée type (blocs récurrents)
  const out: Item[] = [];
  for (const i of items) {
    if (i.deletedAt || !i.date) continue;
    if (i.date >= start && i.date <= end) out.push(i);
    if (i.recurrence && !i.doneAt) {
      for (const d of occurrencesBetween(i.recurrence, i.date, addDaysISO(i.date, 1), end)) {
        if (d >= start) out.push({ ...i, date: d, id: `${i.id}@${d}` });
      }
    }
  }
  return out.sort(byDateTime);
}

export const isProjection = (id: string) => id.includes("@");
export const realId = (id: string) => id.split("@")[0];

export function search(items: Item[], q: string, categoryName: (id: string) => string): Item[] {
  const f = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const terms = f(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return items
    .filter((i) => !i.deletedAt)
    .filter((i) => {
      const hay = f(`${i.title} ${i.notes} ${categoryName(i.categoryId)}`);
      return terms.every((t) => hay.includes(t));
    })
    .sort((a, b) => {
      // actifs d'abord, puis plus récent
      if (!!a.doneAt !== !!b.doneAt) return a.doneAt ? 1 : -1;
      return (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt);
    })
    .slice(0, 50);
}
