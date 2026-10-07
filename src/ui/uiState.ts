import { useSyncExternalStore } from "react";
import type { Item, ItemDraft } from "../core/types";
import { getState } from "../data/store";
import { isProjection, realId } from "../core/selectors";

/** État d'interface de la fenêtre principale (navigation, modales). */
export type Page = "today" | "calendar" | "tasks" | "history" | "settings";

interface UI {
  page: Page;
  editor: { item?: Item; draft?: Partial<ItemDraft> } | null;
  search: boolean;
  planning: boolean; // fenêtre « Journée type »
  review: boolean; // revue du soir
  menu: { x: number; y: number; itemId: string; kind: "snooze" | "item" } | null;
}

let ui: UI = { page: "today", editor: null, search: false, planning: false, review: false, menu: null };
const ls = new Set<() => void>();
export const setUI = (p: Partial<UI>) => { ui = { ...ui, ...p }; ls.forEach((l) => l()); };
export const getUI = () => ui;
export const useUI = () => useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => ui);

export const openEditor = (item?: Item, draft?: Partial<ItemDraft>) => {
  // une occurrence projetée d'une série → on édite la série elle-même
  if (item && isProjection(item.id)) item = getState().items.find((i) => i.id === realId(item!.id)) ?? item;
  setUI({ editor: { item, draft }, menu: null, search: false });
};
export const openMenu = (e: { clientX: number; clientY: number }, itemId: string, kind: "snooze" | "item" = "snooze") =>
  setUI({ menu: { x: e.clientX, y: e.clientY, itemId, kind } });
