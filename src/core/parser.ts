import type { Category, ItemDraft, Priority, Project, RecurrenceRule } from "./types";
import { addDays, fromMinutes, minutesOf, pad, startOfDay, toDateTime, toHM, toISODate, weekdayMon0 } from "./dates";
import { firstOccurrence } from "./recurrence";

/**
 * Parseur de saisie naturelle en français.
 * "Relancer Lucas vendredi à 14h" → { title: "Relancer Lucas", date: vendredi, time: 14:00, catégorie: Relance client }
 *
 * Fonctionnement : on travaille sur une copie « pliée » du texte (minuscules, sans accents,
 * MÊME longueur que l'original). Chaque règle reconnue marque ses caractères comme consommés ;
 * le titre = les caractères restants de l'original. Ordre des règles = du plus spécifique au plus général.
 */

export interface ParseResult {
  draft: ItemDraft;
  detected: {
    date: boolean;
    time: boolean;
    category: boolean;
    priority: boolean;
    recurrence: boolean;
  };
}

export interface ParseOptions {
  now?: Date;
  categories?: Category[];
  projects?: Project[];
  defaultReminders?: number[];
}

const WD = "(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)";
const WD_LIST = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const MONTHS_RX: [RegExp, number][] = [
  [/^janv/, 0], [/^fev/, 1], [/^mars/, 2], [/^avr/, 3], [/^mai/, 4], [/^juin/, 5],
  [/^juil/, 6], [/^aout/, 7], [/^sep/, 8], [/^oct/, 9], [/^nov/, 10], [/^dec/, 11],
];
const MONTH_WORD = "(janv(?:ier)?|fevr?(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|aout|sept?(?:embre)?|oct(?:obre)?|nov(?:embre)?|dec(?:embre)?)\\.?";
const NUM_WORDS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30, quarante: 40, cinquante: 50,
};
const NUM = "(\\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|quarante|cinquante)";
const toNum = (s: string) => (/^\d+$/.test(s) ? parseInt(s, 10) : NUM_WORDS[s] ?? 1);

/** Minuscule + suppression des accents, caractère par caractère (longueur conservée). */
export function fold(s: string): string {
  let out = "";
  for (const ch of s) {
    let c = ch.toLowerCase();
    if (c === "’" || c === "`") c = "'";
    const base = c.normalize("NFD")[0] ?? c;
    // garantir 1 unité UTF-16 par unité de l'original (les emojis = 2 unités)
    out += ch.length === 2 ? "  " : base.length === 1 ? base : c[0];
  }
  return out;
}

class Scanner {
  used: boolean[];
  constructor(public raw: string, public n: string) {
    this.used = new Array(raw.length).fill(false);
  }
  /** Trouve la première correspondance, la consomme (caractères neutralisés) et renvoie les groupes. */
  take(rx: RegExp): RegExpExecArray | null {
    const m = new RegExp(rx.source, rx.flags.replace("g", "")).exec(this.n);
    if (!m || m[0].length === 0) return null;
    const start = m.index;
    const end = start + m[0].length;
    for (let i = start; i < end; i++) this.used[i] = true;
    // les caractères consommés deviennent des séparateurs neutres : aucune autre règle ne peut les réutiliser
    this.n = this.n.slice(0, start) + "\u0001".repeat(end - start) + this.n.slice(end);
    return m;
  }
  rest(): string {
    let s = "";
    for (let i = 0; i < this.raw.length; i++) s += this.used[i] ? " " : this.raw[i];
    return s;
  }
}

// Bords de mots compatibles avec les lettres accentuées déjà pliées.
const B = "(?<![a-z0-9])";
const E = "(?![a-z0-9])";

function nextWeekday(from: Date, wd: number, allowToday: boolean): Date {
  const cur = weekdayMon0(from);
  let delta = (wd - cur + 7) % 7;
  if (delta === 0 && !allowToday) delta = 7;
  return addDays(startOfDay(from), delta);
}

function cleanTitle(s: string): string {
  let t = s.replace(/\s+/g, " ").trim();
  const edge = "(?:a|à|le|la|les|l'|pour|de|du|des|vers|et|au|aux|ce|cet|cette|dès|des|,|;|:|-|–|—)";
  const head = new RegExp(`^(?:(?:a|à|pour|et|de|,|;|:|-|–|—)\\s+)+`, "i");
  const tail = new RegExp(`(?:\\s+${edge})+$`, "i");
  for (let i = 0; i < 3; i++) t = t.replace(tail, "").replace(head, "").replace(/^[,;:\-–—\s]+|[,;:\-–—\s]+$/g, "").trim();
  t = t.replace(/\s+([,;:])/g, "$1").replace(/\s{2,}/g, " ");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

export function parseQuickInput(input: string, opts: ParseOptions = {}): ParseResult {
  const now = opts.now ?? new Date();
  const today = startOfDay(now);
  const cats = opts.categories ?? [];
  const sc = new Scanner(input, fold(input));

  let date: Date | null = null;
  let time: string | null = null;
  let duration = 0; // 0 = non précisée (rendez-vous : 1 h par défaut)
  let projectId: string | null = null;
  const projects = opts.projects ?? [];
  let priority: Priority = 0;
  let categoryId: string | null = null;
  let recurrence: RecurrenceRule | null = null;
  let explicitWeekday: number | null = null;
  let m: RegExpExecArray | null;

  // ── Priorité ───────────────────────────────────────────────
  if ((m = sc.take(/(?:^|\s)(!{2,3})(?=\s|$)/)) || (m = sc.take(new RegExp(`${B}#?(urgent|urgente|asap|tres urgent)${E}`)))) priority = 2;
  else if ((m = sc.take(/(?:^|\s)(!)(?=\s|$)/)) || (m = sc.take(new RegExp(`${B}#?(important|importante|prioritaire)${E}`)))) priority = 1;

  // ── #projet / #catégorie ───────────────────────────────────
  for (let k = 0; k < 3 && (m = sc.take(/#([a-z0-9][a-z0-9\-_']*)/)); k++) {
    const tag = m[1].replace(/[-_]/g, "");
    const p = projects.find((p) => fold(p.name).replace(/\s+/g, "").startsWith(tag));
    if (p) { projectId = p.id; continue; }
    const c = cats.find((c) => fold(c.name).replace(/\s+/g, "").startsWith(tag));
    if (c) categoryId = c.id;
  }

  // ── Durée : "pendant 2h", "durée 45 min", "(1h30)" ─────────
  if ((m = sc.take(new RegExp(`(?:${B}(?:pendant|durant|duree(?:\\s+de)?|sur)\\s+|\\()(?:(\\d{1,2})\\s*h\\s*(\\d{2})?|(\\d{1,3})\\s*(?:min|mn|minutes?)|(une?)\\s+heure|(une\\s+demi[- ]?heure))\\)?${E}`)))) {
    if (m[1]) duration = +m[1] * 60 + +(m[2] ?? 0);
    else if (m[3]) duration = +m[3];
    else if (m[4]) duration = 60;
    else if (m[5]) duration = 30;
  }

  // ── Récurrence ─────────────────────────────────────────────
  if ((m = sc.take(new RegExp(`${B}(?:tous les|toutes les|chaque)\\s+(1er|premiers?|\\d{1,2})\\s+(?:du|de chaque)\\s+mois${E}`)))
    || (m = sc.take(new RegExp(`${B}le\\s+(1er|premier|\\d{1,2})\\s+de\\s+chaque\\s+mois${E}`)))) {
    const d = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : 1;
    recurrence = { freq: "monthly", interval: 1, byMonthDay: Math.min(31, Math.max(1, d)) };
  } else if ((m = sc.take(new RegExp(`${B}(?:chaque|tous les|en)\\s+(debut|fin)\\s+(?:de\\s+|du\\s+)?mois${E}`)))) {
    recurrence = { freq: "monthly", interval: 1, byMonthDay: m[1] === "debut" ? 1 : 31 };
  } else if ((m = sc.take(new RegExp(`${B}(?:en semaine|du lundi au vendredi|tous les jours ouvres|jours ouvres)${E}`)))) {
    recurrence = { freq: "weekly", interval: 1, byWeekday: [0, 1, 2, 3, 4] };
  } else if ((m = sc.take(new RegExp(`${B}(?:tous les|toutes les|chaque|les)\\s+((?:${WD}s?)(?:\\s*(?:,|et)\\s*${WD}s?)*)${E}`)))) {
    const days = WD_LIST.map((d, i) => (new RegExp(`${B}${d}`).test(m![1]) ? i : -1)).filter((i) => i >= 0);
    recurrence = { freq: "weekly", interval: 1, byWeekday: days };
  } else if ((m = sc.take(new RegExp(`${B}(?:tous les|toutes les|chaque)\\s+(?:(\\d+|deux|trois|quatre)\\s+)?(jours?|semaines?|mois|ans|annees?)${E}`)))
    || (m = sc.take(new RegExp(`${B}()(quotidien(?:ne)?|hebdo(?:madaire)?|mensuel(?:le)?|annuel(?:le)?)${E}`)))) {
    const n = m[1] ? toNum(m[1]) : 1;
    const u = m[2];
    const freq = /^(jour|quotid)/.test(u) ? "daily" : /^(semaine|hebdo)/.test(u) ? "weekly" : /^(mois|mensuel)/.test(u) ? "monthly" : "yearly";
    recurrence = { freq, interval: n };
  }

  // ── "dans 2 heures", "dans 3 jours", "dans 1h30" ───────────
  if ((m = sc.take(new RegExp(`${B}dans\\s+une\\s+demi[- ]?heure${E}`)))) {
    const t = new Date(now.getTime() + 30 * 60000);
    date = startOfDay(t); time = roundTime(t);
  } else if ((m = sc.take(new RegExp(`${B}dans\\s+${NUM}\\s*(minutes?|mins?|mn|heures?|h|jours?|j|semaines?|sem|mois)(?:\\s*(\\d{2}))?${E}`)))) {
    const n = toNum(m[1]);
    const u = m[2];
    if (/^(min|mn)/.test(u)) {
      const t = new Date(now.getTime() + n * 60000); date = startOfDay(t); time = roundTime(t, n < 15 ? 1 : 5);
    } else if (/^h/.test(u)) {
      const extra = m[3] ? parseInt(m[3], 10) : 0;
      const t = new Date(now.getTime() + (n * 60 + extra) * 60000); date = startOfDay(t); time = roundTime(t);
    } else if (/^j/.test(u)) date = addDays(today, n);
    else if (/^sem/.test(u)) date = addDays(today, n * 7);
    else { const d = new Date(today); d.setMonth(d.getMonth() + n); date = d; }
  }

  // ── Plages "de 14h à 15h30" ────────────────────────────────
  if (!time && (m = sc.take(new RegExp(`${B}(?:de\\s+)?(\\d{1,2})\\s*h\\s*(\\d{2})?\\s*(?:a|-|–)\\s*(\\d{1,2})\\s*h\\s*(\\d{2})?${E}`)))) {
    const h1 = +m[1], m1 = +(m[2] ?? 0), h2 = +m[3], m2 = +(m[4] ?? 0);
    if (h1 < 24 && h2 < 24 && m1 < 60 && m2 < 60) {
      time = `${pad(h1)}:${pad(m1)}`;
      const d = h2 * 60 + m2 - (h1 * 60 + m1);
      if (d > 0) duration = d;
    }
  }

  // ── Moments de la journée liés à un jour ───────────────────
  const PART: Record<string, string> = { matin: "09:00", midi: "12:00", "apres-midi": "14:00", "apres midi": "14:00", aprem: "14:00", soir: "19:00" };
  const partRx = "(matin|midi|apres-midi|apres midi|aprem|soir)";
  if ((m = sc.take(new RegExp(`${B}(?:ce|cet|cette)\\s+${partRx}${E}`)))) {
    date = date ?? today;
    if (!time) time = PART[m[1]];
  }

  // ── Jours relatifs ─────────────────────────────────────────
  if (!date) {
    if ((m = sc.take(new RegExp(`${B}(?:apres[- ]demain)(?:\\s+${partRx})?${E}`)))) {
      date = addDays(today, 2); if (m[1] && !time) time = PART[m[1]];
    } else if ((m = sc.take(new RegExp(`${B}demain(?:\\s+${partRx})?${E}`)))) {
      date = addDays(today, 1); if (m[1] && !time) time = PART[m[1]];
    } else if ((m = sc.take(new RegExp(`${B}(?:aujourd'?hui|auj|aujourd hui|tout a l'heure|plus tard)${E}`)))) {
      date = today;
    } else if ((m = sc.take(new RegExp(`${B}(?:ce\\s+)?(?:week-?end|we)${E}`)))) {
      date = nextWeekday(now, 5, true);
    } else if ((m = sc.take(new RegExp(`${B}(?:la\\s+)?semaine\\s+prochaine${E}`)))) {
      date = nextWeekday(now, 0, false);
    } else if ((m = sc.take(new RegExp(`${B}(?:en\\s+)?fin\\s+de\\s+semaine${E}`)))) {
      date = nextWeekday(now, 4, true);
    } else if ((m = sc.take(new RegExp(`${B}(?:le\\s+)?mois\\s+prochain${E}`)))) {
      date = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    }
  }

  // ── Jour de la semaine : "vendredi", "lundi prochain", "ce jeudi" ──
  if (!date && !recurrence && (m = sc.take(new RegExp(`${B}(?:(?:ce|le)\\s+)?${WD}(?:\\s+(prochain))?(?:\\s+${partRx})?${E}`)))) {
    explicitWeekday = WD_LIST.indexOf(m[1]);
    if (m[3] && !time) time = PART[m[3]];
  }

  // ── Dates absolues ─────────────────────────────────────────
  if (!date && (m = sc.take(new RegExp(`${B}(?:le\\s+)?(?:${WD}\\s+)?(1er|\\d{1,2})\\s+${MONTH_WORD}(?:\\s+(\\d{4}))?${E}`)))) {
    const d = m[2] === "1er" ? 1 : +m[2];
    const mo = MONTHS_RX.find(([rx]) => rx.test(m![3]))?.[1] ?? today.getMonth();
    let y = m[4] ? +m[4] : today.getFullYear();
    let cand = new Date(y, mo, d);
    if (!m[4] && cand < today) cand = new Date(y + 1, mo, d);
    date = cand;
    explicitWeekday = null;
  } else if (!date && (m = sc.take(new RegExp(`${B}(?:le\\s+)?(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2,4}))?${E}`)))) {
    const d = +m[1], mo = +m[2] - 1;
    if (d >= 1 && d <= 31 && mo >= 0 && mo < 12) {
      let y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : today.getFullYear();
      let cand = new Date(y, mo, d);
      if (!m[3] && cand < today) cand = new Date(y + 1, mo, d);
      date = cand;
      explicitWeekday = null;
    }
  } else if (!date && (m = sc.take(new RegExp(`${B}le\\s+(1er|\\d{1,2})(?!\\s*(?:h|:|\\d|heures?))${E}`)))) {
    const d = m[1] === "1er" ? 1 : +m[1];
    if (d >= 1 && d <= 31) {
      let cand = new Date(today.getFullYear(), today.getMonth(), d);
      if (cand < today) cand = new Date(today.getFullYear(), today.getMonth() + 1, d);
      date = cand;
      explicitWeekday = null;
    }
  }

  // ── Heure : "14h", "14h30", "14:30", "à 9h", "midi" ──────────
  if (!time && (m = sc.take(new RegExp(`${B}(?:(?:a|vers|des|pour)\\s+)?(\\d{1,2})\\s*(?:h|:)\\s*(\\d{2})?(?:\\s*(?:et\\s+)?(demie?|quart))?${E}`)))) {
    const h = +m[1];
    let mi = m[2] ? +m[2] : 0;
    if (m[3]?.startsWith("demi")) mi = 30; else if (m[3] === "quart") mi = 15;
    if (h < 24 && mi < 60) time = `${pad(h)}:${pad(mi)}`;
  } else if (!time && (m = sc.take(new RegExp(`${B}(?:(?:a|vers|pour|des)\\s+)?(midi|minuit)(?:\\s+(?:et\\s+)?(demie?))?${E}`)))) {
    time = m[1] === "midi" ? (m[2] ? "12:30" : "12:00") : "00:00";
  } else if (!time && (m = sc.take(new RegExp(`${B}(?:le|en)\\s+${partRx}${E}`)))) {
    time = PART[m[1]];
  }

  // Résolution du jour de la semaine (dépend de l'heure : "mercredi 10h" dit un mercredi à 12h → semaine prochaine)
  if (explicitWeekday !== null && !date) {
    const isToday = weekdayMon0(now) === explicitWeekday;
    const allowToday = isToday && !!time && minutesOf(time) > now.getHours() * 60 + now.getMinutes();
    date = nextWeekday(now, explicitWeekday, allowToday);
  }

  // ── Catégorie par mots-clés ───────────────────────────────
  const head = sc.n.replace(/^[\s\u0001]+/, "");
  if (!categoryId) {
    const rules: [RegExp, string][] = [
      [/^(rdv|rendez[- ]vous|reunion|meeting|visio|entretien|dejeuner|diner|rencontre)(?![a-z])/, "event"],
      [/^(appeler|appel|telephoner|tel|call|rappeler)(?![a-z])/, "call"],
      [/^(relancer|relance)(?![a-z])/, "followup"],
      [/^(rappel|penser a|ne pas oublier|n'oublie pas|noublie pas)(?![a-z])/, "reminder"],
    ];
    for (const [rx, id] of rules) if (rx.test(head)) { categoryId = id; break; }
  }
  if (!categoryId) {
    if (/(?<![a-z])(sport|salle|medecin|dentiste|courses|anniversaire|coiffeur|famille|maman|papa|kine|running|footing)(?![a-z])/.test(sc.n)) categoryId = "personal";
    else if (/(?<![a-z])(devis|facture|compta|comptabilite|presentation|prospects?|clients?|contrat)(?![a-z])/.test(sc.n)) categoryId = "work";
  }
  const catFound = !!categoryId;
  categoryId = categoryId && (cats.length === 0 || cats.some((c) => c.id === categoryId)) ? categoryId : "task";
  const cat = cats.find((c) => c.id === categoryId);
  const kind = cat?.kind ?? (categoryId === "event" ? "event" : "task");
  if (!duration && kind === "event") duration = 60;
  // projet cité dans le texte (« Dev Spotwise ») : on le reconnaît sans l'enlever du titre
  if (!projectId) {
    const hit = projects.find((p) => new RegExp(`${B}${fold(p.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${E}`).test(sc.n));
    if (hit) projectId = hit.id;
  }

  // "Rappel : payer loyer" → "Payer loyer"
  if (categoryId === "reminder") sc.take(/^\s*rappel\s*:?\s*/);

  // ── Valeurs par défaut cohérentes ──────────────────────────
  let isoDate = date ? toISODate(date) : null;
  if (!isoDate && time) {
    // "14h" seul : aujourd'hui si pas encore passé, sinon demain
    isoDate = minutesOf(time) > now.getHours() * 60 + now.getMinutes() ? toISODate(today) : toISODate(addDays(today, 1));
  }
  if (recurrence) {
    const base = isoDate ?? toISODate(today);
    let first = firstOccurrence(recurrence, base);
    if (first === toISODate(today) && time && minutesOf(time) <= now.getHours() * 60 + now.getMinutes()) {
      first = firstOccurrence(recurrence, toISODate(addDays(today, 1)));
    }
    isoDate = first;
  }

  let reminders: number[] = [];
  if (time && isoDate) {
    const due = toDateTime(isoDate, time).getTime();
    reminders = (opts.defaultReminders ?? [15]).filter((r) => due - r * 60000 > now.getTime());
    if (reminders.length === 0) reminders = [0];
  }

  return {
    draft: {
      title: cleanTitle(sc.rest()) || cleanTitle(input) || "Sans titre",
      notes: "",
      kind,
      categoryId,
      priority,
      date: isoDate,
      time,
      durationMin: duration,
      projectId,
      reminders,
      recurrence,
    },
    detected: {
      date: !!isoDate,
      time: !!time,
      category: catFound,
      priority: priority > 0,
      recurrence: !!recurrence,
    },
  };
}

function roundTime(d: Date, step = 5): string {
  const min = d.getHours() * 60 + d.getMinutes() + (d.getSeconds() > 0 ? 1 : 0);
  const r = Math.ceil(min / step) * step;
  if (r >= 24 * 60) return toHM(d);
  return fromMinutes(r);
}
