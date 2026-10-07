import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles/global.css";
import { currentView } from "./platform";
import { initStore, getState, useCharles } from "./data/store";
import { App } from "./ui/App";
import { CommandBar } from "./ui/windows/CommandBar";
import { Widget } from "./ui/windows/Widget";

/** Une seule base de code pour 3 fenêtres : principale, command bar, widget. */
const view = currentView();

const mq = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  const pref = getState().settings.theme;
  const dark = pref === "dark" || (pref === "system" && mq.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
mq.addEventListener("change", applyTheme);
applyTheme();

if (view !== "main") document.body.classList.add("transparent");
// Pas de menu contextuel « navigateur » dans une app de bureau.
window.addEventListener("contextmenu", (e) => {
  if (!(e.target as HTMLElement).closest("input,textarea")) e.preventDefault();
});

// Version iPhone / navigateur : fonctionnement hors connexion
if (!("__TAURI_INTERNALS__" in window) && "serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
document.documentElement.classList.toggle("is-web", !("__TAURI_INTERNALS__" in window));

/** Le thème peut être changé depuis une autre fenêtre : on suit l'état partagé. */
function ThemeSync() {
  const { settings } = useCharles();
  useEffect(applyTheme, [settings.theme]);
  return null;
}

initStore().then(async () => {
  if (new URLSearchParams(location.search).has("demo")) await (await import("./data/demo")).seedDemo();
  applyTheme();
  const Comp = view === "quick" ? CommandBar : view === "widget" ? Widget : App;
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ThemeSync />
      <Comp />
    </React.StrictMode>,
  );
});
