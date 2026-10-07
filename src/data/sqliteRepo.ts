import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import type { Category, Item, Project, Settings } from "../core/types";
import { toISODate } from "../core/dates";
import type { Repository } from "./repository";

/** Le schéma (migrations) est déclaré côté Rust : src-tauri/src/db.rs */
const DB_URL = "sqlite:charles.db";

type Row = Record<string, any>;

const json = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

function rowToItem(r: Row): Item {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes ?? "",
    kind: r.kind,
    categoryId: r.category_id,
    priority: (r.priority ?? 0) as Item["priority"],
    date: r.date ?? null,
    time: r.time ?? null,
    durationMin: r.duration_min ?? 0,
    projectId: r.project_id ?? null,
    reminders: json(r.reminders, []),
    recurrence: json(r.recurrence, null),
    seriesId: r.series_id ?? null,
    doneAt: r.done_at ?? null,
    firedKeys: json(r.fired_keys, []),
    contactId: r.contact_id ?? null,
    source: r.source ?? "local",
    externalId: r.external_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at ?? null,
  };
}

export class SqliteRepository implements Repository {
  private db!: Database;

  async init() {
    this.db = await Database.load(DB_URL);
    // WAL : écritures sûres et lectures concurrentes entre fenêtres.
    await this.db.execute("PRAGMA journal_mode=WAL").catch(() => {});
    await this.db.execute("PRAGMA synchronous=NORMAL").catch(() => {});
  }

  async loadItems() {
    const rows = await this.db.select<Row[]>("SELECT * FROM items WHERE deleted_at IS NULL");
    return rows.map(rowToItem);
  }

  async loadCategories() {
    const rows = await this.db.select<Row[]>("SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort");
    return rows.map((r) => ({
      id: r.id, name: r.name, icon: r.icon, color: r.color, kind: r.kind, sort: r.sort, builtin: !!r.builtin,
    })) as Category[];
  }

  async loadSettings() {
    const rows = await this.db.select<Row[]>("SELECT value FROM settings WHERE key = 'settings'");
    return rows.length ? json<Partial<Settings> | null>(rows[0].value, null) : null;
  }

  async saveItem(i: Item) {
    await this.db.execute(
      `INSERT INTO items (id,title,notes,kind,category_id,priority,date,time,duration_min,reminders,recurrence,series_id,done_at,fired_keys,contact_id,source,external_id,created_at,updated_at,deleted_at,project_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT(id) DO UPDATE SET title=$2,notes=$3,kind=$4,category_id=$5,priority=$6,date=$7,time=$8,duration_min=$9,
         reminders=$10,recurrence=$11,series_id=$12,done_at=$13,fired_keys=$14,contact_id=$15,source=$16,external_id=$17,updated_at=$19,deleted_at=$20,project_id=$21`,
      [
        i.id, i.title, i.notes, i.kind, i.categoryId, i.priority, i.date, i.time, i.durationMin,
        JSON.stringify(i.reminders), i.recurrence ? JSON.stringify(i.recurrence) : null, i.seriesId, i.doneAt,
        JSON.stringify(i.firedKeys), i.contactId, i.source, i.externalId, i.createdAt, i.updatedAt, i.deletedAt, i.projectId ?? null,
      ],
    );
  }

  async saveCategory(c: Category & { deletedAt?: string | null }) {
    await this.db.execute(
      `INSERT INTO categories (id,name,icon,color,kind,sort,builtin,updated_at,deleted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(id) DO UPDATE SET name=$2,icon=$3,color=$4,kind=$5,sort=$6,builtin=$7,updated_at=$8,deleted_at=$9`,
      [c.id, c.name, c.icon, c.color, c.kind, c.sort, c.builtin ? 1 : 0, new Date().toISOString(), c.deletedAt ?? null],
    );
  }

  async saveSettings(s: Settings) {
    await this.db.execute(
      "INSERT INTO settings (key, value) VALUES ('settings', $1) ON CONFLICT(key) DO UPDATE SET value=$1",
      [JSON.stringify(s)],
    );
  }

  async loadProjects() {
    const rows = await this.db.select<Row[]>("SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY sort");
    return rows.map((r) => ({ id: r.id, name: r.name, color: r.color, sort: r.sort })) as Project[];
  }

  async saveProject(p: Project & { deletedAt?: string | null }) {
    await this.db.execute(
      `INSERT INTO projects (id,name,color,sort,updated_at,deleted_at) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT(id) DO UPDATE SET name=$2,color=$3,sort=$4,updated_at=$5,deleted_at=$6`,
      [p.id, p.name, p.color, p.sort, new Date().toISOString(), p.deletedAt ?? null],
    );
  }

  async getKV(key: string) {
    const rows = await this.db.select<Row[]>("SELECT value FROM settings WHERE key = $1", [`kv:${key}`]);
    return rows.length ? (rows[0].value as string) : null;
  }

  async setKV(key: string, value: string) {
    await this.db.execute(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value=$2",
      [`kv:${key}`, value],
    );
  }

  /** Une copie complète de la base par jour (14 conservées, nettoyage côté Rust). */
  async backup() {
    const dir = await invoke<string>("prepare_backup_dir");
    const sep = dir.includes("\\") ? "\\" : "/";
    const file = `${dir}${sep}charles-${toISODate(new Date())}.db`;
    const exists = await invoke<boolean>("path_exists", { path: file });
    if (!exists) await this.db.execute(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  }
}
