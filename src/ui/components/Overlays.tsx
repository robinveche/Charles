import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock, ArrowRight, CalendarDays, Check, CircleCheck, History, LayoutPanelTop, ListTodo, Moon, Pencil,
  Plus, Reply, Search, Settings as SettingsIcon, Sun, Trash2, Undo2,
} from "lucide-react";
import { relativeDay, shortDate } from "../../core/dates";
import { search } from "../../core/selectors";
import {
  categoryOf, completeItem, createFollowup, deleteItem, dismissToast, getState, snoozeItem, snoozeTarget, uncompleteItem,
  updateSettings, useCharles, type SnoozeOption,
} from "../../data/store";
import { applyWidget } from "../../platform";
import { CatIcon } from "./Icon";
import { openEditor, setUI, useUI, type Page } from "../uiState";

export function ToastView() {
  const { toast } = useCharles();
  if (!toast) return null;
  return (
    <div className="toast" key={toast.id} role="status">
      <span className="ok"><CircleCheck size={18} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="tt">{toast.message}</div>
        {toast.detail && <div className="td">{toast.detail}</div>}
      </div>
      {toast.actions?.map((a) => (
        <button key={a.label} className={`btn ${a.primary ? "accent" : ""}`} onClick={a.run}>{a.label}</button>
      ))}
      {toast.undo && (
        <button className="btn" onClick={toast.undo}><Undo2 size={13} /> Annuler</button>
      )}
      {!toast.undo && <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={dismissToast}>×</button>}
    </div>
  );
}

const SNOOZES: [SnoozeOption, string][] = [
  ["now", "Faire maintenant"],
  ["30min", "Dans 30 minutes"],
  ["afternoon", "Cet après-midi"],
  ["tomorrow", "Demain"],
  ["nextweek", "Semaine prochaine"],
];

export function ContextMenu() {
  const { menu } = useUI();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setUI({ menu: null }); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setUI({ menu: null });
    setTimeout(() => document.addEventListener("mousedown", close), 0);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [menu]);
  useEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.min(menu.x, innerWidth - r.width - 8), top: Math.min(menu.y, innerHeight - r.height - 8) });
  }, [menu]);
  if (!menu) return null;
  const item = getState().items.find((i) => i.id === menu.itemId.split("@")[0]);
  if (!item) return null;
  const close = () => setUI({ menu: null });
  const fmt = (o: SnoozeOption) => {
    const t = snoozeTarget(o, item);
    return `${relativeDay(t.date).replace("Aujourd'hui", "Auj.")}${t.time ? " " + t.time : ""}`;
  };
  return (
    <div className="menu" ref={ref} style={pos ?? { left: menu.x, top: menu.y, visibility: "hidden" }}>
      {menu.kind === "item" && (
        <>
          <button onClick={() => { close(); openEditor(item); }}><Pencil size={14} /> Modifier</button>
          {item.doneAt ? (
            <button onClick={() => { close(); uncompleteItem(item.id); }}><Undo2 size={14} /> Marquer non terminé</button>
          ) : (
            <button onClick={() => { close(); completeItem(item.id); }}><Check size={14} /> Terminer</button>
          )}
          <hr />
        </>
      )}
      {!item.doneAt && SNOOZES.map(([o, l]) => (
        <button key={o} onClick={() => { close(); snoozeItem(item.id, o); }}>
          <AlarmClock size={14} /> {l} <span className="m">{fmt(o)}</span>
        </button>
      ))}
      {!item.doneAt && <button onClick={() => { close(); openEditor(item); }}><CalendarDays size={14} /> Choisir une date…</button>}
      <hr />
      <button onClick={() => { close(); createFollowup(item); }}><Reply size={14} /> Planifier une relance <span className="m">J+{getState().settings.followupDays}</span></button>
      {menu.kind === "item" && (
        <>
          <hr />
          <button onClick={() => { close(); deleteItem(item.id); }} style={{ color: "var(--urgent)" }}><Trash2 size={14} /> Supprimer</button>
        </>
      )}
    </div>
  );
}

interface Cmd { id: string; label: string; icon: React.ReactNode; hint?: string; run: () => void }

export function SearchPalette() {
  const { search: open } = useUI();
  if (!open) return null;
  return <PaletteInner />;
}

function PaletteInner() {
  const { items, settings } = useCharles();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const close = () => setUI({ search: false });
  const go = (page: Page) => () => { setUI({ page, search: false }); };

  const commands: Cmd[] = useMemo(() => [
    { id: "new", label: "Nouvelle tâche", icon: <Plus size={15} />, hint: settings.shortcuts.newItem.replace("Control", "Ctrl"), run: () => openEditor() },
    { id: "today", label: "Aller à Aujourd'hui", icon: <ArrowRight size={15} />, run: go("today") },
    { id: "cal", label: "Aller au Calendrier", icon: <CalendarDays size={15} />, run: go("calendar") },
    { id: "tasks", label: "Aller aux Tâches", icon: <ListTodo size={15} />, run: go("tasks") },
    { id: "hist", label: "Aller au Bilan / historique", icon: <History size={15} />, run: go("history") },
    { id: "review", label: "Revue du soir", icon: <Moon size={15} />, run: () => setUI({ search: false, review: true }) },
    { id: "plan", label: "Journée type (planning)", icon: <CalendarDays size={15} />, run: () => setUI({ search: false, planning: true }) },
    { id: "theme", label: "Basculer clair / sombre", icon: document.documentElement.dataset.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />, run: () => {
      updateSettings({ theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark" }); close();
    } },
    { id: "widget", label: settings.widget.visible ? "Masquer le widget" : "Afficher le widget", icon: <LayoutPanelTop size={15} />, run: () => {
      const w = { ...settings.widget, visible: !settings.widget.visible };
      updateSettings({ widget: w }); applyWidget(w, false); close();
    } },
    { id: "settings", label: "Paramètres", icon: <SettingsIcon size={15} />, run: go("settings") },
  ], [settings]);

  const results = useMemo(() => search(items, q, (id) => categoryOf(id).name), [items, q]);
  const fq = q.toLowerCase();
  const cmds = q ? commands.filter((c) => c.label.toLowerCase().includes(fq)) : commands;
  const all = [...results.map((r) => ({ kind: "item" as const, r })), ...cmds.map((c) => ({ kind: "cmd" as const, c }))];
  useEffect(() => setSel(0), [q]);
  const run = (i: number) => {
    const x = all[i];
    if (!x) return;
    if (x.kind === "cmd") x.c.run();
    else openEditor(x.r);
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette"
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); close(); }
          else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(all.length - 1, s + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); run(sel); }
        }}>
        <div className="palette-head">
          <Search size={17} />
          <input autoFocus className="palette-input" placeholder="Rechercher une tâche, un nom, une commande…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="palette-list">
          {results.length > 0 && <div className="palette-group">Éléments</div>}
          {results.map((r, i) => {
            const cat = categoryOf(r.categoryId);
            return (
              <div key={r.id} className={`palette-item ${sel === i ? "sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => run(i)}>
                {r.doneAt ? <Check size={15} color="var(--accent)" /> : <CatIcon name={cat.icon} size={15} />}
                <span className={`t ${r.doneAt ? "done" : ""}`}>{r.title}</span>
                <span className="m">{cat.name}{r.date ? ` · ${shortDate(r.date)}` : ""}{r.time ? ` ${r.time}` : ""}</span>
              </div>
            );
          })}
          {q && results.length === 0 && cmds.length === 0 && <div className="empty" style={{ padding: "14px 12px" }}>Aucun résultat pour « {q} »</div>}
          {cmds.length > 0 && <div className="palette-group">Commandes</div>}
          {cmds.map((c, j) => {
            const i = results.length + j;
            return (
              <div key={c.id} className={`palette-item ${sel === i ? "sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => run(i)}>
                {c.icon}<span className="t">{c.label}</span>{c.hint && <span className="kbd">{c.hint}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
