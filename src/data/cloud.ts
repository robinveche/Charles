import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, Item, Project } from "../core/types";
import { decodeJournal, getRepo, notifyOthers, reloadStore, setAfterWrite } from "./store";
import type { Repository } from "./repository";

/**
 * Synchronisation PC ↔ iPhone via Supabase.
 *
 * Principe (simple et robuste) :
 * - Chaque appareil garde sa base locale (hors connexion OK) ; le cloud est une table `records`
 *   (une ligne par élément : kind + id + data JSON + updated_at), protégée par utilisateur (RLS).
 * - PUSH : tout ce qui a été modifié localement depuis le dernier envoi part au cloud.
 * - PULL : tout ce qui a changé dans le cloud depuis le dernier passage (horloge serveur) revient.
 * - Conflit : la version la plus récente (updated_at) gagne, côté client ET côté serveur (trigger).
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const cloudConfigured = !!(URL && KEY);

let client: SupabaseClient | null = null;
async function sb(): Promise<SupabaseClient> {
  if (!client) {
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(URL!, KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "charles-auth" },
    });
  }
  return client;
}

// ─── État observable par l'interface ─────────────────────────
export interface SyncState {
  ready: boolean; // session vérifiée
  email: string | null;
  syncing: boolean;
  lastSync: string | null;
  error: string | null;
}
let st: SyncState = { ready: !cloudConfigured, email: null, syncing: false, lastSync: null, error: null };
const ls = new Set<() => void>();
const setSt = (p: Partial<SyncState>) => { st = { ...st, ...p }; ls.forEach((l) => l()); };
export const useSync = () => useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => st);

/** La version distante remplace la locale seulement si elle est strictement plus récente. */
export function shouldApply(localUpdated: string | null | undefined, remoteUpdated: string): boolean {
  if (!localUpdated) return true;
  return new Date(remoteUpdated).getTime() > new Date(localUpdated).getTime();
}

// ─── Connexion ───────────────────────────────────────────────
const frError = (m: string) =>
  /invalid login/i.test(m) ? "E-mail ou mot de passe incorrect."
    : /already registered/i.test(m) ? "Ce compte existe déjà : connectez-vous."
      : /password should be/i.test(m) ? "Mot de passe trop court (6 caractères minimum)."
        : /email not confirmed/i.test(m) ? "Confirmez d'abord votre e-mail (lien reçu), ou désactivez la confirmation dans Supabase."
          : /fetch|network/i.test(m) ? "Pas de connexion internet."
            : m;

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await (await sb()).auth.signInWithPassword({ email: email.trim(), password });
  return error ? frError(error.message) : null;
}
export async function signUp(email: string, password: string): Promise<string | null> {
  const { data, error } = await (await sb()).auth.signUp({ email: email.trim(), password });
  if (error) return frError(error.message);
  if (!data.session) return "Compte créé : confirmez l'e-mail reçu, puis connectez-vous.";
  return null;
}
export async function signOut() {
  await (await sb()).auth.signOut();
  setSt({ email: null, lastSync: null });
}

// ─── Moteur de synchronisation ───────────────────────────────
export interface Row { user_id: string; kind: string; id: string; data: unknown; updated_at: string; server_updated_at?: string }

export interface CloudApi {
  upsert(rows: Row[]): Promise<void>;
  pullSince(cursor: string): Promise<Row[]>; // trié par server_updated_at, 1000 max
}

/** Un cycle complet envoi + réception. Renvoie true si des données locales ont changé. */
export async function syncOnce(repo: Repository, api: CloudApi, uid: string): Promise<boolean> {
  const getKV = (k: string) => repo.getKV(k);
  const setKV = (k: string, v: string) => repo.setKV(k, v);
  // Un autre compte sur cet appareil → on repart de zéro côté curseurs
  if ((await getKV("sync:user")) !== uid) {
    await setKV("sync:lastPush", "");
    await setKV("sync:lastPull", "");
    await setKV("sync:user", uid);
  }

  // ── PUSH ──
  const pushStart = new Date().toISOString();
  const since = (await getKV("sync:lastPush")) || null;
  const newer = (u?: string | null) => !since || (!!u && u > since);
  const rows: Row[] = [];
  for (const i of await repo.loadItemsSince(since)) rows.push({ user_id: uid, kind: "item", id: i.id, data: i, updated_at: i.updatedAt });
  for (const cat of await repo.loadAllCategories()) if (newer(cat.updatedAt)) rows.push({ user_id: uid, kind: "category", id: cat.id, data: cat, updated_at: cat.updatedAt ?? pushStart });
  for (const p of await repo.loadAllProjects()) if (newer(p.updatedAt)) rows.push({ user_id: uid, kind: "project", id: p.id, data: p, updated_at: p.updatedAt ?? pushStart });
  for (const { key, value } of await repo.listKV("journal:")) {
    const j = decodeJournal(value);
    if (j.t && newer(j.u)) rows.push({ user_id: uid, kind: "kv", id: key, data: { t: j.t, u: j.u || pushStart }, updated_at: j.u || pushStart });
  }
  for (let k = 0; k < rows.length; k += 500) await api.upsert(rows.slice(k, k + 500));
  await setKV("sync:lastPush", pushStart);

  // ── PULL ──
  let cursor = (await getKV("sync:lastPull")) || "1970-01-01T00:00:00Z";
  let changed = false;
  const cats = new Map((await repo.loadAllCategories()).map((x) => [x.id, x]));
  const projs = new Map((await repo.loadAllProjects()).map((x) => [x.id, x]));
  for (let page = 0; page < 50; page++) {
    const data = await api.pullSince(cursor);
    if (!data.length) break;
    for (const r of data) {
      if (r.kind === "item") {
        const local = await repo.loadItemById(r.id);
        if (shouldApply(local?.updatedAt, r.updated_at)) { await repo.saveItem(r.data as Item); changed = true; }
      } else if (r.kind === "category") {
        if (shouldApply(cats.get(r.id)?.updatedAt, r.updated_at)) { await repo.saveCategory({ ...(r.data as Category), updatedAt: r.updated_at }); changed = true; }
      } else if (r.kind === "project") {
        if (shouldApply(projs.get(r.id)?.updatedAt, r.updated_at)) { await repo.saveProject({ ...(r.data as Project), updatedAt: r.updated_at }); changed = true; }
      } else if (r.kind === "kv") {
        const local = decodeJournal(await repo.getKV(r.id));
        if (shouldApply(local.u || null, r.updated_at)) { await repo.setKV(r.id, JSON.stringify(r.data)); changed = true; }
      }
      cursor = r.server_updated_at!;
    }
    await setKV("sync:lastPull", cursor);
    if (data.length < 1000) break;
  }
  return changed;
}

let running = false;
let again = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
const schedule = () => { clearTimeout(pushTimer); pushTimer = setTimeout(() => syncNow(), 1500); };

export async function syncNow(): Promise<void> {
  if (!cloudConfigured) return;
  if (running) { again = true; return; }
  running = true;
  try {
    const c = await sb();
    const { data: { session } } = await c.auth.getSession();
    if (!session) { setSt({ email: null, ready: true }); return; }
    const uid = session.user.id;
    setSt({ syncing: true, email: session.user.email ?? null, ready: true });
    const changed = await syncOnce(getRepo(), {
      upsert: async (rows) => {
        const { error } = await c.from("records").upsert(rows, { onConflict: "user_id,kind,id" });
        if (error) throw new Error(error.message);
      },
      pullSince: async (cursor) => {
        const { data, error } = await c.from("records").select("*").gt("server_updated_at", cursor).order("server_updated_at", { ascending: true }).limit(1000);
        if (error) throw new Error(error.message);
        return (data ?? []) as Row[];
      },
    }, uid);
    if (changed) { await reloadStore(); notifyOthers(); }
    setSt({ syncing: false, lastSync: new Date().toISOString(), error: null });
  } catch (e) {
    setSt({ syncing: false, error: frError(e instanceof Error ? e.message : String(e)) });
  } finally {
    running = false;
    setSt({ syncing: false });
    if (again) { again = false; schedule(); }
  }
}

let started = false;
/** Lancé une seule fois (fenêtre principale sur PC, page unique sur iPhone). */
export async function startSync() {
  if (started || !cloudConfigured) return;
  started = true;
  const c = await sb();
  const { data: { session } } = await c.auth.getSession();
  setSt({ ready: true, email: session?.user.email ?? null });
  c.auth.onAuthStateChange((event, s) => {
    setSt({ email: s?.user.email ?? null });
    if (event === "SIGNED_IN") syncNow();
  });
  setAfterWrite(schedule);
  syncNow();
  setInterval(syncNow, 30_000);
  window.addEventListener("focus", () => syncNow());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNow(); });
  window.addEventListener("online", () => syncNow());
}
