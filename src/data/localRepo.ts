import type { Category, Item, Project, Settings } from "../core/types";
import type { Repository } from "./repository";

/** Stockage navigateur (mode développement / aperçu hors Tauri). */
const KEY = "charles.v1";

interface Snapshot { items: Record<string, Item>; categories: Record<string, Category & { deletedAt?: string | null }>; settings: Settings | null; kv?: Record<string, string>; projects?: Record<string, Project & { deletedAt?: string | null }> }

export class LocalRepository implements Repository {
  private read(): Snapshot {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* stockage indisponible */ }
    return { items: {}, categories: {}, settings: null };
  }
  private write(s: Snapshot) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }
  async init() {}
  async loadItems() { return Object.values(this.read().items).filter((i) => !i.deletedAt); }
  async loadCategories() {
    return Object.values(this.read().categories).filter((c) => !c.deletedAt).sort((a, b) => a.sort - b.sort);
  }
  async loadSettings() { return this.read().settings; }
  async saveItem(item: Item) { const s = this.read(); s.items[item.id] = item; this.write(s); }
  async saveCategory(c: Category) { const s = this.read(); s.categories[c.id] = c; this.write(s); }
  async saveSettings(settings: Settings) { const s = this.read(); s.settings = settings; this.write(s); }
  async loadProjects() { return Object.values(this.read().projects ?? {}).filter((p) => !p.deletedAt).sort((a, b) => a.sort - b.sort); }
  async saveProject(p: Project & { deletedAt?: string | null }) { const s = this.read(); s.projects = { ...(s.projects ?? {}), [p.id]: p }; this.write(s); }
  async getKV(key: string) { return this.read().kv?.[key] ?? null; }
  async setKV(key: string, value: string) { const s = this.read(); s.kv = { ...(s.kv ?? {}), [key]: value }; this.write(s); }
}
