import { useEffect, useRef, useState } from "react";
import { AlarmClock, Clock, MoreHorizontal, Pencil, Repeat, RotateCcw } from "lucide-react";
import type { Item } from "../../core/types";
import { fmtDuration } from "../../core/types";
import { relativeDay } from "../../core/dates";
import { isProjection } from "../../core/selectors";
import { addNote, projectOf, categoryOf, completeItem, snoozeItem, uncompleteItem, useCharles } from "../../data/store";
import { openExternal } from "../../platform";
import { CatIcon, CheckSvg } from "./Icon";
import { openEditor, openMenu } from "../uiState";
import { overdueLabel } from "../format";

export function Check({ item, small }: { item: Item; small?: boolean }) {
  const done = !!item.doneAt;
  return (
    <button
      className={`check p${item.priority} ${done ? "on" : ""}`}
      style={small ? { width: 15, height: 15 } : undefined}
      aria-label={done ? "Marquer comme non terminé" : "Terminer"}
      onClick={(e) => {
        e.stopPropagation();
        if (isProjection(item.id)) return;
        done ? uncompleteItem(item.id) : completeItem(item.id);
      }}
    >
      <CheckSvg />
    </button>
  );
}

type Variant = "default" | "overdue" | "upcoming" | "history";

export function ItemRow({ item, variant = "default", showDate }: { item: Item; variant?: Variant; showDate?: boolean }) {
  const { lingering } = useCharles();
  const [leavingNow, setLeavingNow] = useState(false);
  const lingers = !!item.doneAt && lingering.has(item.id) && variant !== "history";
  useEffect(() => {
    if (!lingers) { setLeavingNow(false); return; }
    const t = setTimeout(() => setLeavingNow(true), 1700); // visible coché ~1,7 s puis se replie
    return () => clearTimeout(t);
  }, [lingers]);
  const cat = categoryOf(item.categoryId);
  const isEvent = item.kind === "event";
  const done = !!item.doneAt;
  const leaving = lingers && leavingNow;
  const proj = isProjection(item.id);

  const subParts: React.ReactNode[] = [];
  if (variant === "overdue") subParts.push(<span className="warn" key="o">{overdueLabel(item)}</span>);
  else if (showDate && item.date) subParts.push(<span key="d">{relativeDay(item.date)}</span>);
  subParts.push(<span key="c" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><CatIcon name={cat.icon} size={11} />{cat.name}</span>);
  if (item.durationMin > 0) subParts.push(<span key="du">{fmtDuration(item.durationMin)}</span>);
  const project = projectOf(item.projectId);
  if (project) subParts.push(<span key="p" style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><i style={{ width: 6, height: 6, borderRadius: 6, background: project.color, display: "inline-block" }} />{project.name}</span>);
  if (item.recurrence || item.seriesId) subParts.push(<Repeat key="r" size={11} />);
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`row ${open ? "open" : ""} ${isEvent ? "event" : ""} ${done ? "done" : ""} ${leaving ? "leaving" : ""} p${item.priority} ${proj ? "projection" : ""}`}
      onClick={(e) => { if (!(e.target as HTMLElement).closest("a,textarea,button")) setOpen(!open); }}
      onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("textarea")) { setOpen(false); openEditor(item); } }}
      onContextMenu={(e) => { e.preventDefault(); openMenu(e, item.id, "item"); }}
    >
      {isEvent && variant !== "history" ? <span className="bar" /> : <Check item={item} />}
      <div style={{ minWidth: 0 }}>
        <div className="title">{item.title}</div>
        <div className="sub">
          {subParts.map((p, i) => (
            <span key={i} style={{ display: "contents" }}>
              {i > 0 && <span className="sep">·</span>}
              {p}
            </span>
          ))}
        </div>
        {item.notes && !open && <div className="row-notes"><RichText text={item.notes} /></div>}
        {open && <NotesPanel item={item} onClose={() => setOpen(false)} />}
      </div>
      <div className="side">
        {variant === "history" ? (
          <button className="icon-btn" title="Restaurer" onClick={(e) => { e.stopPropagation(); uncompleteItem(item.id); }}>
            <RotateCcw size={14} />
          </button>
        ) : (
          <>
            {!done && !proj && (
              <div className="actions">
                <button className="icon-btn" title="Reporter" onClick={(e) => { e.stopPropagation(); openMenu(e, item.id, "snooze"); }}>
                  <AlarmClock size={15} />
                </button>
                <button className="icon-btn" title="Plus" onClick={(e) => { e.stopPropagation(); openMenu(e, item.id, "item"); }}>
                  <MoreHorizontal size={15} />
                </button>
              </div>
            )}
            {item.priority > 0 && !done && <span className={`prio p${item.priority}`} title={item.priority === 2 ? "Urgente" : "Importante"} />}
            {item.time && variant !== "overdue" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6 }}>
                {item.reminders.length > 0 && !done && <Clock size={11} style={{ opacity: 0.6 }} />}
                {item.time}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Ligne « en retard » + choix rapides de replanification. */
export function OverdueRow({ item }: { item: Item }) {
  const [busy, setBusy] = useState(false);
  const act = async (f: () => Promise<void>) => { if (busy) return; setBusy(true); await f(); };
  return (
    <div>
      <ItemRow item={item} variant="overdue" />
      {!item.doneAt && (
        <div className="overdue-actions">
          <button className="pill primary" onClick={() => act(() => snoozeItem(item.id, "now"))}>Faire maintenant</button>
          <button className="pill" onClick={() => act(() => snoozeItem(item.id, "30min"))}>+30 min</button>
          <button className="pill" onClick={() => act(() => snoozeItem(item.id, "afternoon"))}>Cet après-midi</button>
          <button className="pill" onClick={() => act(() => snoozeItem(item.id, "tomorrow"))}>Demain</button>
          <button className="pill" onClick={() => openEditor(item)}>Choisir une date</button>
          <button className="pill" onClick={() => act(() => completeItem(item.id))}>Terminé</button>
        </div>
      )}
    </div>
  );
}

/** Annotations directement sous le titre : éditables sans ouvrir la fiche. */
function NotesPanel({ item, onClose }: { item: Item; onClose: () => void }) {
  const [text, setText] = useState(item.notes);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = ref.current;
    if (t) { t.style.height = "auto"; t.style.height = `${Math.max(56, t.scrollHeight)}px`; }
  }, [text]);
  useEffect(() => { if (!item.notes) ref.current?.focus(); }, []);
  const save = () => { if (text !== item.notes) addNote(item.id.split("@")[0], text.trim()); };
  return (
    <div className="notes-panel" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={ref}
        className="notes-input"
        value={text}
        placeholder="Infos utiles : adresse, numéro, lien visio, points à aborder…"
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); setText(item.notes); onClose(); }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { save(); onClose(); }
        }}
      />
      {text && <div className="row-notes full"><RichText text={text} /></div>}
      <div className="notes-actions">
        <span className="hint">Enregistré automatiquement · Ctrl+Entrée pour fermer</span>
        <button className="pill" onClick={() => { save(); openEditor(item); }}><Pencil size={12} /> Tout modifier</button>
      </div>
    </div>
  );
}

const LINK_RX = /(https?:\/\/[^\s]+|www\.[^\s]+|[\w.+-]+@[\w-]+\.[\w.-]+|(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4})/g;

/** Texte avec liens, e-mails et numéros cliquables. */
export function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const rx = new RegExp(LINK_RX.source, "g");
  while ((m = rx.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const v = m[0].replace(/[).,;]+$/, "");
    const href = v.includes("@") && !v.startsWith("http") ? `mailto:${v}` : /^[+\d]/.test(v) ? `tel:${v.replace(/[\s.-]/g, "")}` : v.startsWith("http") ? v : `https://${v}`;
    parts.push(<a key={m.index} href={href} onClick={(e) => { e.preventDefault(); e.stopPropagation(); openExternal(href); }}>{v}</a>);
    last = m.index + v.length;
    rx.lastIndex = last;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
