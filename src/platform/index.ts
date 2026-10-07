/**
 * Pont entre l'interface et le système (Tauri). Tout appel natif passe ici,
 * ce qui permet aussi de faire tourner l'UI dans un navigateur (développement, démo).
 */
import type { Settings } from "../core/types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type View = "main" | "quick" | "widget";

export function currentView(): View {
  const q = new URLSearchParams(location.search).get("view");
  if (q === "quick" || q === "widget") return q;
  if (isTauri) {
    const label = (window as any).__TAURI_INTERNALS__?.metadata?.currentWindow?.label;
    if (label === "quick" || label === "widget") return label;
  }
  return "main";
}

async function core() {
  return import("@tauri-apps/api/core");
}
async function ev() {
  return import("@tauri-apps/api/event");
}

const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("charles") : null;

/** Prévient toutes les fenêtres que les données ont changé. */
export async function emitChanged(origin: string) {
  if (isTauri) (await ev()).emit("charles://changed", { origin });
  else bc?.postMessage({ type: "changed", origin });
}

export function onChanged(cb: (origin: string) => void): () => void {
  if (isTauri) {
    let un: (() => void) | null = null;
    let dead = false;
    ev().then((e) => e.listen<{ origin: string }>("charles://changed", (x) => cb(x.payload.origin))).then((u) => {
      if (dead) u(); else un = u;
    });
    return () => { dead = true; un?.(); };
  }
  const h = (e: MessageEvent) => e.data?.type === "changed" && cb(e.data.origin);
  bc?.addEventListener("message", h);
  return () => bc?.removeEventListener("message", h);
}

export function onEvent<T = unknown>(name: string, cb: (payload: T) => void): () => void {
  if (!isTauri) return () => {};
  let un: (() => void) | null = null;
  let dead = false;
  ev().then((e) => e.listen<T>(name, (x) => cb(x.payload))).then((u) => { if (dead) u(); else un = u; });
  return () => { dead = true; un?.(); };
}

export async function invoke<T = void>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (!isTauri) return undefined;
  try {
    return await (await core()).invoke<T>(cmd, args);
  } catch (e) {
    console.warn(`[charles] ${cmd} a échoué`, e);
    throw e;
  }
}

let notifGranted: boolean | null = null;
export async function notify(title: string, body: string) {
  if (isTauri) {
    const n = await import("@tauri-apps/plugin-notification");
    if (notifGranted === null) {
      notifGranted = await n.isPermissionGranted();
      if (!notifGranted) notifGranted = (await n.requestPermission()) === "granted";
    }
    if (notifGranted) n.sendNotification({ title, body });
    return;
  }
  if ("Notification" in window) {
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission === "granted") new Notification(title, { body });
  }
  console.info(`[notification] ${title} — ${body}`);
}

export const showMain = (view?: string) => (isTauri ? invoke("show_main", { view: view ?? null }) : Promise.resolve());
export const hideQuick = () => (isTauri ? invoke("hide_quick") : Promise.resolve());
export const openQuick = () => (isTauri ? invoke("toggle_quick") : Promise.resolve());
export const hideSelf = async () => {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().hide();
};

export async function applyWidget(w: Settings["widget"], resize: boolean) {
  if (!isTauri) return;
  await invoke("apply_widget", { visible: w.visible, layer: w.layer, size: w.size, resize }).catch(() => {});
}

export async function startDrag() {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}

/** Renvoie la liste des raccourcis qui n'ont pas pu être enregistrés (déjà pris par une autre app). */
export async function setGlobalShortcuts(s: Settings["shortcuts"]): Promise<string[]> {
  if (!isTauri) return [];
  return (await invoke<string[]>("set_shortcuts", { quickAdd: s.quickAdd, toggleWidget: s.toggleWidget }).catch(() => [])) ?? [];
}

export async function setAutostart(on: boolean) {
  if (!isTauri) return;
  try {
    const a = await import("@tauri-apps/plugin-autostart");
    const cur = await a.isEnabled();
    if (on && !cur) await a.enable();
    if (!on && cur) await a.disable();
  } catch (e) {
    console.warn("autostart", e);
  }
}

export async function openBackupsFolder() {
  if (!isTauri) return;
  await invoke("open_backups").catch(() => {});
}

export async function quitApp() {
  if (isTauri) await invoke("quit_app");
}

/** Ouvre un lien (site, mail, téléphone) dans l'application par défaut. */
export async function openExternal(url: string) {
  if (isTauri) {
    try { await (await import("@tauri-apps/plugin-opener")).openUrl(url); } catch (e) { console.warn("openUrl", e); }
  } else window.open(url, "_blank");
}

export interface UpdateInfo { version: string; install: () => Promise<void> }

/** Vérifie s'il existe une nouvelle version publiée sur GitHub. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const u = await check();
    if (!u) return null;
    return {
      version: u.version,
      install: async () => {
        await u.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      },
    };
  } catch (e) {
    console.info("[charles] mises à jour indisponibles :", e);
    return null;
  }
}

export async function appVersion(): Promise<string> {
  if (!isTauri) return "dev";
  try { return await (await import("@tauri-apps/api/app")).getVersion(); } catch { return "?"; }
}
