import { useEffect, useState } from "react";
import { FolderOpen, Monitor, Moon, Plus, Sun, Trash2 } from "lucide-react";
import type { Settings, Shortcuts, WidgetLayer, WidgetSize } from "../../core/types";
import { fmtReminder } from "../../core/dates";
import { deleteCategory, deleteProject, saveProject, saveCategory, showToast, updateSettings, useCharles } from "../../data/store";
import { appVersion, applyWidget, checkForUpdate, isTauri, openBackupsFolder, setAutostart, setGlobalShortcuts } from "../../platform";
import { CATEGORY_ICONS, CatIcon } from "../components/Icon";
import { displayAccel, eventToAccel } from "../shortcuts";
import { setUI } from "../uiState";
import { SyncSettings } from "../components/Account";

const COLORS = ["#8a8f98", "#c9a36a", "#d08770", "#7fb59a", "#7f9cc7", "#b48fc7", "#c7a07f", "#9aa5a0"];

export function SettingsView() {
  const { settings } = useCharles();
  const setWidget = (p: Partial<Settings["widget"]>, resize = false) => {
    const w = { ...settings.widget, ...p };
    updateSettings({ widget: w });
    applyWidget(w, resize);
  };

  return (
    <div className="page">
      <h1 className="page-title">Paramètres</h1>

      <SyncSettings />

      <div className="set-group">
        <span className="eyebrow">Apparence</span>
        <div className="set-row">
          <div className="l"><b>Thème</b><small>Le mode système suit Windows.</small></div>
          <div className="seg">
            <button className={settings.theme === "system" ? "on" : ""} onClick={() => updateSettings({ theme: "system" })}><Monitor size={13} /> Système</button>
            <button className={settings.theme === "light" ? "on" : ""} onClick={() => updateSettings({ theme: "light" })}><Sun size={13} /> Clair</button>
            <button className={settings.theme === "dark" ? "on" : ""} onClick={() => updateSettings({ theme: "dark" })}><Moon size={13} /> Sombre</button>
          </div>
        </div>
      </div>

      {isTauri && <div className="set-group">
        <span className="eyebrow">Widget de bureau</span>
        <Row label="Afficher le widget" hint="Glissez l'en-tête pour le déplacer, tirez un bord pour le redimensionner.">
          <Toggle on={settings.widget.visible} onChange={(v) => setWidget({ visible: v })} />
        </Row>
        <Row label="Taille" hint="Mini : prochain + compteur · Standard : tâches du jour · Large : journée complète.">
          <div className="seg">
            {(["mini", "standard", "large"] as WidgetSize[]).map((s) => (
              <button key={s} className={settings.widget.size === s ? "on" : ""} onClick={() => setWidget({ size: s }, true)}>
                {{ mini: "Mini", standard: "Standard", large: "Large" }[s]}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Position" hint="« Sur le bureau » le garde derrière vos fenêtres, comme un widget.">
          <div className="seg">
            {(["desktop", "normal", "top"] as WidgetLayer[]).map((l) => (
              <button key={l} className={settings.widget.layer === l ? "on" : ""} onClick={() => setWidget({ layer: l })}>
                {{ desktop: "Sur le bureau", normal: "Normal", top: "Toujours au-dessus" }[l]}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Opacité">
          <input type="range" min={35} max={100} value={Math.round(settings.widget.opacity * 100)}
            onChange={(e) => setWidget({ opacity: +e.target.value / 100 })} style={{ width: 160, accentColor: "var(--accent)" }} />
          <span className="hint num" style={{ width: 36 }}>{Math.round(settings.widget.opacity * 100)} %</span>
        </Row>
        <Row label="Épingler" hint="Verrouille la position du widget.">
          <Toggle on={settings.widget.locked} onChange={(v) => setWidget({ locked: v })} />
        </Row>
      </div>}

      <div className="set-group">
        <span className="eyebrow">Rappels</span>
        <Row label="Rappels par défaut" hint="Appliqués aux éléments avec une heure.">
          <div className="togglechips" style={{ justifyContent: "flex-end" }}>
            {[0, 5, 15, 30, 60, 1440].map((m) => {
              const on = settings.defaultReminders.includes(m);
              return (
                <button key={m} className={`tchip ${on ? "on" : ""}`} onClick={() => updateSettings({
                  defaultReminders: on ? settings.defaultReminders.filter((x) => x !== m) : [...settings.defaultReminders, m].sort((a, b) => a - b),
                })}>{fmtReminder(m)}</button>
              );
            })}
          </div>
        </Row>
        <Row label="Relancer les tâches en retard" hint="Nouvelle notification 1 h après l'échéance si ce n'est pas fait.">
          <Toggle on={settings.overdueNudge} onChange={(v) => updateSettings({ overdueNudge: v })} />
        </Row>
        <Row label="Revue du soir" hint="Rappel + bandeau pour trier ce qui reste et préparer demain.">
          <input type="time" className="input" style={{ width: 110 }} value={settings.eveningReview ?? ""} disabled={!settings.eveningReview}
            onChange={(e) => updateSettings({ eveningReview: e.target.value || "18:00" })} />
          <Toggle on={!!settings.eveningReview} onChange={(v) => updateSettings({ eveningReview: v ? "18:00" : null })} />
        </Row>
        <Row label="Délai des relances" hint="Proposé après un appel ou un rendez-vous (jours ouvrés).">
          <div className="seg">
            {[1, 2, 3, 5, 7].map((n) => (
              <button key={n} className={settings.followupDays === n ? "on" : ""} onClick={() => updateSettings({ followupDays: n })}>{n} j</button>
            ))}
          </div>
        </Row>
        <Row label="Résumé du matin" hint="Une notification avec le programme de la journée.">
          <input type="time" className="input" style={{ width: 110 }} value={settings.morningDigest ?? ""} disabled={!settings.morningDigest}
            onChange={(e) => updateSettings({ morningDigest: e.target.value || "08:30" })} />
          <Toggle on={!!settings.morningDigest} onChange={(v) => updateSettings({ morningDigest: v ? "08:30" : null })} />
        </Row>
      </div>

      <div className="set-group">
        <span className="eyebrow">Journée type</span>
        <Row label="Mon planning de la semaine" hint="Collez votre organisation (9h-12h Dev Spotwise…) : Charles la répète chaque semaine.">
          <button className="btn" onClick={() => setUI({ planning: true })}>Ouvrir</button>
        </Row>
      </div>

      {isTauri && <ShortcutsGroup />}
      <ProjectsGroup />
      <CategoriesGroup />

      {isTauri && <div className="set-group">
        <span className="eyebrow">Système</span>
        <Row label="Lancer Charles au démarrage de Windows" hint="Charles démarre discrètement dans la barre système.">
          <Toggle on={settings.autostart} onChange={(v) => { updateSettings({ autostart: v }); setAutostart(v); }} />
        </Row>
        <Row label="Sauvegardes" hint="Vos données restent sur cet ordinateur. Une copie de la base est faite chaque jour (14 conservées).">
          <button className="btn" disabled={!isTauri} onClick={openBackupsFolder}><FolderOpen size={14} /> Ouvrir le dossier</button>
        </Row>
      </div>
      }
      {isTauri && <UpdateRow />}
      <div className="hint" style={{ textAlign: "center", marginTop: 10 }}>Données locales, aucun compte requis</div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="l"><b>{label}</b>{hint && <small>{hint}</small>}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button role="switch" aria-checked={on} className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} />;
}

function ShortcutsGroup() {
  const { settings } = useCharles();
  const [rec, setRec] = useState<keyof Shortcuts | null>(null);
  const labels: [keyof Shortcuts, string, string][] = [
    ["quickAdd", "Ajout rapide (global)", "Fonctionne partout dans Windows."],
    ["toggleWidget", "Afficher / masquer le widget (global)", ""],
    ["newItem", "Nouvelle tâche", "Dans Charles."],
    ["search", "Recherche / commandes", "Dans Charles."],
  ];
  const set = async (k: keyof Shortcuts, accel: string) => {
    const sc = { ...settings.shortcuts, [k]: accel };
    await updateSettings({ shortcuts: sc });
    if (k === "quickAdd" || k === "toggleWidget") {
      const failed = await setGlobalShortcuts(sc);
      if (failed.length) showToast("Raccourci indisponible", { detail: `${failed.map(displayAccel).join(", ")} est déjà utilisé par une autre application.` });
    }
  };
  return (
    <div className="set-group">
      <span className="eyebrow">Raccourcis clavier</span>
      {labels.map(([k, l, h]) => (
        <Row key={k} label={l} hint={h || undefined}>
          <button
            className={`kbd-rec ${rec === k ? "rec" : ""}`}
            onClick={() => setRec(k)}
            onBlur={() => setRec(null)}
            onKeyDown={(e) => {
              if (rec !== k) return;
              e.preventDefault(); e.stopPropagation();
              if (e.key === "Escape") return setRec(null);
              const a = eventToAccel(e);
              if (!a) return;
              if (!a.includes("+")) return; // exiger au moins un modificateur
              set(k, a); setRec(null);
            }}
          >
            {rec === k ? "Appuyez sur la combinaison…" : displayAccel(settings.shortcuts[k])}
          </button>
        </Row>
      ))}
    </div>
  );
}

function CategoriesGroup() {
  const { categories } = useCharles();
  const [pick, setPick] = useState<string | null>(null);
  const [name, setName] = useState("");
  return (
    <div className="set-group">
      <span className="eyebrow">Catégories</span>
      {categories.map((c) => (
        <div key={c.id}>
          <div className="cat-row">
            <button className="icon-btn" onClick={() => setPick(pick === c.id ? null : c.id)} title="Icône"><CatIcon name={c.icon} size={15} color={c.color} /></button>
            <input className="input" style={{ border: "1px solid transparent", background: "transparent" }} defaultValue={c.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && saveCategory({ ...c, name: e.target.value.trim() })} />
            <div className="swatches">
              {COLORS.map((col) => (
                <button key={col} className={`swatch ${c.color === col ? "on" : ""}`} style={{ background: col }} onClick={() => saveCategory({ ...c, color: col })} />
              ))}
            </div>
            <div className="seg">
              <button className={c.kind === "task" ? "on" : ""} onClick={() => saveCategory({ ...c, kind: "task" })}>Tâche</button>
              <button className={c.kind === "event" ? "on" : ""} onClick={() => saveCategory({ ...c, kind: "event" })}>RDV</button>
            </div>
            <button className="icon-btn" disabled={c.builtin} style={{ opacity: c.builtin ? 0.2 : 1 }} title={c.builtin ? "Catégorie par défaut" : "Supprimer"} onClick={() => deleteCategory(c.id)}>
              <Trash2 size={14} />
            </button>
          </div>
          {pick === c.id && (
            <div className="icon-pick">
              {Object.keys(CATEGORY_ICONS).map((ic) => (
                <button key={ic} className={`icon-btn ${c.icon === ic ? "on" : ""}`} onClick={() => { saveCategory({ ...c, icon: ic }); setPick(null); }}>
                  <CatIcon name={ic} size={15} />
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="cat-row" style={{ gridTemplateColumns: "28px 1fr auto" }}>
        <span style={{ display: "grid", placeItems: "center", color: "var(--text-3)" }}><Plus size={15} /></span>
        <input className="input" placeholder="Nouvelle catégorie (ex. Spotwise)" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { saveCategory({ name: name.trim() }); setName(""); } }} />
        <button className="btn" disabled={!name.trim()} onClick={() => { saveCategory({ name: name.trim() }); setName(""); }}>Ajouter</button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>Astuce : tapez <b>#spotwise</b> dans la saisie rapide pour classer directement.</div>
    </div>
  );
}

function ProjectsGroup() {
  const { projects } = useCharles();
  const [name, setName] = useState("");
  return (
    <div className="set-group">
      <span className="eyebrow">Projets</span>
      {projects.map((p) => (
        <div key={p.id} className="cat-row" style={{ gridTemplateColumns: "28px 1fr auto auto" }}>
          <span style={{ display: "grid", placeItems: "center" }}><i style={{ width: 10, height: 10, borderRadius: 10, background: p.color }} /></span>
          <input className="input" style={{ border: "1px solid transparent", background: "transparent" }} defaultValue={p.name}
            onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && saveProject({ ...p, name: e.target.value.trim() })} />
          <div className="swatches">
            {COLORS.map((col) => (
              <button key={col} className={`swatch ${p.color === col ? "on" : ""}`} style={{ background: col }} onClick={() => saveProject({ ...p, color: col })} />
            ))}
          </div>
          <button className="icon-btn" title="Supprimer le projet" onClick={() => deleteProject(p.id)}><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="cat-row" style={{ gridTemplateColumns: "28px 1fr auto" }}>
        <span style={{ display: "grid", placeItems: "center", color: "var(--text-3)" }}><Plus size={15} /></span>
        <input className="input" placeholder="Nouveau projet" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { saveProject({ name: name.trim(), color: COLORS[projects.length % COLORS.length] }); setName(""); } }} />
        <button className="btn" disabled={!name.trim()} onClick={() => { saveProject({ name: name.trim(), color: COLORS[projects.length % COLORS.length] }); setName(""); }}>Ajouter</button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>Un projet cité dans un titre (« Dev Spotwise ») est reconnu automatiquement. Le temps passé apparaît dans le Bilan.</div>
    </div>
  );
}

function UpdateRow() {
  const [v, setV] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "none" | "installing">("idle");
  const [found, setFound] = useState<string | null>(null);
  useEffect(() => { appVersion().then(setV); }, []);
  const run = async () => {
    setState("checking");
    const u = await checkForUpdate();
    if (!u) { setState("none"); return; }
    setFound(u.version);
    setState("installing");
    await u.install();
  };
  return (
    <div className="set-group">
      <span className="eyebrow">Mises à jour</span>
      <Row label={`Charles ${v}`} hint={state === "none" ? "Vous avez la dernière version." : state === "installing" ? `Installation de la ${found}…` : "Les nouvelles versions publiées sur GitHub s'installent en un clic."}>
        <button className="btn" disabled={!isTauri || state === "checking" || state === "installing"} onClick={run}>
          {state === "checking" ? "Recherche…" : "Rechercher"}
        </button>
      </Row>
    </div>
  );
}
