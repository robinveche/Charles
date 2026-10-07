/** Petites fonctions de dates locales (sans dépendance), toutes en heure locale. */

export const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function toHM(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
/** Date+heure locale → Date. Sans heure : fin de journée (23:59) pour le calcul du retard. */
export function toDateTime(date: string, time: string | null, endOfDayIfNoTime = false): Date {
  const d = parseISODate(date);
  if (time) {
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
  } else if (endOfDayIfNoTime) d.setHours(23, 59, 59, 0);
  return d;
}
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
export function addDaysISO(s: string, n: number): string {
  return toISODate(addDays(parseISODate(s), n));
}
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
/** 0 = lundi … 6 = dimanche */
export function weekdayMon0(d: Date): number {
  return (d.getDay() + 6) % 7;
}
export function startOfWeek(d: Date): Date {
  return addDays(startOfDay(d), -weekdayMon0(d));
}
export function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate();
}
export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86400000);
}
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function fromMinutes(min: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
export const WEEKDAYS_SHORT = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
export const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
export const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Mercredi 7 octobre" */
export function longDate(s: string): string {
  const d = parseISODate(s);
  return cap(`${WEEKDAYS[weekdayMon0(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`);
}
/** "mer. 7 oct." */
export function shortDate(s: string): string {
  const d = parseISODate(s);
  return `${WEEKDAYS_SHORT[weekdayMon0(d)]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}
/** Libellé relatif : Aujourd'hui, Demain, Hier, Jeudi, ou "Lun. 12 oct." */
export function relativeDay(s: string, today = toISODate(new Date())): string {
  const diff = diffDays(s, today);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  if (diff === -1) return "Hier";
  if (diff === 2) return "Après-demain";
  if (diff > 1 && diff < 7) return cap(WEEKDAYS[weekdayMon0(parseISODate(s))]);
  return cap(shortDate(s));
}
/** "14h" / "14h30" pour l'affichage compact ; on garde HH:mm partout ailleurs. */
export function fmtTime(t: string | null): string {
  return t ?? "";
}
export function fmtReminder(min: number): string {
  if (min === 0) return "À l'heure";
  if (min < 60) return `${min} min avant`;
  if (min < 1440) return `${min / 60} h avant`;
  return min === 1440 ? "1 jour avant" : `${Math.round(min / 1440)} jours avant`;
}
