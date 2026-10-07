import { useState } from "react";
import { addDaysISO, toISODate } from "../../core/dates";
import { byDateTime, byPriorityThenTime, isOverdue } from "../../core/selectors";
import type { Item } from "../../core/types";
import { useCharles } from "../../data/store";
import { ItemRow, OverdueRow } from "../components/ItemRow";
import { CatIcon } from "../components/Icon";
import { QuickAdd } from "../components/QuickAdd";
import { useNow } from "./Today";

/** Toutes les tâches et rendez-vous actifs, groupés par échéance. */
export function Tasks() {
  const { items, categories, lingering } = useCharles();
  const now = useNow();
  const [cat, setCat] = useState<string | null>(null);
  const [proj, setProj] = useState<string | null>(null);
  const { projects } = useCharles();
  const today = toISODate(now);
  const tomorrow = addDaysISO(today, 1);
  const weekEnd = addDaysISO(today, 7);

  const active = items.filter((i) => !i.deletedAt && (!i.doneAt || lingering.has(i.id)) && (!cat || i.categoryId === cat) && (!proj || i.projectId === proj) && i.categoryId !== "planning")
    .filter((i) => !(i.kind === "event" && i.date && i.date < today));

  const groups: { key: string; label: string; items: Item[]; overdue?: boolean }[] = [
    { key: "late", label: "En retard", items: active.filter((i) => !i.doneAt && isOverdue(i, now)), overdue: true },
    { key: "today", label: "Aujourd'hui", items: active.filter((i) => i.date === today && !isOverdue(i, now)) },
    { key: "tomorrow", label: "Demain", items: active.filter((i) => i.date === tomorrow) },
    { key: "week", label: "7 prochains jours", items: active.filter((i) => i.date && i.date > tomorrow && i.date <= weekEnd) },
    { key: "later", label: "Plus tard", items: active.filter((i) => i.date && i.date > weekEnd) },
    { key: "none", label: "Sans date", items: active.filter((i) => !i.date) },
  ];
  const used = new Set(items.filter((i) => !i.deletedAt && !i.doneAt).map((i) => i.categoryId));

  return (
    <div className="page">
      <h1 className="page-title">Tâches</h1>
      <QuickAdd placeholder="Nouvelle tâche…" />
      <div className="togglechips" style={{ marginTop: 18 }}>
        <button className={`tchip ${!cat ? "on" : ""}`} onClick={() => setCat(null)}>Tout</button>
        {categories.filter((c) => used.has(c.id)).map((c) => (
          <button key={c.id} className={`tchip ${cat === c.id ? "on" : ""}`} onClick={() => setCat(cat === c.id ? null : c.id)}>
            <CatIcon name={c.icon} size={13} /> {c.name}
          </button>
        ))}
      </div>
      {projects.length > 0 && (
        <div className="typeproj" style={{ marginTop: 8 }}>
          {projects.map((p) => (
            <button key={p.id} className={`tproj ${proj === p.id ? "on" : ""}`} onClick={() => setProj(proj === p.id ? null : p.id)}>
              <i style={{ background: p.color }} />{p.name}
            </button>
          ))}
        </div>
      )}
      {groups.filter((g) => g.items.length).map((g) => (
        <section className="section" key={g.key}>
          <div className="section-head">
            <span className={`eyebrow ${g.overdue ? "warn" : ""}`}>{g.label}</span>
            <span className="meta">{g.items.filter((i) => !i.doneAt).length}</span>
          </div>
          <div className="list">
            {g.items
              .sort(g.key === "today" || g.key === "none" ? byPriorityThenTime : byDateTime)
              .map((i) => (g.overdue ? <OverdueRow key={i.id} item={i} /> : <ItemRow key={i.id} item={i} showDate={g.key === "week" || g.key === "later"} />))}
          </div>
        </section>
      ))}
      {groups.every((g) => !g.items.length) && <div className="empty" style={{ marginTop: 30 }}>Tout est fait. Rien en attente.</div>}
    </div>
  );
}
