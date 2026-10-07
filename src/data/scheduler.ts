import { getState, markFired, updateSettings, categoryOf, rollRecurringEvents } from "./store";
import { notify } from "../platform";
import { toDateTime, toISODate, minutesOf } from "../core/dates";
import { buildToday, isOverdue } from "../core/selectors";

/**
 * Planificateur de notifications. Tourne UNIQUEMENT dans la fenêtre principale
 * (toujours vivante, même cachée — le webview n'est jamais détruit).
 * Vérification toutes les 20 s. Une notification n'est envoyée qu'une fois grâce
 * aux clés `firedKeys` (date|heure|offset) : si on déplace l'élément, les clés changent
 * et les rappels se re-programment automatiquement.
 */

const TICK_MS = 20_000;
const LATE_TOLERANCE_MS = 15 * 60_000; // rappel manqué de plus de 15 min (PC éteint) → ignoré
const OVERDUE_NUDGE_MIN = 60;

function whenLabel(minutes: number): string {
  if (minutes <= 0) return "maintenant";
  if (minutes < 60) return `dans ${minutes} minute${minutes > 1 ? "s" : ""}`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `dans ${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
  }
  return "demain";
}

async function tick(firstRun: boolean) {
  if (!getState().ready) return;
  await rollRecurringEvents();
  const { items, settings } = getState();
  const now = new Date();
  const nowMs = now.getTime();

  for (const it of items) {
    if (it.doneAt || it.deletedAt || !it.date || !it.time) continue;
    const due = toDateTime(it.date, it.time).getTime();
    const newKeys: string[] = [];

    for (const offset of it.reminders) {
      const key = `${it.date}|${it.time}|${offset}`;
      if (it.firedKeys.includes(key)) continue;
      const fireAt = due - offset * 60_000;
      if (nowMs < fireAt) continue;
      newKeys.push(key);
      if (nowMs - fireAt > LATE_TOLERANCE_MS) continue; // trop ancien : on n'inonde pas au démarrage
      const left = Math.round((due - nowMs) / 60_000);
      const cat = categoryOf(it.categoryId);
      const body = offset >= 1440
        ? `${it.title}\nDemain à ${it.time} · ${cat.name}`
        : left <= 0 ? `C'est l'heure · ${it.title}` : `${it.title} ${whenLabel(left)}`;
      notify("Charles", body);
    }

    // Relance « en retard » : une heure après l'échéance, une seule fois.
    if (settings.overdueNudge && it.kind === "task") {
      const key = `${it.date}|${it.time}|late`;
      const at = due + OVERDUE_NUDGE_MIN * 60_000;
      if (!it.firedKeys.includes(key) && nowMs >= at) {
        newKeys.push(key);
        if (nowMs - at < 3 * 3600_000) notify("Charles · en retard", `${it.title}\nPrévu à ${it.time} — à replanifier ?`);
      }
    }
    if (newKeys.length) await markFired(it.id, newKeys);
  }

  // Au démarrage : un seul résumé des retards plutôt qu'une avalanche.
  if (firstRun) {
    const late = items.filter((i) => isOverdue(i, now));
    if (late.length) {
      notify("Charles", late.length === 1 ? `En retard : ${late[0].title}` : `${late.length} tâches en retard — ouvre Charles pour les replanifier`);
    }
  }

  // Revue du soir : une notification à l'heure choisie
  {
    const today0 = toISODate(now);
    const nm0 = now.getHours() * 60 + now.getMinutes();
    if (settings.eveningReview && settings.lastReview !== today0 && settings.reviewNudged !== today0) {
      const at = minutesOf(settings.eveningReview);
      if (nm0 >= at) {
        if (nm0 < at + 120) {
          const m = buildToday(items, now);
          notify("Charles · revue du soir", `${m.counts.today + m.counts.overdue} élément(s) à trier · 2 min pour préparer demain`);
        }
        await updateSettings({ reviewNudged: today0 }, false);
      }
    }
  }

  // Résumé du matin
  const today = toISODate(now);
  if (settings.morningDigest && settings.lastDigest !== today) {
    const nm = now.getHours() * 60 + now.getMinutes();
    const at = minutesOf(settings.morningDigest);
    if (nm >= at && nm < at + 180) {
      const m = buildToday(items, now);
      const parts: string[] = [];
      if (m.next && m.next.date === today) parts.push(`${m.next.time} — ${m.next.title}`);
      parts.push(`${m.counts.today} à faire aujourd'hui${m.counts.overdue ? ` · ${m.counts.overdue} en retard` : ""}`);
      notify("Bonjour — votre journée", parts.join("\n"));
      await updateSettings({ lastDigest: today }, false);
    } else if (nm >= at + 180) {
      await updateSettings({ lastDigest: today }, false);
    }
  }
}

let started = false;
export function startScheduler() {
  if (started) return;
  started = true;
  let first = true;
  const run = () => tick(first).catch((e) => console.warn("scheduler", e)).finally(() => { first = false; });
  setTimeout(run, 3000);
  setInterval(run, TICK_MS);
  // Au réveil du PC : vérifier tout de suite.
  document.addEventListener("visibilitychange", run);
  window.addEventListener("focus", run);
}
