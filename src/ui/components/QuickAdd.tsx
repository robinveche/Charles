import { useMemo, useRef, useState } from "react";
import { CalendarDays, Clock, Flag, Plus, Repeat, CornerDownLeft, Timer, X } from "lucide-react";
import type { ItemDraft, Priority } from "../../core/types";
import { DURATIONS, fmtDuration, PLANNING_CATEGORY } from "../../core/types";
import { parseQuickInput, type ParseResult } from "../../core/parser";
import { addDaysISO, minutesOf, relativeDay, toDateTime, toISODate } from "../../core/dates";
import { describeRule } from "../../core/recurrence";
import { createItem, categoryOf, getState, showToast, useCharles } from "../../data/store";
import { CatIcon } from "./Icon";
import { summarize } from "../format";
import { openEditor } from "../uiState";

/** Ce que l'utilisateur a choisi à la souris : prioritaire sur ce que le parseur a deviné. */
export interface Choice {
  categoryId?: string;
  date?: string;
  time?: string;
  priority?: Priority;
  durationMin?: number;
  projectId?: string; // "none" = aucun projet
}

export function useParsed(text: string, context?: Partial<ItemDraft>, choice: Choice = {}): ParseResult | null {
  const { categories, settings, projects } = useCharles();
  return useMemo(() => {
    if (!text.trim()) return null;
    const r = parseQuickInput(text, { categories, projects, defaultReminders: settings.defaultReminders });
    const d = r.draft;
    // contexte (ex. clic sur un jour du calendrier) : seulement si la saisie ne précise rien
    if (context?.date && !r.detected.date) d.date = context.date;
    if (context?.time && !r.detected.time) d.time = context.time;
    // choix explicites
    if (choice.categoryId) {
      d.categoryId = choice.categoryId;
      d.kind = categoryOf(choice.categoryId).kind;
    }
    if (choice.date) d.date = choice.date;
    if (choice.time) {
      d.time = choice.time;
      if (!d.date) {
        const now = new Date();
        d.date = minutesOf(choice.time) > now.getHours() * 60 + now.getMinutes() ? toISODate(now) : addDaysISO(toISODate(now), 1);
      }
    }
    if (choice.priority !== undefined) d.priority = choice.priority;
    if (choice.durationMin !== undefined) d.durationMin = choice.durationMin;
    if (choice.projectId) d.projectId = choice.projectId === "none" ? null : choice.projectId;
    // rappels cohérents avec l'heure finale
    if (d.time && d.date) {
      const due = toDateTime(d.date, d.time).getTime();
      const rem = settings.defaultReminders.filter((m) => due - m * 60000 > Date.now());
      d.reminders = rem.length ? rem : [0];
    } else d.reminders = [];
    return r;
  }, [text, categories, projects, settings.defaultReminders, context?.date, context?.time, choice.categoryId, choice.date, choice.time, choice.priority, choice.durationMin, choice.projectId]);
}

/** Pastilles « ce que Charles a compris » (lecture seule). */
export function DraftChips({ r }: { r: ParseResult | null }) {
  if (!r) return null;
  const d = r.draft;
  const cat = categoryOf(d.categoryId);
  return (
    <>
      {d.recurrence ? (
        <span className="chip accent"><Repeat size={12} />{describeRule(d.recurrence)}</span>
      ) : d.date ? (
        <span className="chip accent"><CalendarDays size={12} />{relativeDay(d.date)}</span>
      ) : null}
      {d.time && <span className="chip accent num"><Clock size={12} />{d.time}</span>}
      <span className={`chip ${r.detected.category ? "accent" : ""}`}><CatIcon name={cat.icon} size={12} />{cat.name}</span>
      {d.priority > 0 && <span className={`chip ${d.priority === 2 ? "urgent" : "accent"}`}><Flag size={12} />{d.priority === 2 ? "Urgent" : "Important"}</span>}
    </>
  );
}

/** Barre cliquable : type, jour, heure, priorité. Ne vole pas le focus de la saisie. */
export function TypeBar({ r, choice, setChoice, refocus, compact }: {
  compact?: boolean; // sans sélecteurs date/heure natifs (fenêtre command bar)
  r: ParseResult | null;
  choice: Choice;
  setChoice: (c: Choice) => void;
  refocus?: () => void;
}) {
  const { categories, projects } = useCharles();
  const [durOpen, setDurOpen] = useState(false);
  const today = toISODate(new Date());
  const tomorrow = addDaysISO(today, 1);
  const d = r?.draft;
  const catId = d?.categoryId ?? choice.categoryId ?? "task";
  const date = d?.date ?? choice.date ?? null;
  const time = d?.time ?? choice.time ?? null;
  const prio = (d?.priority ?? choice.priority ?? 0) as Priority;
  const dur = d?.durationMin ?? choice.durationMin ?? 0;
  const projId = d?.projectId ?? (choice.projectId && choice.projectId !== "none" ? choice.projectId : null);
  const keep = (e: React.MouseEvent) => e.preventDefault(); // garde le curseur dans la saisie
  const pick = (c: Choice) => { setChoice({ ...choice, ...c }); refocus?.(); };
  const openPicker = (e: React.MouseEvent<HTMLLabelElement>) => {
    const input = e.currentTarget.querySelector("input") as (HTMLInputElement & { showPicker?: () => void }) | null;
    try { input?.showPicker?.(); } catch { input?.focus(); }
  };

  return (
    <div className="typebar">
      <div className="typecats">
        {categories.filter((c) => c.id !== PLANNING_CATEGORY).map((c) => (
          <button key={c.id} type="button" className={`tcat ${catId === c.id ? "on" : ""}`} title={c.name}
            onMouseDown={keep}
            onClick={() => pick({ categoryId: choice.categoryId === c.id ? undefined : c.id })}>
            <CatIcon name={c.icon} size={13} color={catId === c.id ? undefined : c.color} />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
      <div className="typewhen">
        <button type="button" className={`tcat ${date === today ? "on" : ""}`} onMouseDown={keep}
          onClick={() => pick({ date: choice.date === today ? undefined : today })}>Aujourd'hui</button>
        <button type="button" className={`tcat ${date === tomorrow ? "on" : ""}`} onMouseDown={keep}
          onClick={() => pick({ date: choice.date === tomorrow ? undefined : tomorrow })}>Demain</button>
        {!compact && <label className={`tcat picker ${date && date !== today && date !== tomorrow ? "on" : ""}`} title="Choisir une date" onMouseDown={keep} onClick={openPicker}>
          <CalendarDays size={13} />
          <span>{date && date !== today && date !== tomorrow ? relativeDay(date) : "Date"}</span>
          <input type="date" value={choice.date ?? ""} onChange={(e) => pick({ date: e.target.value || undefined })} />
        </label>}
        {!compact && <label className={`tcat picker ${time ? "on" : ""}`} title="Heure" onMouseDown={keep} onClick={openPicker}>
          <Clock size={13} />
          <span className="num">{time ?? "Heure"}</span>
          <input type="time" value={choice.time ?? ""} onChange={(e) => pick({ time: e.target.value || undefined })} />
        </label>}
        <button type="button" className={`tcat ${prio === 2 ? "urgent" : prio === 1 ? "on" : ""}`} title="Priorité : normale → importante → urgente"
          onMouseDown={keep} onClick={() => pick({ priority: ((prio + 1) % 3) as Priority })}>
          <Flag size={13} /><span>{["Normale", "Importante", "Urgente"][prio]}</span>
        </button>
        <button type="button" className={`tcat ${dur ? "on" : ""}`} title="Durée" onMouseDown={keep} onClick={() => setDurOpen(!durOpen)}>
          <Timer size={13} />
          <span className="num">{dur ? fmtDuration(dur) : "Durée"}</span>
        </button>
        {(choice.categoryId || choice.date || choice.time || choice.priority !== undefined || choice.durationMin !== undefined || choice.projectId) && (
          <button type="button" className="tcat ghost" title="Effacer mes choix" onMouseDown={keep} onClick={() => { setChoice({}); refocus?.(); }}>
            <X size={13} />
          </button>
        )}
      </div>
      {durOpen && (
        <div className="durpick">
          {[0, ...DURATIONS].map((m) => (
            <button key={m} type="button" className={`tcat ${dur === m ? "on" : ""}`} onMouseDown={keep}
              onClick={() => { pick({ durationMin: m }); setDurOpen(false); }}>{m ? fmtDuration(m) : "Aucune"}</button>
          ))}
        </div>
      )}
      {projects.length > 0 && (
        <div className="typeproj">
          {projects.map((p) => (
            <button key={p.id} type="button" className={`tproj ${projId === p.id ? "on" : ""}`} onMouseDown={keep}
              onClick={() => pick({ projectId: projId === p.id ? "none" : p.id })}>
              <i style={{ background: p.color }} />{p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  placeholder?: string;
  override?: Partial<ItemDraft>;
  autoFocus?: boolean;
  onCreated?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function QuickAdd({ placeholder = "Ajouter quelque chose…", override, autoFocus, onCreated, inputRef }: Props) {
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<Choice>({});
  const local = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? local;
  const parsed = useParsed(text, override, choice);
  const hasChoice = Object.values(choice).some((v) => v !== undefined);

  const submit = async () => {
    if (!parsed) return;
    const item = await createItem(parsed.draft);
    showToast(item.title, { detail: summarize(item), ms: 3000 });
    setText("");
    setChoice({});
    onCreated?.();
  };

  return (
    <div className={`quick ${text || hasChoice ? "open" : ""}`}>
      <Plus size={18} className="quick-plus" />
      <input
        ref={ref}
        className="quick-input"
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); submit(); }
          else if (e.key === "Enter" && (e.shiftKey || e.ctrlKey) && parsed) {
            // Maj+Entrée : ouvrir le détail pour ajuster avant de créer
            e.preventDefault(); openEditor(undefined, parsed.draft); setText(""); setChoice({});
          } else if (e.key === "Escape") { setText(""); setChoice({}); (e.target as HTMLInputElement).blur(); }
        }}
        spellCheck={false}
      />
      <div className="quick-drop">
        <TypeBar r={parsed} choice={choice} setChoice={setChoice} refocus={() => ref.current?.focus()} />
        <div className="chips-hint" style={{ marginTop: 8, textAlign: "right" }}>
          <CornerDownLeft size={11} style={{ verticalAlign: -1 }} /> {parsed ? "créer · Maj+Entrée détails" : "tapez, choisissez, Entrée"}
        </div>
      </div>
    </div>
  );
}

/** Cycle de catégorie au clavier (Tab dans la command bar). */
export function nextCategory(current: string | undefined, dir = 1): string {
  const cats = getState().categories.filter((c) => c.id !== PLANNING_CATEGORY);
  const i = cats.findIndex((c) => c.id === current);
  return cats[(i + dir + cats.length) % cats.length].id;
}
