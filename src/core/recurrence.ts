import type { RecurrenceRule } from "./types";
import { addDays, daysInMonth, diffDays, parseISODate, startOfWeek, toISODate, weekdayMon0, WEEKDAYS } from "./dates";

/**
 * Récurrence : un élément récurrent est UNE ligne (la « prochaine occurrence »).
 * - Quand on la termine, une copie terminée part dans l'historique et la ligne avance
 *   à l'occurrence suivante (≥ aujourd'hui) → jamais d'occurrences orphelines à nettoyer.
 * - Le calendrier affiche les occurrences futures calculées à la volée (projections).
 */

function matches(rule: RecurrenceRule, anchor: string, day: Date): boolean {
  const iso = toISODate(day);
  const a = parseISODate(anchor);
  if (iso < anchor) return false;
  const interval = Math.max(1, rule.interval || 1);
  switch (rule.freq) {
    case "daily":
      return diffDays(iso, anchor) % interval === 0;
    case "weekly": {
      const days = rule.byWeekday?.length ? rule.byWeekday : [weekdayMon0(a)];
      if (!days.includes(weekdayMon0(day))) return false;
      const weeks = Math.round((startOfWeek(day).getTime() - startOfWeek(a).getTime()) / (7 * 86400000));
      return weeks % interval === 0;
    }
    case "monthly": {
      const target = rule.byMonthDay ?? a.getDate();
      const months = (day.getFullYear() - a.getFullYear()) * 12 + (day.getMonth() - a.getMonth());
      if (months % interval !== 0) return false;
      const dim = daysInMonth(day.getFullYear(), day.getMonth());
      return day.getDate() === Math.min(target, dim);
    }
    case "yearly": {
      const years = day.getFullYear() - a.getFullYear();
      if (years % interval !== 0) return false;
      const dim = daysInMonth(day.getFullYear(), a.getMonth());
      return day.getMonth() === a.getMonth() && day.getDate() === Math.min(a.getDate(), dim);
    }
  }
}

/** Première occurrence STRICTEMENT après `after` (et ≥ `notBefore` si fourni). */
export function nextOccurrence(rule: RecurrenceRule, anchor: string, after: string, notBefore?: string): string | null {
  let start = addDays(parseISODate(after), 1);
  if (notBefore && toISODate(start) < notBefore) start = parseISODate(notBefore);
  for (let i = 0; i < 366 * 5; i++) {
    const d = addDays(start, i);
    if (matches(rule, anchor, d)) return toISODate(d);
  }
  return null;
}

/** Première occurrence ≥ `from` (utile à la création : « tous les lundis » → lundi prochain). */
export function firstOccurrence(rule: RecurrenceRule, from: string): string {
  const anchor = from;
  for (let i = 0; i < 366 * 2; i++) {
    const d = addDays(parseISODate(from), i);
    if (matches(rule, anchor, d)) return toISODate(d);
  }
  return from;
}

/** Occurrences dans [start, end] (dates ISO incluses), à partir de l'ancre. */
export function occurrencesBetween(rule: RecurrenceRule, anchor: string, start: string, end: string): string[] {
  const out: string[] = [];
  let d = parseISODate(start < anchor ? anchor : start);
  const last = parseISODate(end);
  while (d <= last && out.length < 400) {
    if (matches(rule, anchor, d)) out.push(toISODate(d));
    d = addDays(d, 1);
  }
  return out;
}

export function describeRule(rule: RecurrenceRule): string {
  const n = rule.interval || 1;
  switch (rule.freq) {
    case "daily":
      return n === 1 ? "Tous les jours" : `Tous les ${n} jours`;
    case "weekly": {
      const days = (rule.byWeekday ?? []).slice().sort();
      const names = days.map((d) => WEEKDAYS[d]);
      const list = names.length > 1 ? names.slice(0, -1).join(", ") + " et " + names[names.length - 1] : names[0];
      if (days.length === 5 && days.every((d, i) => d === i)) return "En semaine";
      if (!list) return n === 1 ? "Chaque semaine" : `Toutes les ${n} semaines`;
      return n === 1 ? `Chaque ${list}` : `Un ${list} sur ${n}`;
    }
    case "monthly": {
      const d = rule.byMonthDay;
      const day = d === 1 ? "le 1er" : d ? `le ${d}` : "";
      return n === 1 ? `Chaque mois${day ? " " + day : ""}` : `Tous les ${n} mois${day ? " " + day : ""}`;
    }
    case "yearly":
      return n === 1 ? "Chaque année" : `Tous les ${n} ans`;
  }
}
