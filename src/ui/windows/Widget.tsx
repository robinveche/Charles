import { useEffect, useState } from "react";
import { EyeOff, Lock, Maximize2, PanelTop, Unlock } from "lucide-react";
import type { Item, WidgetSize } from "../../core/types";
import { MONTHS_SHORT, relativeDay, toISODate, WEEKDAYS_SHORT, weekdayMon0 } from "../../core/dates";
import { buildToday, byDateTime } from "../../core/selectors";
import { parseQuickInput } from "../../core/parser";
import { completeItem, createItem, showToast, uncompleteItem, updateSettings, useCharles, getState } from "../../data/store";
import { applyWidget, showMain } from "../../platform";
import { CheckSvg } from "../components/Icon";
import { useNow } from "../views/Today";
import { summarize } from "../format";

/** Widget de bureau : la journée d'un coup d'œil. */
export function Widget() {
  const { items, settings, lingering, toast } = useCharles();
  const now = useNow(20_000);
  const w = settings.widget;
  const m = buildToday(items, now, lingering);
  const today = toISODate(now);
  const [adding, setAdding] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { document.body.classList.add("transparent"); }, []);
  useEffect(() => {
    if (toast && !toast.undo) { setFlash(`✓ ${toast.message}`); const t = setTimeout(() => setFlash(null), 2200); return () => clearTimeout(t); }
  }, [toast?.id]);

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

  const d = now;
  const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const dateLabel = `${WEEKDAYS_SHORT[weekdayMon0(d)].replace(".", "")}. ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  const todayTasks = [...m.today, ...m.someday.slice(0, 3)];
  const fullDay = [...(m.next && m.next.date === today ? [m.next] : []), ...m.today, ...m.planning].sort(byDateTime);

  return (
    <div className="widget" style={{ ["--wop" as any]: w.opacity }}>
      <div className="wcard">
        <div className="whead" data-tauri-drag-region={w.locked ? undefined : true}>
          <span className="brand-name" data-tauri-drag-region={w.locked ? undefined : true}>CHARLES</span>
          <span className="clock">{clock}</span>
        </div>
        <div className="wtools">
          <button className="icon-btn" title={`Taille : ${w.size}`} onClick={cycleSize}><PanelTop size={13} /></button>
          <button className="icon-btn" title={w.locked ? "Désépingler" : "Épingler (verrouiller la position)"} onClick={() => set({ locked: !w.locked })}>
            {w.locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
          <button className="icon-btn" title="Ouvrir Charles" onClick={() => showMain("today")}><Maximize2 size={13} /></button>
          <button className="icon-btn" title="Masquer le widget" onClick={() => set({ visible: false })}><EyeOff size={13} /></button>
        </div>

        {w.size === "mini" ? (
          <div className="wmini" onDoubleClick={() => showMain("today")}>
            <div className="wdate" style={{ margin: "2px 0 4px" }}>{dateLabel}</div>
            {m.next ? (
              <div className="wnext"><span className="t">{m.next.time}</span><span className="n">{m.next.title}</span></div>
            ) : <div className="count">Rien de prévu</div>}
            <div className="count">
              {m.counts.today} à faire{m.counts.overdue ? <span style={{ color: "var(--urgent)" }}> · {m.counts.overdue} en retard</span> : ""}
            </div>
          </div>
        ) : (
          <>
            <div className="wbody">
              <div className="wdate">{dateLabel}</div>
              {m.current && (
                <div className="wrow" style={{ color: "var(--text-2)", fontSize: 12 }}>
                  <span className="bar"><i style={{ background: m.currentState === "now" ? "var(--accent)" : "var(--text-3)" }} /></span>
                  <span className="tt">{m.currentState === "now" ? "En ce moment · " : `${m.current.time} · `}<b style={{ color: "var(--text)", fontWeight: 600 }}>{m.current.title}</b></span>
                </div>
              )}
              {m.next && w.size === "standard" && (
                <>
                  <div className="wlabel">{m.next.date === today ? "Prochain" : `Prochain · ${relativeDay(m.next.date!, today)}`}</div>
                  <div className="wnext" onClick={() => showMain("today")} style={{ cursor: "pointer" }}>
                    <span className="t">{m.next.time}</span><span className="n">{m.next.title}</span>
                  </div>
                </>
              )}
              {m.overdue.length > 0 && (
                <>
                  <div className="wlabel warn">En retard</div>
                  {m.overdue.slice(0, w.size === "large" ? 8 : 3).map((i) => <WRow key={i.id} item={i} />)}
                </>
              )}
              {w.size === "standard" ? (
                <>
                  <div className="wlabel">Aujourd'hui</div>
                  {todayTasks.length === 0 && <div className="wrow" style={{ color: "var(--text-3)" }}>Rien à faire. Profitez-en.</div>}
                  {todayTasks.slice(0, 8).map((i) => <WRow key={i.id} item={i} />)}
                  {todayTasks.length > 8 && <div className="wrow" style={{ color: "var(--text-3)", fontSize: 12 }}>+{todayTasks.length - 8} autres</div>}
                </>
              ) : (
                <>
                  <div className="wlabel">Journée</div>
                  {fullDay.length === 0 && <div className="wrow" style={{ color: "var(--text-3)" }}>Journée libre.</div>}
                  {fullDay.map((i) => <WRow key={i.id} item={i} showTime />)}
                  {m.someday.length > 0 && <div className="wlabel">Sans date</div>}
                  {m.someday.slice(0, 6).map((i) => <WRow key={i.id} item={i} />)}
                  {m.upcoming[0] && (
                    <>
                      <div className="wlabel">{relativeDay(m.upcoming[0].date, today)}</div>
                      {m.upcoming[0].items.slice(0, 4).map((i) => <WRow key={i.id} item={i} showTime />)}
                    </>
                  )}
                </>
              )}
            </div>
            <div className="wadd">
              <input
                placeholder={flash ?? "+ Ajouter"}
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") { setAdding(""); (e.target as HTMLInputElement).blur(); } }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function WRow({ item, showTime }: { item: Item; showTime?: boolean }) {
  const { lingering } = useCharles();
  const [leave, setLeave] = useState(false);
  const lingers = !!item.doneAt && lingering.has(item.id);
  useEffect(() => {
    if (!lingers) return setLeave(false);
    const t = setTimeout(() => setLeave(true), 1500);
    return () => clearTimeout(t);
  }, [lingers]);
  const isEvent = item.kind === "event";
  return (
    <div className={`wrow ${item.doneAt ? "done" : ""} ${leave ? "leaving" : ""}`}>
      {isEvent ? <span className="bar"><i /></span> : (
        <button className={`check p${item.priority} ${item.doneAt ? "on" : ""}`} onClick={() => (item.doneAt ? uncompleteItem(item.id) : completeItem(item.id))}>
          <CheckSvg />
        </button>
      )}
      <span className="tt" style={item.priority === 2 ? { fontWeight: 600 } : undefined}>{item.title}</span>
      {(showTime || item.time) && item.time && <span className="tm">{item.time}</span>}
    </div>
  );
}
