import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Item, ItemDraft } from "../../core/types";
import {
  addDays, addDaysISO, fromMinutes, minutesOf, MONTHS, parseISODate, startOfWeek, toISODate, WEEKDAYS, WEEKDAYS_SHORT, weekdayMon0,
} from "../../core/dates";
import { isProjection, itemsInRange } from "../../core/selectors";
import { categoryOf, moveItem, useCharles } from "../../data/store";
import { QuickAdd } from "../components/QuickAdd";
import { openEditor, setUI } from "../uiState";
import { useNow } from "./Today";

type Mode = "day" | "week" | "month";
const HH = 52; // hauteur d'une heure (px)
const SNAP = 15;

const readMode = (): Mode => {
  try { return (localStorage.getItem("charles.calmode") as Mode) || "week"; } catch { return "week"; }
};

export function CalendarView() {
  const [mode, setModeState] = useState<Mode>(readMode);
  const [cursor, setCursor] = useState(() => toISODate(new Date()));
  const [pop, setPop] = useState<{ x: number; y: number; draft: Partial<ItemDraft> } | null>(null);
  const setMode = (m: Mode) => { setModeState(m); try { localStorage.setItem("charles.calmode", m); } catch { /* */ } };

  const c = parseISODate(cursor);
  const step = (dir: number) => {
    if (mode === "day") setCursor(addDaysISO(cursor, dir));
    else if (mode === "week") setCursor(addDaysISO(cursor, dir * 7));
    else setCursor(toISODate(new Date(c.getFullYear(), c.getMonth() + dir, 1)));
  };
  const title = mode === "month"
    ? `${MONTHS[c.getMonth()]} ${c.getFullYear()}`
    : mode === "day"
      ? `${WEEKDAYS[weekdayMon0(c)]} ${c.getDate()} ${MONTHS[c.getMonth()]}`
      : (() => {
          const s = startOfWeek(c), e = addDays(s, 6);
          return s.getMonth() === e.getMonth()
            ? `${s.getDate()} – ${e.getDate()} ${MONTHS[e.getMonth()]}`
            : `${s.getDate()} ${MONTHS[s.getMonth()].slice(0, 4)}. – ${e.getDate()} ${MONTHS[e.getMonth()].slice(0, 4)}.`;
        })();

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select") || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "t") setCursor(toISODate(new Date()));
      else if (e.key === "j" || e.key === "d") setMode("day");
      else if (e.key === "s" || e.key === "w") setMode("week");
      else if (e.key === "m") setMode("month");
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const days = mode === "day" ? [cursor] : Array.from({ length: 7 }, (_, i) => toISODate(addDays(startOfWeek(c), i)));

  return (
    <div className="page wide">
      <div className="cal-toolbar">
        <div className="cal-title">{title}</div>
        <button className="icon-btn" onClick={() => step(-1)} aria-label="Précédent"><ChevronLeft size={18} /></button>
        <button className="btn" style={{ height: 30 }} onClick={() => setCursor(toISODate(new Date()))}>Aujourd'hui</button>
        <button className="icon-btn" onClick={() => step(1)} aria-label="Suivant"><ChevronRight size={18} /></button>
        <span className="spacer" />
        <button className="btn ghost" style={{ height: 30 }} onClick={() => setUI({ planning: true })}>Journée type</button>
        <div className="seg">
          {(["day", "week", "month"] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{{ day: "Jour", week: "Semaine", month: "Mois" }[m]}</button>
          ))}
        </div>
      </div>
      {mode === "month"
        ? <MonthGrid cursor={cursor} onAdd={(x, y, date) => setPop({ x, y, draft: { date } })} onOpenDay={(d) => { setCursor(d); setMode("day"); }} />
        : <TimeGrid days={days} onAdd={(x, y, date, time) => setPop({ x, y, draft: { date, time } })} onOpenDay={(d) => { setCursor(d); setMode("day"); }} />}
      {pop && <AddPopover {...pop} onClose={() => setPop(null)} />}
    </div>
  );
}

function AddPopover({ x, y, draft, onClose }: { x: number; y: number; draft: Partial<ItemDraft>; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", h), 0);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const d = parseISODate(draft.date!);
  const left = Math.min(x, innerWidth - 360);
  const top = Math.min(y, innerHeight - 170);
  return (
    <div className="popover" ref={ref} style={{ left, top }} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <span className="eyebrow">{WEEKDAYS[weekdayMon0(d)]} {d.getDate()} {MONTHS[d.getMonth()]}{draft.time ? ` · ${draft.time}` : ""}</span>
      <QuickAdd autoFocus override={draft} placeholder={draft.time ? "RDV, appel, tâche…" : "Ajouter ce jour-là…"} onCreated={onClose} />
    </div>
  );
}

// ─── Glisser-déposer ─────────────────────────────────────────
let dragInfo: { id: string; grabMin: number } | null = null;

function useDrop(onDrop: (id: string, grabMin: number, e: React.DragEvent) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => { if (dragInfo) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(true); } },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault(); setOver(false);
        if (dragInfo) onDrop(dragInfo.id, dragInfo.grabMin, e);
        dragInfo = null;
      },
    },
  };
}

function dragProps(item: Item, grabMin = 0) {
  if (isProjection(item.id) || item.doneAt) return { draggable: false };
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      dragInfo = { id: item.id, grabMin: grabMin ? ((e.clientY - r.top) / HH) * 60 : 0 };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.title);
      (e.currentTarget as HTMLElement).classList.add("dragging");
    },
    onDragEnd: (e: React.DragEvent) => { (e.currentTarget as HTMLElement).classList.remove("dragging"); dragInfo = null; },
  };
}

// ─── Vue jour / semaine ──────────────────────────────────────
function TimeGrid({ days, onAdd, onOpenDay }: {
  days: string[];
  onAdd: (x: number, y: number, date: string, time: string) => void;
  onOpenDay: (d: string) => void;
}) {
  const { items } = useCharles();
  const now = useNow(60_000);
  const today = toISODate(now);
  const scroller = useRef<HTMLDivElement>(null);
  const inRange = useMemo(() => itemsInRange(items, days[0], days[days.length - 1]), [items, days.join()]);
  const cols = `56px repeat(${days.length}, 1fr)`;

  useLayoutEffect(() => {
    const target = Math.max(0, (Math.min(now.getHours() - 1, 8)) * HH);
    if (scroller.current) scroller.current.scrollTop = target;
  }, []);

  return (
    <div className="cal" style={{ ["--hh" as any]: `${HH}px` }}>
      <div className="cal-scroll" ref={scroller}>
      <div className="cal-sticky">
      <div className="cal-head" style={{ gridTemplateColumns: cols }}>
        <div className="dh" />
        {days.map((d) => {
          const dd = parseISODate(d);
          return (
            <div key={d} className={`dh ${d === today ? "today" : ""}`} onClick={() => onOpenDay(d)}>
              {WEEKDAYS_SHORT[weekdayMon0(dd)]} <b>{dd.getDate()}</b>
            </div>
          );
        })}
      </div>
      <div className="cal-allday" style={{ gridTemplateColumns: cols }}>
        <div>journée</div>
        {days.map((d) => <AllDayCell key={d} date={d} items={inRange.filter((i) => i.date === d && !i.time)} />)}
      </div>
      </div>
        <div className="cal-grid" style={{ gridTemplateColumns: cols }}>
          <div className="cal-hours">{Array.from({ length: 24 }, (_, h) => <div key={h}>{h ? `${String(h).padStart(2, "0")}:00` : ""}</div>)}</div>
          {days.map((d) => (
            <DayColumn key={d} date={d} isToday={d === today} now={now}
              items={inRange.filter((i) => i.date === d && i.time)} onAdd={onAdd} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AllDayCell({ date, items }: { date: string; items: Item[] }) {
  const drop = useDrop((id) => moveItem(id, date, null));
  return (
    <div {...drop.props} className={drop.over ? "drop" : ""} style={drop.over ? { background: "var(--accent-soft)" } : undefined}>
      {items.map((i) => (
        <div key={i.id} className={`pillev ${i.kind} ${i.doneAt ? "done" : ""}`} {...dragProps(i)} onClick={() => openEditor(i)} title={i.title}>
          {i.title}
        </div>
      ))}
    </div>
  );
}

/** Disposition des éléments qui se chevauchent : colonnes côte à côte. */
function layout(items: Item[]) {
  const ev = items.map((i) => {
    const s = minutesOf(i.time!);
    const len = i.kind === "event" ? Math.max(15, i.durationMin || 60) : Math.max(15, i.durationMin || 30);
    return { i, s, e: s + len, lane: 0, lanes: 1 };
  }).sort((a, b) => a.s - b.s || b.e - a.e);
  let cluster: typeof ev = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanesEnd: number[] = [];
    for (const x of cluster) {
      let l = lanesEnd.findIndex((end) => end <= x.s);
      if (l === -1) { l = lanesEnd.length; lanesEnd.push(x.e); } else lanesEnd[l] = x.e;
      x.lane = l;
    }
    for (const x of cluster) x.lanes = lanesEnd.length;
    cluster = [];
  };
  for (const x of ev) {
    if (x.s >= clusterEnd && cluster.length) flush();
    cluster.push(x);
    clusterEnd = Math.max(clusterEnd, x.e);
  }
  flush();
  return ev;
}

function DayColumn({ date, isToday, now, items, onAdd }: {
  date: string; isToday: boolean; now: Date; items: Item[];
  onAdd: (x: number, y: number, date: string, time: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drop = useDrop((id, grabMin, e) => {
    const r = ref.current!.getBoundingClientRect();
    const min = ((e.clientY - r.top) / HH) * 60 - grabMin;
    const snapped = Math.max(0, Math.min(24 * 60 - SNAP, Math.round(min / SNAP) * SNAP));
    moveItem(id, date, fromMinutes(snapped));
  });
  // les blocs de la journée type forment un fond discret ; les vrais éléments se placent par-dessus
  const plan = items.filter((i) => i.categoryId === "planning");
  const laid = layout(items.filter((i) => i.categoryId !== "planning"));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return (
    <div
      ref={ref}
      className={`cal-col ${isToday ? "today" : ""} ${drop.over ? "drop" : ""}`}
      style={{ height: HH * 24 }}
      {...drop.props}
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget || e.button !== 0) return;
        const r = ref.current!.getBoundingClientRect();
        const min = Math.floor((((e.clientY - r.top) / HH) * 60) / 30) * 30;
        onAdd(e.clientX + 8, e.clientY + 8, date, fromMinutes(min));
      }}
    >
      {plan.map((i) => {
        const s = minutesOf(i.time!);
        return (
          <div key={i.id} className="ev planning" style={{ top: (s / 60) * HH + 1, height: Math.max(18, (i.durationMin / 60) * HH - 2), left: 3, right: 3, zIndex: 1 }}
            onClick={(e) => { e.stopPropagation(); openEditor(i); }} title={`${i.time} ${i.title}`}>
            <div className="em" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.time} {i.title}</div>
          </div>
        );
      })}
      {laid.map(({ i, s, e: end, lane, lanes }) => {
        const cat = categoryOf(i.categoryId);
        const h = Math.max(22, ((end - s) / 60) * HH - 2);
        return (
          <div
            key={i.id}
            className={`ev ${i.kind} ${i.categoryId === "planning" ? "planning" : ""} ${i.doneAt ? "done" : ""}`}
            style={{ top: (s / 60) * HH + 1, height: h, left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)`, right: "auto" }}
            {...dragProps(i, 1)}
            onClick={(e) => { e.stopPropagation(); openEditor(i); }}
            title={`${i.time} ${i.title}`}
          >
            {i.kind === "task" && <span className="dot" style={i.priority === 2 ? { borderColor: "var(--urgent)" } : i.priority === 1 ? { borderColor: "var(--accent)" } : undefined} />}
            <div style={{ minWidth: 0 }}>
              <div className="et" style={{ whiteSpace: h < 40 ? "nowrap" : undefined, overflow: "hidden", textOverflow: "ellipsis" }}>
                {h < 40 && <span className="em">{i.time} </span>}{i.title}
              </div>
              {h >= 40 && <div className="em">{i.time}{i.kind === "event" ? ` – ${fromMinutes(end)}` : ` · ${cat.name}`}</div>}
            </div>
          </div>
        );
      })}
      {isToday && <div className="now-line" style={{ top: (nowMin / 60) * HH }} />}
    </div>
  );
}

// ─── Vue mois ────────────────────────────────────────────────
function MonthGrid({ cursor, onAdd, onOpenDay }: {
  cursor: string; onAdd: (x: number, y: number, date: string) => void; onOpenDay: (d: string) => void;
}) {
  const { items } = useCharles();
  const c = parseISODate(cursor);
  const first = new Date(c.getFullYear(), c.getMonth(), 1);
  const start = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => toISODate(addDays(start, i)));
  // la journée type n'apparaît pas en vue mois (elle noierait les vrais rendez-vous)
  const inRange = useMemo(() => itemsInRange(items.filter((i) => i.categoryId !== "planning"), cells[0], cells[41]), [items, cursor]);
  const today = toISODate(new Date());
  return (
    <div className="cal">
      <div className="cal-head" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
        {WEEKDAYS_SHORT.map((w, i) => <div key={w} className="dh" style={{ cursor: "default", borderLeft: i ? undefined : 0 }}>{w}</div>)}
      </div>
      <div className="month">
        {cells.map((d) => (
          <MonthCell key={d} date={d} other={parseISODate(d).getMonth() !== c.getMonth()} isToday={d === today}
            items={inRange.filter((i) => i.date === d)} onAdd={onAdd} onOpenDay={onOpenDay} />
        ))}
      </div>
    </div>
  );
}

function MonthCell({ date, other, isToday, items, onAdd, onOpenDay }: {
  date: string; other: boolean; isToday: boolean; items: Item[];
  onAdd: (x: number, y: number, date: string) => void; onOpenDay: (d: string) => void;
}) {
  const drop = useDrop((id) => moveItem(id, date, undefined));
  const max = 4;
  const sorted = [...items].sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
  return (
    <div
      className={`mcell ${other ? "other" : ""} ${isToday ? "today" : ""} ${drop.over ? "drop" : ""}`}
      {...drop.props}
      onMouseDown={(e) => { if (e.target === e.currentTarget && e.button === 0) onAdd(e.clientX + 6, e.clientY + 6, date); }}
    >
      <span className="dn" onClick={() => onOpenDay(date)} style={{ cursor: "pointer" }}>{parseISODate(date).getDate()}</span>
      {sorted.slice(0, max).map((i) => (
        <div key={i.id} className={`pillev ${i.kind} ${i.categoryId === "planning" ? "planning" : ""} ${i.doneAt ? "done" : ""}`} {...dragProps(i)} onClick={() => openEditor(i)} title={i.title}>
          {i.time && <span className="tm">{i.time}</span>}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{i.title}</span>
        </div>
      ))}
      {sorted.length > max && <span className="more" onClick={() => onOpenDay(date)} style={{ cursor: "pointer" }}>+{sorted.length - max} autres</span>}
    </div>
  );
}
