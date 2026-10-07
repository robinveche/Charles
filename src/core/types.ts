/**
 * Modèle de données de Charles.
 *
 * Principes :
 * - Dates locales simples : `date` = "YYYY-MM-DD", `time` = "HH:mm". Pas de fuseau à gérer
 *   pour une app perso hors-ligne ; la conversion UTC se fera dans l'adaptateur de sync (V2).
 * - Chaque ligne a `id` (UUID), `createdAt`, `updatedAt`, `deletedAt` (suppression douce)
 *   → prêt pour une synchronisation cloud / multi-appareils (last-write-wins sur updatedAt).
 * - `contactId`, `source`, `externalId` : prévus pour le CRM léger et Google Calendar.
 */

export type ID = string;

export type ItemKind = "task" | "event";
export type Priority = 0 | 1 | 2; // 0 normale · 1 importante · 2 urgente

export interface RecurrenceRule {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number; // tous les N (jours/semaines/mois/années)
  byWeekday?: number[]; // 0 = lundi … 6 = dimanche (weekly)
  byMonthDay?: number; // 1..31 (monthly) — 31 = dernier jour si le mois est plus court
}

export interface Item {
  id: ID;
  title: string;
  notes: string;
  kind: ItemKind; // "event" = rendez-vous (affiché différemment dans le calendrier)
  categoryId: ID;
  priority: Priority;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:mm
  durationMin: number; // durée en minutes (0 = non précisée pour une tâche)
  projectId: ID | null; // projet (Spotwise, MP Finance…)
  reminders: number[]; // minutes avant l'échéance (0 = à l'heure exacte)
  recurrence: RecurrenceRule | null;
  seriesId: ID | null; // pour une occurrence terminée : id de la série d'origine
  doneAt: string | null; // ISO
  firedKeys: string[]; // notifications déjà envoyées (clé = date|heure|offset)
  contactId: ID | null; // V2 : lien vers un client
  source: "local" | "google";
  externalId: string | null; // V2 : id Google Calendar (évite les doublons)
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Category {
  id: ID;
  name: string;
  icon: string; // nom d'icône (voir ui/components/Icon.tsx)
  color: string; // couleur discrète (hex)
  kind: ItemKind; // type par défaut des éléments de cette catégorie
  sort: number;
  builtin: boolean;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface Project {
  id: ID;
  name: string;
  color: string;
  sort: number;
  updatedAt?: string;
  deletedAt?: string | null;
}

export const DEFAULT_PROJECTS: Project[] = [
  { id: "spotwise", name: "Spotwise", color: "#7f9cc7", sort: 0 },
  { id: "mpfinance", name: "MP Finance", color: "#c9a36a", sort: 1 },
  { id: "icn", name: "ICN", color: "#b48fc7", sort: 2 },
];

/** Durées proposées : précises jusqu'à 1 h, puis toutes les 30 min jusqu'à 8 h. */
export const DURATIONS = [15, 30, 45, ...Array.from({ length: 15 }, (_, i) => 60 + i * 30)];
export function fmtDuration(m: number): string {
  if (!m) return "—";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, "0")}` : ""}`;
}

/** Préparation CRM (V2) — non affiché en V1. */
export interface Contact {
  id: ID;
  name: string;
  company: string;
  email: string;
  phone: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type ThemePref = "system" | "dark" | "light";
export type WidgetSize = "mini" | "standard" | "large";
export type WidgetLayer = "normal" | "top" | "desktop";

export interface Shortcuts {
  quickAdd: string; // global
  newItem: string; // dans l'app
  search: string; // dans l'app
  toggleWidget: string; // global
}

export interface Settings {
  theme: ThemePref;
  shortcuts: Shortcuts;
  defaultReminders: number[];
  overdueNudge: boolean; // re-notifier une tâche en retard (1 h après)
  morningDigest: string | null; // "08:30" ou null
  autostart: boolean;
  widget: {
    visible: boolean;
    size: WidgetSize;
    opacity: number; // 0.35 .. 1
    layer: WidgetLayer;
    locked: boolean; // épinglé = position verrouillée
  };
  onboarded: boolean;
  eveningReview: string | null; // heure de la revue du soir ("18:00") ou null
  lastReview: string | null; // date de la dernière revue faite
  reviewNudged: string | null; // date du dernier rappel de revue envoyé
  followupDays: number; // délai proposé pour une relance
  lastDigest: string | null; // date du dernier résumé du matin envoyé
  lastBackup: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  shortcuts: {
    quickAdd: "Control+Space",
    newItem: "Control+N",
    search: "Control+K",
    toggleWidget: "Control+Shift+Space",
  },
  defaultReminders: [15],
  overdueNudge: true,
  morningDigest: "08:30",
  autostart: true,
  widget: { visible: true, size: "standard", opacity: 0.92, layer: "desktop", locked: false },
  onboarded: false,
  eveningReview: "18:00",
  lastReview: null,
  reviewNudged: null,
  followupDays: 3,
  lastDigest: null,
  lastBackup: null,
};

export const DEFAULT_CATEGORIES: Omit<Category, "sort">[] = [
  { id: "task", name: "Tâche", icon: "circle", color: "#8a8f98", kind: "task", builtin: true },
  { id: "event", name: "Rendez-vous", icon: "calendar", color: "#c9a36a", kind: "event", builtin: true },
  { id: "reminder", name: "Rappel", icon: "bell", color: "#8a8f98", kind: "task", builtin: true },
  { id: "followup", name: "Relance client", icon: "reply", color: "#7f9cc7", kind: "task", builtin: true },
  { id: "call", name: "Appel", icon: "phone", color: "#7fb59a", kind: "task", builtin: true },
  { id: "work", name: "Travail", icon: "briefcase", color: "#8a8f98", kind: "task", builtin: true },
  { id: "personal", name: "Personnel", icon: "user", color: "#b48fc7", kind: "task", builtin: true },
  { id: "important", name: "Important", icon: "star", color: "#d08770", kind: "task", builtin: true },
  { id: "planning", name: "Planning", icon: "clock", color: "#8a8f98", kind: "event", builtin: true },
];

/** Catégorie des blocs de la journée type (affichés plus discrètement). */
export const PLANNING_CATEGORY = "planning";

/** Brouillon produit par le parseur ou l'éditeur, avant création. */
export type ItemDraft = Pick<
  Item,
  "title" | "notes" | "kind" | "categoryId" | "priority" | "date" | "time" | "durationMin" | "reminders" | "recurrence"
> & Partial<Pick<Item, "projectId">
>;
