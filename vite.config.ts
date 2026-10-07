import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Config Vite adaptée à Tauri : port fixe, pas d'écran d'erreur masquant les logs Rust.
export default defineConfig({
  plugins: [react()],
  base: "./", // chemins relatifs : marche dans l'appli Windows ET sur GitHub Pages (/Charles/)
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 800 },
  test: { environment: "node" },
} as any);
