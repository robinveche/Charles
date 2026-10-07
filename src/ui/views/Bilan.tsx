import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { Item } from "../../core/types";
import {
  addDays, addDaysISO, longDate, minutesOf, parseISODate, startOfWeek, toISODate, WEEKDAYS_SHORT,
} from "../../core/dates";
import { isOverdue, isPlanning, itemsInRange } from "../../core/selectors";
import { categoryOf, createFollowup, getJournal, isFollowupCandidate, setJournal, useCharles } from "../../data/store";
import { fmtDuration } from "../../core/types";
import { CatIcon } from "../components/Icon";
import { RichText } from "../components/ItemRow";
import { openEditor, setUI } from "../uiState";
import { HistoryList } from "./History";
import { useNow } from "./Today";

/** Le bilan d'une journée : ce qui a été fait, ce qui reste, la note du jour. */
export function BilanView() {
  const { items, ready, projects } = useCharles();
  const now = useNow(60_000);
  const today = toISODate(now);
  const [day, setDay] = useState(today);
  const isToday = day === today;

  const doneOn = (d: string) => items.filter((i) => !i.deletedAt && i.doneAt && toISODate(new Date(i.doneAt)) === d && !isPlanning(i));

  const m = useMemo(() => {
    const done = doneOn(day).sort((a, b) => a.doneAt!.localeCompare(b.doneAt!));
    const nm = now.getHours() * 60 + now.getMinutes();
    const events = items.filter((i) => !i.deletedAt && i.kind === "event" && !isPlanning(i) && i.date === day && !i.recurrence &&
      (day < today || (day === today && i.time && minutesOf(i.time) + i.durationMin <= nm)));
    const remaining = items.filter((i) => !i.deletedAt && !i.doneAt && i.kind === "task" && i.date === day);
    const late = isToday ? items.filter((i) => !i.deletedAt && isOverdue(i, now)).length : 0;
    const byCat = new Map<string, number>();
    for (const i of [...done, ...events]) byCat.set(i.categoryId, (byCat.get(i.categoryId) ?? 0) + 1);
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    const ws = startOfWeek(parseISODate(day));
    const week = Array.from({ length: 7 }, (_, k) => {
      const d = toISODate(addDays(ws, k));
      return { d, n: doneOn(d).length };
    });
    // Temps par projet : tâches terminées (durée renseignée) + rendez-vous et blocs de planning passés
    const timeFor = (d: string) => {
      const map = new Map<string, number>();
      const add = (pid: string | null, min: number) => { if (pid && min > 0) map.set(pid, (map.get(pid) ?? 0) + min); };
      for (const i of doneOn(d)) add(i.projectId, i.durationMin);
      const evs = itemsInRange(items.filter((i) => !i.deletedAt && i.kind === "event" && i.time), d, d);
      for (const e of evs) {
        const end = minutesOf(e.time!) + (e.durationMin || 60);
        if (d < today || (d === today && end <= nm)) add(e.projectId, e.durationMin || 60);
        else if (d === today && minutesOf(e.time!) < nm) add(e.projectId, nm - minutesOf(e.time!)); // bloc en cours
      }
      return map;
    };
    const projDay = timeFor(day);
    const projWeek = new Map<string, number>();
    for (const w of week) if (w.d <= today) for (const [k, v] of timeFor(w.d)) projWeek.set(k, (projWeek.get(k) ?? 0) + v);
    return { done, events, remaining, late, cats, week, projDay, projWeek };
  }, [items, day, now.getMinutes()]);

  const total = m.done.length + m.remaining.length;
  const pct = total ? Math.round((m.done.length / total) * 100) : 0;
  const maxWeek = Math.max(1, ...m.week.map((w) => w.n));
  const maxCat = Math.max(1, ...m.cats.map(([, n]) => n));
  const timeline: { at: string; item: Item; kind: "done" | "event" }[] = [
    ...m.done.map((i) => ({ at: new Date(i.doneAt!).toTimeString().slice(0, 5), item: i, kind: "done" as const })),
    ...m.events.map((i) => ({ at: i.time ?? "", item: i, kind: "event" as const })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="page">
      <div className="bilan-head">
        <div>
          <div className="eyebrow">Bilan</div>
          <h1 className="date-title" style={{ marginBottom: 0 }}>{isToday ? "Aujourd'hui" : longDate(day)}</h1>
        </div>
        <span className="spacer" />
        {isToday && <button className="btn" style={{ height: 30, marginRight: 6 }} onClick={() => setUI({ review: true })}>Revue du soir</button>}
        <button className="icon-btn" onClick={() => setDay(addDaysISO(day, -1))} aria-label="Jour précédent"><ChevronLeft size={18} /></button>
        {!isToday && <button className="btn" style={{ height: 30 }} onClick={() => setDay(today)}>Aujourd'hui</button>}
        <button className="icon-btn" disabled={isToday} style={{ opacity: isToday ? 0.3 : 1 }} onClick={() => setDay(addDaysISO(day, 1))} aria-label="Jour suivant"><ChevronRight size={18} /></button>
      </div>

      <div className="stats">
        <Stat n={m.done.length} label={m.done.length > 1 ? "terminées" : "terminée"} accent />
        <Stat n={m.events.length} label={m.events.length > 1 ? "rendez-vous" : "rendez-vous"} />
        <Stat n={m.remaining.length} label={isToday ? "restantes" : "non faites"} />
        {isToday && <Stat n={m.late} label="en retard" warn={m.late > 0} />}
      </div>
      <div className="progress" title={`${pct} %`}><i style={{ width: `${pct}%` }} /></div>
      <div className="hint" style={{ marginTop: 6 }}>{total ? `${pct} % de ce qui était prévu ${isToday ? "aujourd'hui" : "ce jour-là"}` : "Rien n'était daté pour ce jour."}</div>

      <div className="bilan-grid">
        <section>
          <div className="section-head"><span className="eyebrow">Semaine</span></div>
          <div className="weekbars">
            {m.week.map((w, k) => (
              <button key={w.d} className={`wb ${w.d === day ? "sel" : ""} ${w.d > today ? "future" : ""}`} onClick={() => w.d <= today && setDay(w.d)} title={`${w.n} terminée(s)`}>
                <span className="wb-n num">{w.n || ""}</span>
                <span className="wb-bar"><i style={{ height: `${(w.n / maxWeek) * 100}%` }} /></span>
                <span className="wb-d">{WEEKDAYS_SHORT[k].replace(".", "")}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <div className="section-head"><span className="eyebrow">Par catégorie</span></div>
          {m.cats.length === 0 && <div className="empty">—</div>}
          {m.cats.map(([id, n]) => {
            const c = categoryOf(id);
            return (
              <div key={id} className="catbar">
                <span className="cb-l"><CatIcon name={c.icon} size={12} /> {c.name}</span>
                <span className="cb-bar"><i style={{ width: `${(n / maxCat) * 100}%` }} /></span>
                <span className="cb-n num">{n}</span>
              </div>
            );
          })}
        </section>
      </div>

      {projects.length > 0 && (
        <section className="section">
          <div className="section-head">
            <span className="eyebrow">Temps par projet</span>
            <span className="meta right">{isToday ? "aujourd'hui" : "ce jour"} · semaine</span>
          </div>
          {projects.map((p) => {
            const dm = m.projDay.get(p.id) ?? 0;
            const wm = m.projWeek.get(p.id) ?? 0;
            const maxW = Math.max(60, ...[...m.projWeek.values()]);
            return (
              <div key={p.id} className="projrow">
                <span className="pr-l"><i style={{ background: p.color }} />{p.name}</span>
                <span className="pr-bar"><i style={{ width: `${(wm / maxW) * 100}%`, background: p.color }} /><b style={{ width: `${(dm / maxW) * 100}%`, background: p.color }} /></span>
                <span className="pr-n num">{dm ? fmtDuration(dm) : "—"}</span>
                <span className="pr-n num muted">{wm ? fmtDuration(wm) : "—"}</span>
              </div>
            );
          })}
          <div className="hint" style={{ marginTop: 4 }}>Compté : rendez-vous et blocs de journée type passés, tâches terminées avec une durée.</div>
        </section>
      )}

      <section className="section">
        <div className="section-head"><span className="eyebrow">Ce que j'ai fait</span><span className="meta">{timeline.length || ""}</span></div>
        {timeline.length === 0 && <div className="empty">{isToday ? "Rien de coché pour l'instant. Ça viendra." : "Rien ce jour-là."}</div>}
        <div className="timeline">
          {timeline.map(({ at, item, kind }) => {
            const c = categoryOf(item.categoryId);
            return (
              <div key={item.id} className="tl" onClick={() => openEditor(item)}>
                <span className="tl-t num">{at}</span>
                <span className={`tl-dot ${kind}`}>{kind === "done" ? <Check size={10} strokeWidth={3} /> : null}</span>
                <div className="tl-body">
                  <div className="tl-title">{item.title}</div>
                  <div className="tl-meta"><CatIcon name={c.icon} size={11} /> {c.name}{kind === "event" ? " · rendez-vous" : ""}</div>
                  {item.notes && <div className="row-notes"><RichText text={item.notes} /></div>}
                  {isFollowupCandidate(item) && (
                    <button className="pill" style={{ marginTop: 6 }} onClick={(e) => { e.stopPropagation(); createFollowup(item); }}>Planifier une relance</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {ready && <Journal day={day} />}
      <HistoryList />
    </div>
  );
}

function Stat({ n, label, accent, warn }: { n: number; label: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`stat ${accent ? "accent" : ""} ${warn ? "warn" : ""}`}>
      <span className="stat-n num">{n}</span>
      <span className="stat-l">{label}</span>
    </div>
  );
}

/** Note du jour : enregistrée automatiquement. */
export function Journal({ day }: { day: string }) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    let alive = true;
    getJournal(day).then((t) => { if (alive) { setText(t ?? ""); setSaved(true); } });
    return () => { alive = false; };
  }, [day]);
  useEffect(() => {
    const t = ref.current;
    if (t) { t.style.height = "auto"; t.style.height = `${Math.max(110, t.scrollHeight)}px`; }
  }, [text]);
  const change = (v: string) => {
    setText(v); setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setJournal(day, v).then(() => setSaved(true)), 600);
  };
  return (
    <section className="section">
      <div className="section-head">
        <span className="eyebrow">Note du jour</span>
        <span className="meta right">{saved ? "enregistrée" : "…"}</span>
      </div>
      <textarea ref={ref} className="notes-input journal" value={text} onChange={(e) => change(e.target.value)}
        placeholder="Ce qui s'est passé, ce que j'ai appris, ce qui bloque, à reprendre demain…" />
    </section>
  );
}
