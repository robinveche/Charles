import { useEffect, useRef, useState } from "react";
import { EyeOff, Lock, Maximize2, PanelTop, Unlock } from "lucide-react";
import type { Item, WidgetSize } from "../../core/types";
import { fromMinutes, minutesOf, MONTHS, relativeDay, toISODate, WEEKDAYS, weekdayMon0, addDaysISO } from "../../core/dates";
import { buildToday, byDateTime, byPriorityThenTime, isPlanning, itemsInRange } from "../../core/selectors";
import { parseQuickInput } from "../../core/parser";
import { categoryOf, completeItem, createItem, projectOf, showToast, uncompleteItem, updateSettings, useCharles, getState } from "../../data/store";
import { applyWidget, showMain } from "../../platform";
import { CatIcon, CheckSvg } from "../components/Icon";
import { useNow } from "../views/Today";
import { summarize } from "../format";

const fmtLeft = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`);

/** Widget de bureau : toute la journée d'un coup d'œil, sans ouvrir Charles. */
export function Widget() {
  const { items, settings, lingering, toast } = useCharles();
  const now = useNow(20_000);
  const w = settings.widget;
  const m = buildToday(items, now, lingering);
  const today = toISODate(now);
  const nm = now.getHours() * 60 + now.getMinutes();
  const [adding, setAdding] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const curRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.body.classList.add("transparent"); }, []);
  useEffect(() => {
    if (toast && !toast.undo) { setFlash(`✓ ${toast.message}`); const t = setTimeout(() => setFlash(null), 2200); return () => clearTimeout(t); }
  }, [toast?.id]);
  // garde l'élément en cours visible dans le programme
  useEffect(() => { curRef.current?.scrollIntoView({ block: "nearest" }); }, [m.current?.id, w.size]);

  const set = (p: Partial<typeof w>, resize = false) => {
    const nw = { ...getState().settings.widget, ...p };
    updateSettings({ widget: nw });
    applyWidget(nw, resize);
  };
  const cycleSize = () => {
    const order: WidgetSize[] = ["mini", "standard", "large"];
    set({ size: order[(order.indexOf(w.size) + 1) % 3] }, true);
  };

  const add = async () => {
    if (!adding.trim()) return;
    const s = getState();
    const r = parseQuickInput(adding, { categories: s.categories, projects: s.projects, defaultReminders: s.settings.defaultReminders });
    const it = await createItem(r.draft);
    showToast(it.title, { detail: summarize(it), ms: 2500 });
    setAdding("");
  };

  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dateLabel = `${WEEKDAYS[weekdayMon0(now)]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;

  // Programme du jour : journée type + rendez-vous + tâches à heure fixe, dans l'ordre
  const timed = [
    ...m.planning,
    ...(m.next && m.next.date === today ? [m.next] : []),
    ...m.today.filter((i) => i.time),
  ].sort(byDateTime);
  const endOf = (i: Item) => minutesOf(i.time!) + (i.durationMin || (i.kind === "event" ? 60 : 30));
  const upcomingTimed = w.size === "large" ? timed : timed.filter((i) => endOf(i) > nm || lingering.has(i.id));
  const todo = m.today.filter((i) => !i.time).sort(byPriorityThenTime);
  const doneToday = m.counts.doneToday;
  const totalToday = doneToday + m.counts.today;
  const pct = totalToday ? Math.round((doneToday / totalToday) * 100) : 0;
  const tomorrow = addDaysISO(today, 1);
  const tmr = itemsInRange(items.filter((i) => !i.deletedAt && !i.doneAt && !isPlanning(i)), tomorrow, tomorrow).slice(0, 4);

  const cur = m.current;
  const curLeft = cur && m.currentState === "now" ? endOf(cur) - nm : 0;
  const curPct = cur && m.currentState === "now" ? Math.min(100, ((nm - minutesOf(cur.time!)) / cur.durationMin) * 100) : 0;

  return (
    <div className="widget" style={{ ["--wop" as any]: w.opacity }}>
      <div className={`wcard size-${w.size}`}>
        <div className="whead2" data-tauri-drag-region={w.locked ? undefined : true}>
          <div data-tauri-drag-region={w.locked ? undefined : true}>
            <div className="wclock num" data-tauri-drag-region={w.locked ? undefined : true}>{clock}</div>
            <div className="wdate2" data-tauri-drag-region={w.locked ? undefined : true}>{dateLabel}</div>
          </div>
          <div className="wstats" data-tauri-drag-region={w.locked ? undefined : true}>
            <span><b className="num">{m.counts.today}</b> à faire</span>
            {m.counts.overdue > 0 && <span className="warn"><b className="num">{m.counts.overdue}</b> en retard</span>}
            <span><b className="num">{doneToday}</b> faite{doneToday > 1 ? "s" : ""}</span>
          </div>
        </div>
        <div className="wprog"><i style={{ width: `${pct}%` }} /></div>

        <div className="wtools">
          <button className="icon-btn" title={`Taille : ${{ mini: "mini", standard: "standard", large: "grande" }[w.size]} (cliquer pour changer)`} onClick={cycleSize}><PanelTop size={14} /></button>
          <button className="icon-btn" title={w.locked ? "Désépingler" : "Épingler (verrouiller la position)"} onClick={() => set({ locked: !w.locked })}>
            {w.locked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
          <button className="icon-btn" title="Ouvrir Charles" onClick={() => showMain("today")}><Maximize2 size={14} /></button>
          <button className="icon-btn" title="Masquer le widget" onClick={() => set({ visible: false })}><EyeOff size={14} /></button>
        </div>

        <div className="wbody2">
          {cur && (
            <div className={`wnow ${m.currentState}`} onClick={() => showMain("today")}>
              <div className="wnow-l">{m.currentState === "now" ? "En ce moment" : `Ensuite · ${cur.time}`}</div>
              <div className="wnow-t">{cur.title}</div>
              <div className="wnow-m num">
                {cur.time} – {fromMinutes(endOf(cur))}{m.currentState === "now" ? ` · reste ${fmtLeft(curLeft)}` : ` · dans ${fmtLeft(minutesOf(cur.time!) - nm)}`}
              </div>
              {m.currentState === "now" && <div className="wnow-bar"><i style={{ width: `${curPct}%` }} /></div>}
            </div>
          )}

          {m.next && (
            <div className="wnext2" onClick={() => showMain("today")}>
              <span className="wn-time num">{m.next.time}</span>
              <div style={{ minWidth: 0 }}>
                <div className="wn-l">{m.next.date !== today ? `Prochain · ${relativeDay(m.next.date!, today)}`
                  : minutesOf(m.next.time!) <= nm ? `En cours · jusqu'à ${fromMinutes(endOf(m.next))}`
                  : `Prochain · dans ${fmtLeft(minutesOf(m.next.time!) - nm)}`}</div>
                <div className="wn-t">{m.next.title}</div>
              </div>
            </div>
          )}

          {w.size !== "mini" && (
            <>
              {m.overdue.length > 0 && (
                <>
                  <div className="wlabel warn">En retard</div>
                  {m.overdue.slice(0, w.size === "large" ? 8 : 4).map((i) => <WRow key={i.id} item={i} />)}
                </>
              )}

              <div className="wlabel">Programme</div>
              {upcomingTimed.length === 0 && <div className="wempty">Plus rien à heure fixe aujourd'hui.</div>}
              {upcomingTimed.map((i) => {
                const isCur = cur && i.id === cur.id && m.currentState === "now";
                const past = endOf(i) <= nm;
                return (
                  <div key={i.id} ref={isCur ? curRef : undefined}>
                    <WRow item={i} showTime timeRange={isPlanning(i)} current={!!isCur} past={past} />
                  </div>
                );
              })}

              <div className="wlabel">À faire aujourd'hui</div>
              {todo.length === 0 && m.someday.length === 0 && <div className="wempty">Rien d'autre. Bien joué.</div>}
              {todo.map((i) => <WRow key={i.id} item={i} />)}
              {m.someday.slice(0, w.size === "large" ? 6 : 3).map((i) => <WRow key={i.id} item={i} muted />)}

              {w.size === "large" && tmr.length > 0 && (
                <>
                  <div className="wlabel">Demain</div>
                  {tmr.map((i) => <WRow key={i.id} item={i} showTime />)}
                </>
              )}
            </>
          )}
        </div>

        {w.size !== "mini" && (
          <div className="wadd">
            <input
              placeholder={flash ?? "+ Ajouter  (ex. « Appeler Thomas demain 14h »)"}
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") { setAdding(""); (e.target as HTMLInputElement).blur(); } }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function WRow({ item, showTime, timeRange, current, past, muted }: {
  item: Item; showTime?: boolean; timeRange?: boolean; current?: boolean; past?: boolean; muted?: boolean;
}) {
  const { lingering } = useCharles();
  const [leave, setLeave] = useState(false);
  const lingers = !!item.doneAt && lingering.has(item.id);
  useEffect(() => {
    if (!lingers) return setLeave(false);
    const t = setTimeout(() => setLeave(true), 1500);
    return () => clearTimeout(t);
  }, [lingers]);
  const isEvent = item.kind === "event";
  const plan = isPlanning(item);
  const cat = categoryOf(item.categoryId);
  const proj = projectOf(item.projectId);
  const end = item.time ? fromMinutes(minutesOf(item.time) + (item.durationMin || 60)) : "";
  return (
    <div className={`wrow2 ${item.doneAt ? "done" : ""} ${leave ? "leaving" : ""} ${current ? "current" : ""} ${past ? "past" : ""} ${plan ? "isplan" : ""} ${muted ? "muted" : ""}`}>
      {showTime && <span className="w-time num">{item.time ?? ""}</span>}
      {isEvent ? <span className="w-bar"><i /></span> : (
        <button className={`check p${item.priority} ${item.doneAt ? "on" : ""}`} onClick={() => (item.doneAt ? uncompleteItem(item.id) : completeItem(item.id))}>
          <CheckSvg />
        </button>
      )}
      <div className="w-main">
        <div className="w-title" style={item.priority === 2 ? { fontWeight: 600 } : undefined}>{item.title}</div>
        {!plan && (
          <div className="w-meta">
            <CatIcon name={cat.icon} size={11} /> {cat.name}
            {proj && <> · <i style={{ background: proj.color }} />{proj.name}</>}
            {!showTime && item.time && <> · {item.time}</>}
            {item.notes && <> · <span className="w-note">{item.notes.split("\n")[0]}</span></>}
          </div>
        )}
        {plan && timeRange && <div className="w-meta num">jusqu'à {end}</div>}
      </div>
    </div>
  );
}
