import { useState } from "react";
import { Check, Moon, Reply, X } from "lucide-react";
import type { Item } from "../../core/types";
import { addDaysISO, minutesOf, toISODate, longDate } from "../../core/dates";
import { byDateTime, isOverdue, isPlanning, itemsInRange } from "../../core/selectors";
import {
  addBusinessDays, categoryOf, completeItem, createFollowup, deleteItem, updateItem, updateSettings, useCharles,
} from "../../data/store";
import { CatIcon } from "./Icon";
import { Journal } from "../views/Bilan";
import { setUI, useUI } from "../uiState";

/**
 * Revue du soir (2 minutes) : on vide la journée, on prépare demain, on note ce qui compte.
 * Rien ne reste « en suspens » sans décision.
 */
export function ReviewModal() {
  const { review } = useUI();
  if (!review) return null;
  return <Inner />;
}

function Inner() {
  const { items, settings } = useCharles();
  const now = new Date();
  const today = toISODate(now);
  const tomorrow = addDaysISO(today, 1);
  const nm = now.getHours() * 60 + now.getMinutes();
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const mark = (id: string) => setHandled(new Set(handled).add(id));

  const left = items
    .filter((i) => !i.deletedAt && !i.doneAt && i.kind === "task" && !isPlanning(i) && (i.date === today || isOverdue(i, now)))
    .filter((i) => !handled.has(i.id))
    .sort(byDateTime);
  const meetings = items.filter((i) => !i.deletedAt && i.kind === "event" && !isPlanning(i) && i.date === today && i.time && minutesOf(i.time) < nm);
  const tmr = itemsInRange(items.filter((i) => !i.deletedAt && !i.doneAt && !isPlanning(i)), tomorrow, tomorrow);
  const close = () => setUI({ review: false });
  const finish = () => { updateSettings({ lastReview: today }); close(); };
  const nextMonday = (() => { const d = new Date(); const wd = (d.getDay() + 6) % 7; return addDaysISO(today, 7 - wd); })();

  const act = (i: Item, f: () => void) => { f(); mark(i.id); };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal review" onKeyDown={(e) => e.key === "Escape" && close()}>
        <div className="modal-body">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Moon size={18} color="var(--accent)" />
            <div style={{ flex: 1 }}>
              <div className="title-input" style={{ fontSize: 19 }}>Revue du soir</div>
              <div className="hint">2 minutes pour fermer la journée et préparer demain.</div>
            </div>
            <button className="icon-btn" onClick={close}><X size={16} /></button>
          </div>

          <div className="rv-step">
            <div className="rv-h"><span className="rv-n">1</span> Ce qui reste <span className="meta">{left.length || ""}</span></div>
            {left.length === 0 && <div className="empty">Tout est traité.</div>}
            {left.map((i) => {
              const c = categoryOf(i.categoryId);
              return (
                <div key={i.id} className="rv-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="rv-t">{i.title}</div>
                    <div className="tl-meta"><CatIcon name={c.icon} size={11} /> {c.name}{i.date && i.date < today ? " · en retard" : ""}</div>
                  </div>
                  <div className="rv-acts">
                    <button className="pill primary" onClick={() => act(i, () => completeItem(i.id))}><Check size={12} /> Fait</button>
                    <button className="pill" onClick={() => act(i, () => updateItem(i.id, { date: tomorrow }))}>Demain</button>
                    <button className="pill" onClick={() => act(i, () => updateItem(i.id, { date: addBusinessDays(today, 2) }))}>Dans 2 j</button>
                    <button className="pill" onClick={() => act(i, () => updateItem(i.id, { date: nextMonday }))}>Lundi</button>
                    <button className="pill" onClick={() => act(i, () => updateItem(i.id, { date: null, time: null }))}>Sans date</button>
                    <button className="pill" title="Supprimer" onClick={() => act(i, () => deleteItem(i.id))}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>

          {meetings.length > 0 && (
            <div className="rv-step">
              <div className="rv-h"><span className="rv-n">2</span> Rendez-vous et appels d'aujourd'hui : une relance ?</div>
              {meetings.map((i) => (
                <div key={i.id} className="rv-row">
                  <div style={{ flex: 1 }}><div className="rv-t">{i.title}</div><div className="tl-meta">{i.time}</div></div>
                  <button className={`pill ${followed.has(i.id) ? "" : "primary"}`} disabled={followed.has(i.id)}
                    onClick={() => { createFollowup(i); setFollowed(new Set(followed).add(i.id)); }}>
                    <Reply size={12} /> {followed.has(i.id) ? "Relance prévue" : `Relancer dans ${settings.followupDays} j`}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="rv-step">
            <div className="rv-h"><span className="rv-n">{meetings.length ? 3 : 2}</span> Demain · {longDate(tomorrow)} <span className="meta">{tmr.length || ""}</span></div>
            {tmr.length === 0 && <div className="empty">Rien de prévu pour l'instant.</div>}
            {tmr.slice(0, 8).map((i) => (
              <div key={i.id} className="rv-row small">
                <span className="tl-t num">{i.time ?? "—"}</span>
                <span className="rv-t">{i.title}</span>
              </div>
            ))}
          </div>

          <Journal day={today} />
        </div>
        <div className="modal-foot">
          <span className="hint">{left.length ? `${left.length} élément${left.length > 1 ? "s" : ""} sans décision` : "Journée bouclée"}</span>
          <span className="spacer" />
          <button className="btn primary" onClick={finish}>Terminer la revue</button>
        </div>
      </div>
    </div>
  );
}
