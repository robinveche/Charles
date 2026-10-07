import { useEffect, useState } from "react";
import { AlertTriangle, Moon } from "lucide-react";
import { fromMinutes, minutesOf, longDate, relativeDay, toISODate, weekdayMon0, parseISODate, WEEKDAYS, MONTHS } from "../../core/dates";
import { buildToday } from "../../core/selectors";
import { categoryOf, useCharles } from "../../data/store";
import { QuickAdd } from "../components/QuickAdd";
import { ItemRow, OverdueRow } from "../components/ItemRow";
import { CatIcon } from "../components/Icon";
import { openEditor, setUI } from "../uiState";
import type { Item } from "../../core/types";

/** Rafraîchit l'horloge chaque minute (pas plus : économie de CPU). */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    const vis = () => setNow(new Date());
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [intervalMs]);
  return now;
}

export function Today({ quickRef }: { quickRef: React.RefObject<HTMLInputElement | null> }) {
  const { items, lingering, settings } = useCharles();
  const now = useNow();
  const m = buildToday(items, now, lingering);
  const today = toISODate(now);
  const d = parseISODate(today);

  return (
    <div className="page">
      <div className="eyebrow">{WEEKDAYS[weekdayMon0(d)]}</div>
      <h1 className="date-title">
        {d.getDate()} {MONTHS[d.getMonth()]} <span className="num">· {now.getHours().toString().padStart(2, "0")}:{now.getMinutes().toString().padStart(2, "0")}</span>
      </h1>

      {m.current && (
        <div className="now-block">
          <span className="dotlive" style={m.currentState === "next" ? { background: "var(--text-3)", boxShadow: "none" } : undefined} />
          {m.currentState === "now" ? "En ce moment" : `Ensuite à ${m.current.time}`} · <b>{m.current.title}</b>
          <span className="hint">{m.currentState === "now" ? `jusqu'à ${fromMinutes(minutesOf(m.current.time!) + m.current.durationMin)}` : ""}</span>
        </div>
      )}

      {settings.eveningReview && settings.lastReview !== today && now.getHours() * 60 + now.getMinutes() >= minutesOf(settings.eveningReview) && (
        <button className="review-banner" onClick={() => setUI({ review: true })}>
          <Moon size={15} /> <span><b>Revue du soir</b> · 2 min pour boucler la journée et préparer demain</span>
          <span className="rb-go">Commencer →</span>
        </button>
      )}

      <NextCard next={m.next} today={today} />

      <QuickAdd inputRef={quickRef} placeholder="Ajouter quelque chose…   ex. « Relancer Lucas vendredi 14h »" />

      {m.overdue.length > 0 && (
        <section className="section">
          <div className="section-head">
            <AlertTriangle size={13} color="var(--urgent)" />
            <span className="eyebrow warn">En retard</span>
            <span className="meta">{m.overdue.length}</span>
          </div>
          <div className="list">{m.overdue.map((i) => <OverdueRow key={i.id} item={i} />)}</div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">À faire aujourd'hui</span>
          <span className="meta">{m.today.filter((i) => !i.doneAt).length || ""}</span>
          {m.counts.doneToday > 0 && <span className="meta right">{m.counts.doneToday} terminé{m.counts.doneToday > 1 ? "s" : ""}</span>}
        </div>
        <div className="list">
          {m.today.map((i) => <ItemRow key={i.id} item={i} />)}
          {m.today.length === 0 && (
            <div className="empty">{m.overdue.length ? "Rien d'autre de prévu. Commencez par les retards." : "Rien de prévu aujourd'hui. Journée libre."}</div>
          )}
        </div>
      </section>

      {m.planning.length > 0 && <PlanningSection blocks={m.planning} now={now} />}

      {m.someday.length > 0 && (
        <section className="section">
          <div className="section-head">
            <span className="eyebrow">Sans date</span>
            <span className="meta">{m.someday.filter((i) => !i.doneAt).length}</span>
          </div>
          <div className="list">{m.someday.map((i) => <ItemRow key={i.id} item={i} />)}</div>
        </section>
      )}

      <section className="section">
        <div className="section-head"><span className="eyebrow">À venir</span></div>
        {m.upcoming.length === 0 && <div className="empty">Rien sur les 7 prochains jours.</div>}
        {m.upcoming.map((g) => (
          <div key={g.date}>
            <div className="day-label">{relativeDay(g.date, today)}<span>{longDate(g.date).split(" ").slice(1).join(" ")}</span></div>
            <div className="list">{g.items.map((i) => <ItemRow key={i.id} item={i} />)}</div>
          </div>
        ))}
      </section>
    </div>
  );
}

function NextCard({ next, today }: { next: ReturnType<typeof buildToday>["next"]; today: string }) {
  if (!next) {
    return (
      <div className="next empty-next">
        <div>
          <div className="next-label" style={{ color: "var(--text-3)" }}>Prochain</div>
          <div style={{ fontSize: 15 }}>Aucun rendez-vous à venir. L'agenda est dégagé.</div>
        </div>
      </div>
    );
  }
  const cat = categoryOf(next.categoryId);
  return (
    <div className="next" onClick={() => openEditor(next)}>
      <div className="next-time">{next.time}</div>
      <div style={{ minWidth: 0 }}>
        <div className="next-label">{next.date === today ? "Prochain" : `Prochain · ${relativeDay(next.date!, today)}`}</div>
        <div className="next-title">{next.title}</div>
        <div className="next-meta">
          <CatIcon name={cat.icon} size={12} /> {cat.name}
          {next.kind === "event" && next.durationMin ? <span>· {next.durationMin < 60 ? `${next.durationMin} min` : `${Math.floor(next.durationMin / 60)} h${next.durationMin % 60 ? ` ${next.durationMin % 60}` : ""}`}</span> : null}
          {next.notes && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {next.notes.split("\n")[0]}</span>}
        </div>
      </div>
    </div>
  );
}

/** Journée type du jour : compacte, les blocs passés s'estompent. */
function PlanningSection({ blocks, now }: { blocks: Item[]; now: Date }) {
  const [open, setOpen] = useState(false);
  const nm = now.getHours() * 60 + now.getMinutes();
  const state = (b: Item) => {
    const s = minutesOf(b.time!);
    return nm >= s + b.durationMin ? "past" : nm >= s ? "now" : "";
  };
  const upcoming = blocks.filter((b) => state(b) !== "past");
  const shown = open ? blocks : upcoming.slice(0, 4);
  return (
    <section className="section">
      <div className="section-head">
        <span className="eyebrow">Planning du jour</span>
        <span className="meta">{blocks.length}</span>
        <button className="meta right" style={{ cursor: "pointer" }} onClick={() => setUI({ planning: true })}>Journée type</button>
      </div>
      <div className="plan">
        {shown.map((b) => (
          <div key={b.id} className={`plan-row ${state(b)}`} onClick={() => openEditor(b)}>
            <span className="pt">{b.time} – {fromMinutes(minutesOf(b.time!) + b.durationMin)}</span>
            <span>{b.title}</span>
            {state(b) === "now" ? <span className="tag">En cours</span> : <span />}
          </div>
        ))}
        {(blocks.length > shown.length || open) && (
          <button className="hint" style={{ textAlign: "left", padding: "6px 8px" }} onClick={() => setOpen(!open)}>
            {open ? "Masquer les blocs passés" : `Voir toute la journée (${blocks.length})`}
          </button>
        )}
        {upcoming.length === 0 && !open && <div className="empty" style={{ padding: "6px 8px" }}>Journée de planning terminée.</div>}
      </div>
    </section>
  );
}
