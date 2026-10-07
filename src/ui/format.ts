import type { Item, ItemDraft } from "../core/types";
import { relativeDay, toISODate } from "../core/dates";
import { describeRule } from "../core/recurrence";
import { categoryOf } from "../data/store";

/** "Demain · 14:00 · Appel" */
export function summarize(d: Pick<ItemDraft, "date" | "time" | "categoryId" | "recurrence" | "priority">): string {
  const parts: string[] = [];
  if (d.recurrence) parts.push(describeRule(d.recurrence));
  else if (d.date) parts.push(relativeDay(d.date));
  if (d.time) parts.push(d.time);
  parts.push(categoryOf(d.categoryId).name);
  if (d.priority === 2) parts.push("Urgent");
  else if (d.priority === 1) parts.push("Important");
  return parts.join(" · ");
}

/** "Prévu hier à 14:00" */
export function overdueLabel(i: Item): string {
  if (!i.date) return "";
  const today = toISODate(new Date());
  const day = i.date === today ? "aujourd'hui" : relativeDay(i.date).toLowerCase();
  const prefix = i.date === today || /^(hier|demain|après)/.test(day) ? day : `le ${day}`;
  return `Prévu ${prefix}${i.time ? ` à ${i.time}` : ""}`;
}
