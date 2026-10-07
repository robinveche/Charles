import { useSyncExternalStore } from "react";
import type { Category, Item, ItemDraft, Project, Settings } from "../core/types";
import { DEFAULT_CATEGORIES, DEFAULT_PROJECTS, DEFAULT_SETTINGS, PLANNING_CATEGORY } from "../core/types";
import type { PlanBlock } from "../core/planning";
import { addDays, fromMinutes, minutesOf, parseISODate, toISODate } from "../core/dates";
import { firstOccurrence, nextOccurrence } from "../core/recurrence";
import { realId } from "../core/selectors";
import type { Repository } from "./repository";
import { LocalRepository } from "./localRepo";
import { emitChanged, isTauri, onChanged } from "../platform";

/**
 * Store global minimaliste (pas de librairie) : état en mémoire + écriture immédiate en base.
 * Chaque fenêtre (principale, command bar, widget) a sa propre instance et se recharge
 * quand une autre fenêtre signale un changement.
 */

export interface ToastAction { label: string; run: () => void; primary?: boolean }
export interface Toast { id: number; message: string; detail?: string; undo?: () => void; actions?: ToastAction[] }

interface State {
  ready: boolean;
  items: Item[];
  categories: Category[];
  projects: Project[];
  settings: Settings;
  lingering: Set<string>; // tâches cochées encore visibles quelques secondes
  toast: Toast | null;
}

const ORIGIN = Math.random().toString(36).slice(2);
let repo: Repository;
let state: State = {
  ready: false,
  items: [],
  categories: [],
  projects: [],
  settings: DEFAULT_SETTINGS,
  lingering: new Set(),
  toast: null,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
export const getState = () => state;
export function useCharles(): State {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
  );
}

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
const nowISO = () => new Date().toISOString();

function mergeSettings(s: Partial<Settings> | null): Settings {
  const d = DEFAULT_SETTINGS;
  if (!s) return d;
  return { ...d, ...s, shortcuts: { ...d.shortcuts, ...(s.shortcuts ?? {}) }, widget: { ...d.widget, ...(s.widget ?? {}) } };
}

async function reload() {
  const [items, categories, settings, projects] = await Promise.all([repo.loadItems(), repo.loadCategories(), repo.loadSettings(), repo.loadProjects()]);
  set({ items, categories, projects, settings: mergeSettings(settings), ready: true });
}

let initPromise: Promise<void> | null = null;
export function initStore(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (isTauri) {
      const { SqliteRepository } = await import("./sqliteRepo");
      repo = new SqliteRepository();
    } else repo = new LocalRepository();
    await repo.init();
    // catégories par défaut manquantes (premier lancement ou nouvelle version)
    const cats = await repo.loadCategories();
    const have = new Set(cats.map((c) => c.id));
    let sort = cats.length;
    for (const c of DEFAULT_CATEGORIES) if (!have.has(c.id)) await repo.saveCategory({ ...c, sort: sort++ });
    // projets par défaut, une seule fois (on peut ensuite les renommer / supprimer)
    if (!(await repo.getKV("projectsSeeded"))) {
      if ((await repo.loadProjects()).length === 0) for (const p of DEFAULT_PROJECTS) await repo.saveProject(p);
      await repo.setKV("projectsSeeded", "1");
    }
    await reload();
    onChanged((origin) => { if (origin !== ORIGIN) reload(); });
  })();
  return initPromise;
}

async function persist(item: Item, broadcast = true) {
  await repo.saveItem(item);
  if (broadcast) emitChanged(ORIGIN);
}
function replaceItem(item: Item) {
  const exists = state.items.some((i) => i.id === item.id);
  set({ items: exists ? state.items.map((i) => (i.id === item.id ? item : i)) : [...state.items, item] });
}

let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string, opts: { detail?: string; undo?: () => void; ms?: number; actions?: ToastAction[] } = {}) {
  const t: Toast = { id: ++toastSeq, message, detail: opts.detail, undo: opts.undo, actions: opts.actions };
  set({ toast: t });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (state.toast?.id === t.id) set({ toast: null }); }, opts.ms ?? 5000);
}
export const dismissToast = () => set({ toast: null });

// ─── Éléments ────────────────────────────────────────────────

export function categoryOf(id: string): Category {
  return state.categories.find((c) => c.id === id) ?? state.categories[0] ?? { ...DEFAULT_CATEGORIES[0], sort: 0 };
}

export async function createItem(draft: ItemDraft): Promise<Item> {
  const t = nowISO();
  let date = draft.date;
  if (draft.recurrence && !date) date = firstOccurrence(draft.recurrence, toISODate(new Date()));
  const item: Item = {
    ...draft,
    projectId: draft.projectId ?? null,
    date,
    id: uuid(),
    seriesId: null,
    doneAt: null,
    firedKeys: [],
    contactId: null,
    source: "local",
    externalId: null,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  };
  replaceItem(item);
  await persist(item);
  return item;
}

export async function updateItem(id: string, patch: Partial<Item>) {
  const cur = state.items.find((i) => i.id === realId(id));
  if (!cur) return;
  // id, création et source ne sont jamais écrasés par un patch
  const next: Item = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt, source: cur.source, updatedAt: nowISO() };
  if (next.recurrence && !next.date) next.date = firstOccurrence(next.recurrence, toISODate(new Date()));
  replaceItem(next);
  await persist(next);
}

/** Déplacement (calendrier) : change date/heure ; pour une projection récurrente, déplace la série. */
export async function moveItem(id: string, date: string, time: string | null | undefined) {
  const patch: Partial<Item> = { date };
  if (time !== undefined) patch.time = time;
  await updateItem(realId(id), patch);
}

const LINGER_MS = 2200;
function linger(id: string) {
  const l = new Set(state.lingering);
  l.add(id);
  set({ lingering: l });
  setTimeout(() => {
    const l2 = new Set(state.lingering);
    l2.delete(id);
    set({ lingering: l2 });
  }, LINGER_MS);
}

export async function completeItem(id: string) {
  const cur = state.items.find((i) => i.id === realId(id));
  if (!cur || cur.doneAt) return;
  const t = nowISO();
  if (cur.recurrence && cur.date) {
    // Occurrence terminée → copie dans l'historique, la série avance à la prochaine date.
    const today = toISODate(new Date());
    const nextDate = nextOccurrence(cur.recurrence, cur.date, cur.date, cur.date < today ? today : undefined);
    const copy: Item = { ...cur, id: uuid(), recurrence: null, seriesId: cur.id, doneAt: t, createdAt: t, updatedAt: t };
    const advanced: Item = { ...cur, date: nextDate, firedKeys: [], updatedAt: t };
    replaceItem(copy);
    replaceItem(advanced);
    linger(copy.id);
    await repo.saveItem(copy);
    await persist(advanced);
    showToast(cur.title, {
      detail: nextDate ? `Terminé · prochaine fois ${nextDate.split("-").reverse().slice(0, 2).join("/")}` : "Terminé",
      undo: async () => {
        replaceItem({ ...copy, deletedAt: nowISO() });
        set({ items: state.items.filter((i) => i.id !== copy.id) });
        await repo.saveItem({ ...copy, deletedAt: nowISO() });
        replaceItem(cur);
        await persist({ ...cur, updatedAt: nowISO() });
        dismissToast();
      },
    });
    return;
  }
  const done: Item = { ...cur, doneAt: t, updatedAt: t };
  replaceItem(done);
  linger(done.id);
  await persist(done);
  const followup = isFollowupCandidate(cur);
  showToast(cur.title, {
    detail: "Terminé",
    undo: () => { uncompleteItem(cur.id); dismissToast(); },
    actions: followup ? [{ label: `Relancer dans ${state.settings.followupDays} j`, primary: true, run: () => { dismissToast(); createFollowup(cur); } }] : undefined,
    ms: followup ? 9000 : 5000,
  });
}

export async function uncompleteItem(id: string) {
  const cur = state.items.find((i) => i.id === id);
  if (!cur) return;
  const next: Item = { ...cur, doneAt: null, updatedAt: nowISO() };
  replaceItem(next);
  await persist(next);
}

export async function deleteItem(id: string) {
  const cur = state.items.find((i) => i.id === realId(id));
  if (!cur) return;
  const del: Item = { ...cur, deletedAt: nowISO(), updatedAt: nowISO() };
  set({ items: state.items.filter((i) => i.id !== cur.id) });
  await persist(del);
  showToast(cur.title, {
    detail: "Supprimé",
    undo: async () => {
      const back = { ...cur, updatedAt: nowISO() };
      replaceItem(back);
      await persist(back);
      dismissToast();
    },
  });
}

export type SnoozeOption = "now" | "30min" | "afternoon" | "tomorrow" | "nextweek";

export function snoozeTarget(opt: SnoozeOption, item: Item, now = new Date()): { date: string; time: string | null } {
  const today = toISODate(now);
  const nm = now.getHours() * 60 + now.getMinutes();
  const round = (m: number) => fromMinutes(Math.ceil(m / 5) * 5);
  switch (opt) {
    case "now":
      return { date: today, time: round(nm) };
    case "30min":
      return nm + 30 < 24 * 60 ? { date: today, time: round(nm + 30) } : { date: toISODate(addDays(now, 1)), time: "09:00" };
    case "afternoon":
      return nm < 14 * 60 ? { date: today, time: "14:00" } : nm < 17 * 60 ? { date: today, time: round(nm + 60) } : { date: toISODate(addDays(now, 1)), time: "14:00" };
    case "tomorrow":
      return { date: toISODate(addDays(now, 1)), time: item.time ?? null };
    case "nextweek": {
      const d = addDays(now, ((7 - ((now.getDay() + 6) % 7)) % 7) || 7);
      return { date: toISODate(d), time: item.time ?? null };
    }
  }
}

export async function snoozeItem(id: string, opt: SnoozeOption) {
  const cur = state.items.find((i) => i.id === realId(id));
  if (!cur) return;
  const { date, time } = snoozeTarget(opt, cur);
  const reminders = time ? (cur.reminders.length ? cur.reminders.filter((r) => r < 60) : [0]) : cur.reminders;
  await updateItem(cur.id, { date, time, reminders: reminders.length ? reminders : [0] });
  const label = opt === "now" ? "Maintenant" : time ? `${date === toISODate(new Date()) ? "Aujourd'hui" : date.split("-").reverse().slice(0, 2).join("/")} · ${time}` : date.split("-").reverse().slice(0, 2).join("/");
  showToast(cur.title, { detail: `Reporté · ${label}`, undo: () => { updateItem(cur.id, { date: cur.date, time: cur.time, reminders: cur.reminders }); dismissToast(); } });
}

/** Marque des notifications comme envoyées sans prévenir les autres fenêtres (pas de rechargement inutile). */
export async function markFired(id: string, keys: string[]) {
  const cur = state.items.find((i) => i.id === id);
  if (!cur) return;
  const next = { ...cur, firedKeys: [...new Set([...cur.firedKeys, ...keys])].slice(-30) };
  replaceItem(next);
  await persist(next, false);
}

/**
 * Les rendez-vous récurrents (blocs de la journée type…) passés avancent tout seuls
 * à leur prochaine occurrence, pour rester « Prochain » / « Aujourd'hui » chaque jour.
 */
export async function rollRecurringEvents() {
  const today = toISODate(new Date());
  for (const i of state.items) {
    if (i.deletedAt || i.doneAt || !i.recurrence || i.kind !== "event" || !i.date || i.date >= today) continue;
    const next = nextOccurrence(i.recurrence, i.date, i.date, today);
    if (next && next !== i.date) {
      const n: Item = { ...i, date: next, firedKeys: [], updatedAt: nowISO() };
      replaceItem(n);
      await persist(n);
    }
  }
}

/** Crée les blocs de la journée type : un rendez-vous récurrent hebdomadaire par bloc. */
export async function createPlanning(blocks: PlanBlock[], defaultDays: number[], notify: boolean) {
  const today = toISODate(new Date());
  let n = 0;
  for (const b of blocks) {
    const days = b.days?.length ? b.days : defaultDays;
    if (!days.length) continue;
    const rule = { freq: "weekly" as const, interval: 1, byWeekday: days };
    await createItem({
      title: b.title, notes: "", kind: "event", categoryId: PLANNING_CATEGORY, priority: 0, projectId: guessProject(b.title),
      date: firstOccurrence(rule, today), time: b.start,
      durationMin: Math.max(5, minutesOf(b.end) - minutesOf(b.start)),
      reminders: notify ? [0] : [], recurrence: rule,
    });
    n++;
  }
  showToast("Journée type ajoutée", { detail: `${n} bloc${n > 1 ? "s" : ""} récurrent${n > 1 ? "s" : ""}`, ms: 3500 });
}

export async function deletePlanning(ids: string[]) {
  for (const id of ids) {
    const cur = state.items.find((i) => i.id === id);
    if (cur) await persist({ ...cur, deletedAt: nowISO(), updatedAt: nowISO() }, false);
  }
  set({ items: state.items.filter((i) => !ids.includes(i.id)) });
  emitChanged(ORIGIN);
}

export async function addNote(id: string, notes: string) {
  await updateItem(id, { notes });
}

// ─── Journal (note du jour) ──────────────────────────────────
export const getJournal = (date: string) => repo.getKV(`journal:${date}`);
export const setJournal = (date: string, text: string) => repo.setKV(`journal:${date}`, text);

// ─── Relances ────────────────────────────────────────────────
const FOLLOW_RX = /^(appeler|appel|rdv|rendez[- ]vous|r[ée]union|relancer|relance|call|t[ée]l[ée]phoner|d[ée]jeuner|visio|entretien|rencontre|devis)(\s+(avec|à|a|de|chez))?\s+/i;

/** Un appel, un RDV, une relance… mérite souvent une suite. */
export function isFollowupCandidate(i: Item): boolean {
  return i.kind === "event" && i.categoryId !== PLANNING_CATEGORY || ["call", "followup", "event"].includes(i.categoryId) || FOLLOW_RX.test(i.title);
}

export function followupTitle(title: string): string {
  const who = title.replace(FOLLOW_RX, "").trim();
  return who && who !== title ? `Relancer ${who}` : `Relancer — ${title}`;
}

/** Ajoute n jours ouvrés (on ne relance pas un samedi). */
export function addBusinessDays(from: string, n: number): string {
  let d = from;
  let left = n;
  while (left > 0) {
    d = toISODate(addDays(parseISODate(d), 1));
    const wd = (parseISODate(d).getDay() + 6) % 7;
    if (wd < 5) left--;
  }
  return d;
}

export async function createFollowup(src: Item, days = state.settings.followupDays) {
  const date = addBusinessDays(toISODate(new Date()), days);
  const it = await createItem({
    title: followupTitle(src.title), notes: `Suite à : ${src.title}${src.date ? ` (${src.date.split("-").reverse().slice(0, 2).join("/")})` : ""}`,
    kind: "task", categoryId: "followup", priority: 0, date, time: null, durationMin: 0, reminders: [], recurrence: null,
    projectId: src.projectId ?? null,
  });
  showToast(it.title, { detail: `Relance prévue · ${date.split("-").reverse().slice(0, 2).join("/")}`, undo: () => { deleteItemSilently(it.id); dismissToast(); } });
  return it;
}

async function deleteItemSilently(id: string) {
  const cur = state.items.find((i) => i.id === id);
  if (!cur) return;
  set({ items: state.items.filter((i) => i.id !== id) });
  await persist({ ...cur, deletedAt: nowISO(), updatedAt: nowISO() });
}

// ─── Projets ─────────────────────────────────────────────────
export const projectOf = (id: string | null | undefined) => (id ? state.projects.find((p) => p.id === id) ?? null : null);

export async function saveProject(p: Partial<Project> & { name: string }) {
  const ex = p.id ? state.projects.find((x) => x.id === p.id) : undefined;
  const proj: Project = ex ? { ...ex, ...p } : { id: uuid(), color: "#8a8f98", sort: state.projects.length, ...p };
  set({ projects: ex ? state.projects.map((x) => (x.id === proj.id ? proj : x)) : [...state.projects, proj] });
  await repo.saveProject(proj);
  emitChanged(ORIGIN);
}

export async function deleteProject(id: string) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return;
  for (const i of state.items.filter((i) => i.projectId === id)) await updateItem(i.id, { projectId: null });
  set({ projects: state.projects.filter((x) => x.id !== id) });
  await repo.saveProject({ ...p, deletedAt: nowISO() });
  emitChanged(ORIGIN);
}

/** Projet deviné à partir d'un titre (« Dev Spotwise » → Spotwise). */
export function guessProject(title: string): string | null {
  const f = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const t = ` ${f(title)} `;
  const hit = state.projects.find((p) => new RegExp(`[^a-z0-9]${f(p.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^a-z0-9]`).test(t));
  return hit?.id ?? null;
}

// ─── Catégories ──────────────────────────────────────────────

export async function saveCategory(c: Partial<Category> & { name: string }) {
  const existing = c.id ? state.categories.find((x) => x.id === c.id) : undefined;
  const cat: Category = existing
    ? { ...existing, ...c }
    : { id: uuid(), icon: "circle", color: "#8a8f98", kind: "task", builtin: false, sort: state.categories.length, ...c };
  set({ categories: existing ? state.categories.map((x) => (x.id === cat.id ? cat : x)) : [...state.categories, cat] });
  await repo.saveCategory(cat);
  emitChanged(ORIGIN);
}

export async function deleteCategory(id: string) {
  const c = state.categories.find((x) => x.id === id);
  if (!c || c.builtin) return;
  // les éléments de la catégorie repassent en « Tâche »
  for (const i of state.items.filter((i) => i.categoryId === id)) await updateItem(i.id, { categoryId: "task" });
  set({ categories: state.categories.filter((x) => x.id !== id) });
  await repo.saveCategory({ ...c, deletedAt: nowISO() } as Category);
  emitChanged(ORIGIN);
}

// ─── Réglages ────────────────────────────────────────────────

export async function updateSettings(patch: Partial<Settings>, broadcast = true) {
  const s = mergeSettings({ ...state.settings, ...patch });
  set({ settings: s });
  await repo.saveSettings(s);
  if (broadcast) emitChanged(ORIGIN);
}

export async function runDailyBackup() {
  const today = toISODate(new Date());
  if (state.settings.lastBackup === today || !repo.backup) return;
  try {
    await repo.backup();
    await updateSettings({ lastBackup: today }, false);
  } catch (e) {
    console.warn("backup", e);
  }
}

/** Petit utilitaire pour l'éditeur : heure par défaut lors d'un clic dans le calendrier. */
export const defaultTimeAfter = (time: string) => fromMinutes(minutesOf(time) + 60);
