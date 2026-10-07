import { useEffect, useRef } from "react";
import { CalendarDays, LayoutDashboard, ListTodo, Minus, Search, Settings as SettingsIcon, Square, Sun, X } from "lucide-react";
import { buildToday } from "../core/selectors";
import { createItem, getKV, getState, runDailyBackup, setKV, showToast, updateSettings, useCharles } from "../data/store";
import { toISODate } from "../core/dates";
import { startScheduler } from "../data/scheduler";
import { cloudConfigured, startSync, useSync } from "../data/cloud";
import { LoginScreen } from "./components/Account";
import { applyWidget, checkForUpdate, isTauri, onEvent, setAutostart, setGlobalShortcuts } from "../platform";
import { BrandMark } from "./components/Icon";
import { ItemEditor } from "./components/ItemEditor";
import { ContextMenu, SearchPalette, ToastView } from "./components/Overlays";
import { matches, displayAccel } from "./shortcuts";
import { getUI, openEditor, setUI, useUI, type Page } from "./uiState";
import { Today, useNow } from "./views/Today";
import { Tasks } from "./views/Tasks";
import { CalendarView } from "./views/Calendar";
import { BilanView } from "./views/Bilan";
import { PlanningModal } from "./components/PlanningModal";
import { ReviewModal } from "./components/ReviewModal";
import { SettingsView } from "./views/Settings";

const NAV: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "today", label: "Aujourd'hui", icon: <Sun size={16} strokeWidth={1.8} /> },
  { id: "calendar", label: "Calendrier", icon: <CalendarDays size={16} strokeWidth={1.8} /> },
  { id: "tasks", label: "Tâches", icon: <ListTodo size={16} strokeWidth={1.8} /> },
  { id: "history", label: "Bilan", icon: <LayoutDashboard size={16} strokeWidth={1.8} /> },
];

export function App() {
  const sync = useSync();
  // Version iPhone / navigateur : il faut être connecté pour retrouver ses données
  if (!isTauri && cloudConfigured && sync.ready && !sync.email) return <><LoginScreen /><SyncStarter /></>;
  return <MainApp />;
}

function SyncStarter() {
  useEffect(() => { startSync(); }, []);
  return null;
}

function MainApp() {
  const { items, settings, lingering } = useCharles();
  const { page } = useUI();
  const now = useNow(60_000);
  const quickRef = useRef<HTMLInputElement>(null);
  const counts = buildToday(items, now, lingering).counts;

  // Démarrage de la fenêtre principale : planificateur, raccourcis globaux, widget, autostart, sauvegarde.
  useEffect(() => {
    startScheduler();
    startSync();
    const s = getState().settings;
    setGlobalShortcuts(s.shortcuts);
    // 1.3 : le widget grandit une fois pour toutes (ensuite on garde la taille choisie à la souris)
    getKV("widgetSize13").then((done) => {
      applyWidget(s.widget, !done);
      if (!done) setKV("widgetSize13", "1");
    });
    if (!s.onboarded) {
      setAutostart(s.autostart);
      updateSettings({ onboarded: true }, false);
      if (isTauri && getState().items.length === 0) {
        createItem({
          title: "Découvrir Charles", kind: "task", categoryId: "task", priority: 0, date: toISODate(new Date()), time: null,
          durationMin: 60, reminders: [], recurrence: null,
          notes: "Ctrl+Espace n'importe où → « Appeler Thomas demain 14h » → Entrée.\nCtrl+K pour chercher, Ctrl+N pour une nouvelle tâche.\nCochez cette tâche quand c'est fait.",
        });
      }
    }
    runDailyBackup();
    const un1 = onEvent<string>("charles://navigate", (p) => {
      if (p === "new") openEditor();
      else if (p === "review") setUI({ review: true });
      else if (p === "search") setUI({ search: true });
      else if (p) setUI({ page: p as Page });
    });
    const un2 = onEvent<boolean>("charles://widget-visible", (v) => {
      const w = getState().settings.widget;
      if (w.visible !== v) updateSettings({ widget: { ...w, visible: v } });
    });
    const backup = setInterval(runDailyBackup, 3600_000);
    // Mises à jour : vérifiées 15 s après le lancement puis toutes les 6 h
    const upd = () => checkForUpdate().then((u) => {
      if (u) showToast(`Charles ${u.version} est disponible`, {
        detail: "Installation en 20 secondes, vos données sont conservées.",
        actions: [{ label: "Mettre à jour", primary: true, run: () => { showToast("Mise à jour en cours…", { ms: 60000 }); u.install(); } }],
        ms: 60_000,
      });
    });
    const t0 = setTimeout(upd, 15_000);
    const t1 = setInterval(upd, 6 * 3600_000);
    return () => { un1(); un2(); clearInterval(backup); clearTimeout(t0); clearInterval(t1); };
  }, []);

  // Raccourcis internes
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const sc = getState().settings.shortcuts;
      if (matches(e, sc.search)) { e.preventDefault(); setUI({ search: !getUI().search, menu: null }); }
      else if (matches(e, sc.newItem)) { e.preventDefault(); openEditor(); }
      else if (e.ctrlKey && /^Digit[1-4]$/.test(e.code)) { e.preventDefault(); setUI({ page: NAV[+e.code.slice(5) - 1].id }); }
      else if (e.ctrlKey && e.code === "Comma") { e.preventDefault(); setUI({ page: "settings" }); }
      else if (e.key === "/" && !(e.target as HTMLElement).closest("input,textarea") && !getUI().editor) {
        e.preventDefault(); setUI({ page: "today" }); setTimeout(() => quickRef.current?.focus(), 30);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  return (
    <div className="app">
      {isTauri && <TitleBar />}
      <aside className="sidebar">
        <div className="brand"><BrandMark /><span className="brand-name">CHARLES</span></div>
        <button className="sidebar-search" onClick={() => setUI({ search: true })}>
          <Search size={14} /> Rechercher <span className="kbd">{displayAccel(settings.shortcuts.search).replace(/ /g, "")}</span>
        </button>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setUI({ page: n.id })}>
              {n.icon} {n.label}
              {n.id === "today" && (counts.overdue > 0
                ? <span className="count alert" title={`${counts.overdue} en retard`}>{counts.today ? `${counts.today} · ` : ""}{counts.overdue} ⚠</span>
                : counts.today > 0 && <span className="count">{counts.today}</span>)}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <div className="sidebar-foot">
          <button className={`icon-btn ${page === "settings" ? "on" : ""}`} title="Paramètres (Ctrl+,)" onClick={() => setUI({ page: "settings" })}>
            <SettingsIcon size={16} />
          </button>
          <span className="hint">{displayAccel(settings.shortcuts.quickAdd)} · ajout rapide</span>
        </div>
      </aside>
      <main className="main">
        {page === "today" && <Today quickRef={quickRef} />}
        {page === "calendar" && <CalendarView />}
        {page === "tasks" && <Tasks />}
        {page === "history" && <BilanView />}
        {page === "settings" && <SettingsView />}
      </main>
      <ItemEditor />
      <PlanningModal />
      <ReviewModal />
      <SearchPalette />
      <ContextMenu />
      <ToastView />
    </div>
  );
}

function TitleBar() {
  const win = async () => (await import("@tauri-apps/api/window")).getCurrentWindow();
  return (
    <div className="titlebar">
      <div className="drag" data-tauri-drag-region />
      <button className="winbtn" onClick={async () => (await win()).minimize()} aria-label="Réduire"><Minus size={15} /></button>
      <button className="winbtn" onClick={async () => (await win()).toggleMaximize()} aria-label="Agrandir"><Square size={12} /></button>
      <button className="winbtn close" onClick={async () => (await win()).hide()} aria-label="Fermer (Charles reste dans la barre système)"><X size={16} /></button>
    </div>
  );
}
