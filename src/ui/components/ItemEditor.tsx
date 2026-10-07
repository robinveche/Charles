import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Item, ItemDraft, Priority, RecurrenceRule } from "../../core/types";
import { DURATIONS, fmtDuration } from "../../core/types";
import { fmtReminder, parseISODate, toISODate, WEEKDAYS_SHORT } from "../../core/dates";
import { realId } from "../../core/selectors";
import { createItem, deleteItem, showToast, updateItem, useCharles } from "../../data/store";
import { CatIcon } from "./Icon";
import { setUI, useUI } from "../uiState";
import { summarize } from "../format";

/** Uniquement les champs modifiables : jamais id, dates de création, état terminé… */
function pickDraft(x: ItemDraft): ItemDraft {
  const { title, notes, kind, categoryId, priority, date, time, durationMin, reminders, recurrence, projectId } = x;
  return { title, notes, kind, categoryId, priority, date, time, durationMin, reminders, recurrence, projectId: projectId ?? null };
}

const REMINDER_PRESETS = [0, 5, 15, 30, 60, 1440];

type RecChoice = "none" | "daily" | "weekly" | "monthly" | "yearly";

export function ItemEditor() {
  const { editor } = useUI();
  if (!editor) return null;
  return <EditorInner key={editor.item?.id ?? "new"} item={editor.item} draft={editor.draft} />;
}

function EditorInner({ item, draft }: { item?: Item; draft?: Partial<ItemDraft> }) {
  const { categories, settings, projects } = useCharles();
  const base: ItemDraft = {
    title: "", notes: "", kind: "task", categoryId: "task", priority: 0, date: null, time: null,
    durationMin: 0, reminders: [], recurrence: null, projectId: null,
    ...(item ? pickDraft(item) : {}),
    ...(draft ?? {}),
  } as ItemDraft;
  const [d, setD] = useState<ItemDraft>(base);
  const [customRem, setCustomRem] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const close = () => setUI({ editor: null });
  const patch = (p: Partial<ItemDraft>) => setD((x) => ({ ...x, ...p }));

  useEffect(() => { titleRef.current?.focus(); if (!item) titleRef.current?.select(); }, []);

  const save = async () => {
    const clean: ItemDraft = { ...pickDraft(d), title: d.title.trim() || "Sans titre" };
    if (!clean.time) clean.reminders = clean.reminders.filter((r) => r >= 1440);
    if (item) {
      await updateItem(realId(item.id), clean);
    } else {
      const created = await createItem(clean);
      showToast(created.title, { detail: summarize(created), ms: 3000 });
    }
    close();
  };

  const setCategory = (id: string) => {
    const c = categories.find((x) => x.id === id);
    const kind = c?.kind ?? d.kind;
    patch({ categoryId: id, kind, durationMin: kind === "event" && !d.durationMin ? 60 : d.durationMin });
  };

  const rec: RecChoice = d.recurrence?.freq ?? "none";
  const setRec = (c: RecChoice) => {
    if (c === "none") return patch({ recurrence: null });
    const ref = d.date ? parseISODate(d.date) : new Date();
    const r: RecurrenceRule = { freq: c, interval: d.recurrence?.interval ?? 1 };
    if (c === "weekly") r.byWeekday = d.recurrence?.byWeekday?.length ? d.recurrence.byWeekday : [(ref.getDay() + 6) % 7];
    if (c === "monthly") r.byMonthDay = d.recurrence?.byMonthDay ?? ref.getDate();
    patch({ recurrence: r, date: d.date ?? toISODate(new Date()) });
  };

  const toggleRem = (m: number) =>
    patch({ reminders: d.reminders.includes(m) ? d.reminders.filter((x) => x !== m) : [...d.reminders, m].sort((a, b) => a - b) });

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className="modal"
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); close(); }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); save(); }
        }}
      >
        <div className="modal-body">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input ref={titleRef} className="title-input" placeholder="Titre" value={d.title} onChange={(e) => patch({ title: e.target.value })} />
            <button className="icon-btn" onClick={close} aria-label="Fermer"><X size={16} /></button>
          </div>

          <div className="field">
            <label>CATÉGORIE</label>
            <div className="togglechips">
              {categories.map((c) => (
                <button key={c.id} className={`tchip ${d.categoryId === c.id ? "on" : ""}`} onClick={() => setCategory(c.id)}>
                  <CatIcon name={c.icon} size={13} color={d.categoryId === c.id ? undefined : c.color} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid3">
            <div className="field">
              <label>DATE</label>
              <input type="date" className="input" value={d.date ?? ""} onChange={(e) => patch({ date: e.target.value || null })} />
            </div>
            <div className="field">
              <label>HEURE</label>
              <input
                type="time" className="input" value={d.time ?? ""}
                onChange={(e) => {
                  const t = e.target.value || null;
                  patch({ time: t, reminders: t && !d.time && d.reminders.length === 0 ? settings.defaultReminders : d.reminders, date: t && !d.date ? toISODate(new Date()) : d.date });
                }}
              />
            </div>
            <div className="field">
              <label>DURÉE</label>
              <select className="select" value={d.durationMin} onChange={(e) => patch({ durationMin: +e.target.value })}>
                <option value={0}>Non précisée</option>
                {[...new Set([...DURATIONS, d.durationMin])].filter(Boolean).sort((a, b) => a - b).map((m) => (
                  <option key={m} value={m}>{fmtDuration(m)}</option>
                ))}
              </select>
            </div>
          </div>

          {projects.length > 0 && (
            <div className="field">
              <label>PROJET</label>
              <div className="typeproj">
                {projects.map((p) => (
                  <button key={p.id} className={`tproj ${d.projectId === p.id ? "on" : ""}`} onClick={() => patch({ projectId: d.projectId === p.id ? null : p.id })}>
                    <i style={{ background: p.color }} />{p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <label>PRIORITÉ</label>
            <div className="seg" style={{ alignSelf: "flex-start" }}>
              {(["Normale", "Importante", "Urgente"] as const).map((l, i) => (
                <button key={l} className={d.priority === i ? "on" : ""} onClick={() => patch({ priority: i as Priority })}>
                  {i > 0 && <span className={`prio-dot`} style={{ width: 6, height: 6, borderRadius: 6, background: i === 2 ? "var(--urgent)" : "var(--accent)" }} />}
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>RAPPELS {!d.time && <span style={{ fontWeight: 400, letterSpacing: 0 }}>— ajoutez une heure pour les rappels précis</span>}</label>
            <div className="togglechips">
              {[...new Set([...REMINDER_PRESETS, ...d.reminders])].sort((a, b) => a - b).map((m) => (
                <button key={m} disabled={!d.time} style={{ opacity: d.time ? 1 : 0.4 }} className={`tchip ${d.reminders.includes(m) ? "on" : ""}`} onClick={() => toggleRem(m)}>
                  {fmtReminder(m)}
                </button>
              ))}
              {d.time && (
                <input
                  className="input" style={{ width: 120, height: 28 }} placeholder="Perso (min)" value={customRem}
                  onChange={(e) => setCustomRem(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customRem) { e.preventDefault(); e.stopPropagation(); toggleRem(+customRem); setCustomRem(""); }
                  }}
                />
              )}
            </div>
          </div>

          <div className="field">
            <label>RÉPÉTER</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <select className="select" value={rec} onChange={(e) => setRec(e.target.value as RecChoice)}>
                <option value="none">Jamais</option>
                <option value="daily">Tous les jours</option>
                <option value="weekly">Chaque semaine</option>
                <option value="monthly">Chaque mois</option>
                <option value="yearly">Chaque année</option>
              </select>
              {d.recurrence && (
                <>
                  <span className="hint">tous les</span>
                  <input
                    className="input num" style={{ width: 56 }} type="number" min={1} value={d.recurrence.interval}
                    onChange={(e) => patch({ recurrence: { ...d.recurrence!, interval: Math.max(1, +e.target.value || 1) } })}
                  />
                  <span className="hint">{{ daily: "jour(s)", weekly: "semaine(s)", monthly: "mois", yearly: "an(s)" }[d.recurrence.freq]}</span>
                </>
              )}
              {d.recurrence?.freq === "monthly" && (
                <>
                  <span className="hint">le</span>
                  <input
                    className="input num" style={{ width: 56 }} type="number" min={1} max={31} value={d.recurrence.byMonthDay ?? 1}
                    onChange={(e) => patch({ recurrence: { ...d.recurrence!, byMonthDay: Math.min(31, Math.max(1, +e.target.value || 1)) } })}
                  />
                </>
              )}
            </div>
            {d.recurrence?.freq === "weekly" && (
              <div className="togglechips" style={{ marginTop: 4 }}>
                {WEEKDAYS_SHORT.map((w, i) => {
                  const on = d.recurrence!.byWeekday?.includes(i);
                  return (
                    <button key={w} className={`tchip ${on ? "on" : ""}`} style={{ width: 44, justifyContent: "center" }}
                      onClick={() => {
                        const cur = d.recurrence!.byWeekday ?? [];
                        const next = on ? cur.filter((x) => x !== i) : [...cur, i].sort();
                        if (next.length) patch({ recurrence: { ...d.recurrence!, byWeekday: next } });
                      }}>
                      {w.replace(".", "")}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="field">
            <label>NOTES</label>
            <textarea className="textarea" placeholder="Détails, numéro, lien…" value={d.notes} onChange={(e) => patch({ notes: e.target.value })} />
          </div>
        </div>
        <div className="modal-foot">
          {item && (
            <button className="btn danger" onClick={() => { deleteItem(item.id); close(); }}>
              <Trash2 size={14} /> Supprimer
            </button>
          )}
          <span className="spacer" />
          <span className="hint">Ctrl+Entrée</span>
          <button className="btn ghost" onClick={close}>Annuler</button>
          <button className="btn primary" onClick={save}>{item ? "Enregistrer" : "Créer"}</button>
        </div>
      </div>
    </div>
  );
}
