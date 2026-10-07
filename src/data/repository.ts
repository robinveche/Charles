import type { Category, Item, Project, Settings } from "../core/types";

/**
 * Couche de persistance. L'UI ne parle qu'à cette interface :
 * - SqliteRepository : l'app Windows (base locale %APPDATA%/com.charles.app/charles.db)
 * - LocalRepository  : navigateur (développement / démo), via localStorage
 * - Plus tard : un CloudRepository ou un adaptateur de sync qui pousse/tire les lignes
 *   modifiées depuis `updatedAt` (les suppressions sont douces via `deletedAt`).
 */
export interface Repository {
  init(): Promise<void>;
  loadItems(): Promise<Item[]>;
  loadCategories(): Promise<Category[]>;
  loadSettings(): Promise<Partial<Settings> | null>;
  saveItem(item: Item): Promise<void>;
  saveCategory(cat: Category): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  loadProjects(): Promise<Project[]>;
  saveProject(p: Project & { deletedAt?: string | null }): Promise<void>;
  /** Synchronisation : éléments modifiés depuis `since` (suppressions comprises). */
  loadItemsSince(since: string | null): Promise<Item[]>;
  loadItemById(id: string): Promise<Item | null>;
  /** Toutes les catégories / projets, supprimés compris. */
  loadAllCategories(): Promise<Category[]>;
  loadAllProjects(): Promise<Project[]>;
  listKV(prefix: string): Promise<{ key: string; value: string }[]>;
  /** Petites valeurs libres (ex. note du jour « journal:2026-10-07 »). */
  getKV(key: string): Promise<string | null>;
  setKV(key: string, value: string): Promise<void>;
  /** Sauvegarde quotidienne (copie complète de la base). */
  backup?(): Promise<void>;
}
