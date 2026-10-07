import { useMemo, useState } from "react";
import { Trash2, X } from "lucide-react";
import { parsePlanning } from "../../core/planning";
import { WEEKDAYS_SHORT, fromMinutes, minutesOf } from "../../core/dates";
import { isPlanning } from "../../core/selectors";
import { createPlanning, deletePlanning, useCharles } from "../../data/store";
import { setUI, useUI } from "../uiState";

const dayList = (d: number[]) => {
  const s = [...d].sort();
  if (s.length === 7) return "Tous les jours";
  if (s.join() === "0,1,2,3,4") return "Lun → ven";
  if (s.join() === "5,6") return "Week-end";
  return s.map((i) => WEEKDAYS_SHORT[i].replace(".", "")).join(", ");
};

/** Journée type : on colle son planning, Charles le répète automatiquement chaque semaine. */
export function PlanningModal() {
  const { planning } = useUI();
  if (!planning) return null;
  return <Inner />;
}

function Inner() {
  const { items } = useCharles();
  const [text, setText] = useState("");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [notify, setNotify] = useState(true);
  const [confirmAll, setConfirmAll] = useState(false);
  const blocks = useMemo(() => parsePlanning(text), [text]);
  const existing = items.filter((i) => !i.deletedAt && isPlanning(i) && i.recurrence).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const close = () => setUI({ planning: false });

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ width: "min(680px, calc(100vw - 32px))" }} onKeyDown={(e) => e.key === "Escape" && close()}>
        <div className="modal-body">
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div className="title-input" style={{ fontSize: 19 }}>Journée type</div>
              <div className="hint" style={{ marginTop: 2 }}>Collez votre planning : Charles le répète chaque semaine (blocs discrets dans Aujourd'hui, le calendrier et le widget).</div>
            </div>
            <button className="icon-btn" onClick={close}><X size={16} /></button>
          </div>

          <textarea className="textarea" style={{ minHeight: 150, fontSize: 13, fontFamily: "inherit" }} autoFocus
            placeholder={"Un bloc par ligne, par exemple :\n8h30 - 9h : Routine & mails\n9h - 12h30 : Dev Spotwise\n12h30 - 13h30 Déjeuner\n14h - 18h : Prospection commerces\n\nVous pouvez préciser des jours : « Mardi : 9h-17h MP Finance » ou une ligne « Lundi » au-dessus d'un groupe."}
            value={text} onChange={(e) => setText(e.target.value)} />

          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div className="field">
              <label>JOURS (pour les lignes sans jour précisé)</label>
              <div className="togglechips">
                {WEEKDAYS_SHORT.map((w, i) => (
                  <button key={w} className={`tchip ${days.includes(i) ? "on" : ""}`} style={{ width: 44, justifyContent: "center" }}
                    onClick={() => setDays(days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort())}>{w.replace(".", "")}</button>
                ))}
              </div>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--text-2)", cursor: "pointer", marginTop: 16 }}>
              <button className={`toggle ${notify ? "on" : ""}`} onClick={() => setNotify(!notify)} /> Notification au début de chaque bloc
            </label>
          </div>

          {blocks.length > 0 && (
            <table className="plan-table">
              <tbody>
                {blocks.map((b, i) => (
                  <tr key={i}>
                    <td className="t">{b.start} – {b.end}</td>
                    <td>{b.title}</td>
                    <td className="d">{dayList(b.days?.length ? b.days : days)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {text.trim() && blocks.length === 0 && <div className="hint">Aucun horaire reconnu. Format attendu : « 9h-12h Titre ».</div>}

          {existing.length > 0 && (
            <div className="field">
              <label style={{ display: "flex" }}>
                <span style={{ flex: 1 }}>DÉJÀ DANS CHARLES · {existing.length}</span>
                <button className="hint" style={{ color: confirmAll ? "var(--urgent)" : undefined }}
                  onClick={() => { if (confirmAll) { deletePlanning(existing.map((e) => e.id)); setConfirmAll(false); } else setConfirmAll(true); }}>
                  {confirmAll ? "Confirmer : tout effacer" : "Tout effacer"}
                </button>
              </label>
              <table className="plan-table">
                <tbody>
                  {existing.map((b) => (
                    <tr key={b.id}>
                      <td className="t">{b.time} – {fromMinutes(minutesOf(b.time!) + b.durationMin)}</td>
                      <td>{b.title}</td>
                      <td className="d">{dayList(b.recurrence?.byWeekday ?? [])}</td>
                      <td style={{ width: 34 }}>
                        <button className="icon-btn" style={{ width: 26, height: 26 }} title="Supprimer ce bloc" onClick={() => deletePlanning([b.id])}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <span className="spacer" />
          <button className="btn ghost" onClick={close}>Fermer</button>
          <button className="btn primary" disabled={!blocks.length} style={{ opacity: blocks.length ? 1 : 0.4 }}
            onClick={async () => { await createPlanning(blocks, days, notify); setText(""); }}>
            Ajouter {blocks.length || ""} bloc{blocks.length > 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
