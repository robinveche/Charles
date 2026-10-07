import { fold } from "./parser";
import { fromMinutes } from "./dates";

/**
 * Import d'une « journée type » collée en texte libre.
 * Exemples de lignes acceptées :
 *   8h30 - 9h : Routine & mails
 *   09:00–12:30  Dev Spotwise
 *   14h à 18h → MP Finance
 *   12h Déjeuner                      (sans fin → 1 h)
 *   Lundi, mercredi : 9h-12h Prospection   (jours précisés sur la ligne)
 *   Mardi                              (titre de section : s'applique aux lignes suivantes)
 *   Du lundi au vendredi / Lun-Ven / Tous les jours / Week-end
 */

export interface PlanBlock {
  start: string; // HH:mm
  end: string; // HH:mm
  title: string;
  days: number[] | null; // null = jours choisis dans l'interface
}

const DAY_RX: [RegExp, number][] = [
  [/^lun/, 0], [/^mar/, 1], [/^mer/, 2], [/^jeu/, 3], [/^ven/, 4], [/^sam/, 5], [/^dim/, 6],
];
const DAY_WORD = "(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim)s?\\.?";
const dayIndex = (w: string) => DAY_RX.find(([rx]) => rx.test(w))?.[1] ?? -1;

/** Extrait les jours mentionnés dans un morceau de texte plié (sans accents). */
function readDays(t: string): { days: number[] | null; rest: string } {
  let rest = t;
  let days: number[] | null = null;
  const range = new RegExp(`(?:du\\s+)?(${DAY_WORD})\\s*(?:au|a|-|–|→)\\s*(${DAY_WORD})`);
  const m = range.exec(rest);
  if (m) {
    const a = dayIndex(m[1]), b = dayIndex(m[2]);
    if (a >= 0 && b >= 0) {
      days = [];
      for (let d = a; ; d = (d + 1) % 7) { days.push(d); if (d === b || days.length > 7) break; }
      rest = rest.replace(m[0], " ");
    }
  }
  if (!days && /(tous les jours|chaque jour|quotidien)/.test(rest)) { days = [0, 1, 2, 3, 4, 5, 6]; rest = rest.replace(/(tous les jours|chaque jour|quotidien)/, " "); }
  if (!days && /(en semaine|jours ouvres)/.test(rest)) { days = [0, 1, 2, 3, 4]; rest = rest.replace(/(en semaine|jours ouvres)/, " "); }
  if (!days && /week-?end/.test(rest)) { days = [5, 6]; rest = rest.replace(/(le\s+)?week-?end/, " "); }
  if (!days) {
    const found: number[] = [];
    rest = rest.replace(new RegExp(`(?<![a-z])${DAY_WORD}(?![a-z])`, "g"), (w) => {
      const i = dayIndex(w);
      if (i >= 0 && !found.includes(i)) found.push(i);
      return " ";
    });
    if (found.length) days = found.sort();
  }
  return { days, rest };
}

const TIME = "(\\d{1,2})\\s*(?:h|:)\\s*(\\d{2})?";

export function parsePlanning(text: string): PlanBlock[] {
  const out: PlanBlock[] = [];
  let sectionDays: number[] | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[\s•·*\-–—>#]+/, "").replace(/\*\*/g, "").trim();
    if (!line) continue;
    const f = fold(line);
    const range = new RegExp(`${TIME}\\s*(?:-|–|—|a|à|>|→|jusqu'?a)\\s*${TIME}`).exec(f);
    const single = range ? null : new RegExp(`(?<![\\d])${TIME}(?![\\d])`).exec(f);

    if (!range && !single) {
      // pas d'heure : peut-être un titre de section ("Lundi", "Du lundi au vendredi :")
      const { days, rest } = readDays(f);
      if (days && rest.replace(/[^a-z]/g, "").length < 14) sectionDays = days;
      continue;
    }

    const m = (range ?? single)!;
    const h1 = +m[1], m1 = +(m[2] ?? 0);
    let h2: number, m2: number;
    if (range) { h2 = +range[3]; m2 = +(range[4] ?? 0); } else { h2 = h1 + 1; m2 = m1; }
    if (h1 > 23 || h2 > 24 || m1 > 59 || m2 > 59) continue;
    let startMin = h1 * 60 + m1;
    let endMin = h2 * 60 + m2;
    if (endMin <= startMin) endMin = startMin + 60;

    // titre = ligne sans l'heure ni les jours (on travaille sur les positions de la version pliée)
    const before = line.slice(0, m.index);
    const after = line.slice(m.index + m[0].length);
    const fb = readDays(fold(before));
    const fa = readDays(fold(after));
    const lineDays = fb.days ?? fa.days;
    let title = (stripDays(before, fb.days !== null) + " " + stripDays(after, fa.days !== null)).replace(/\s+/g, " ");
    title = title.replace(/^[\s:,;|→>\-–—()]+|[\s:,;|→>\-–—()]+$/g, "").trim();
    if (!title) title = "Bloc";
    title = title.charAt(0).toUpperCase() + title.slice(1);
    out.push({ start: fromMinutes(startMin), end: fromMinutes(Math.min(endMin, 23 * 60 + 59)), title, days: lineDays ?? sectionDays });
  }
  return mergeBlocks(out);
}

/** Retire les noms de jours d'un morceau de texte original (en gardant les accents du reste). */
function stripDays(s: string, had: boolean): string {
  if (!had) return s;
  const f = fold(s);
  const rx = new RegExp(`(?:du\\s+)?(?<![a-z])${DAY_WORD}(?![a-z])(?:\\s*(?:au|a|-|–|et|,)\\s*${DAY_WORD})*|tous les jours|en semaine|(?:le\\s+)?week-?end`, "g");
  let out = "";
  let last = 0;
  let mm: RegExpExecArray | null;
  while ((mm = rx.exec(f))) { out += s.slice(last, mm.index); last = mm.index + mm[0].length; }
  return out + s.slice(last);
}

/** Même bloc (titre + horaires) sur plusieurs sections → une seule série avec tous les jours. */
function mergeBlocks(list: PlanBlock[]): PlanBlock[] {
  const map = new Map<string, PlanBlock>();
  for (const b of list) {
    const k = `${b.start}|${b.end}|${fold(b.title)}`;
    const ex = map.get(k);
    if (!ex) { map.set(k, { ...b, days: b.days ? [...b.days] : null }); continue; }
    if (ex.days && b.days) ex.days = [...new Set([...ex.days, ...b.days])].sort();
    else ex.days = null;
  }
  return [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
}
