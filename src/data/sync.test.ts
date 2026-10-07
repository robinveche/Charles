import { beforeAll, describe, expect, it } from "vitest";
import type { Item } from "../core/types";
import { LocalRepository } from "./localRepo";
import { shouldApply, syncOnce, type CloudApi, type Row } from "./cloud";

// localStorage minimal pour Node
beforeAll(() => {
  const m = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
});

/** Faux Supabase : même règles que le SQL (dernière version gagne + horloge serveur croissante). */
function fakeCloud() {
  const rows = new Map<string, Row>();
  let clock = Date.parse("2026-01-01T00:00:00Z");
  const api: CloudApi = {
    async upsert(list) {
      for (const r of list) {
        const k = `${r.user_id}|${r.kind}|${r.id}`;
        const old = rows.get(k);
        if (old && r.updated_at < old.updated_at) continue;
        rows.set(k, { ...structuredClone(r), server_updated_at: new Date(++clock).toISOString() });
      }
    },
    async pullSince(cursor) {
      return [...rows.values()].filter((r) => r.server_updated_at! > cursor).sort((a, b) => a.server_updated_at!.localeCompare(b.server_updated_at!)).slice(0, 1000);
    },
  };
  return { api, rows };
}

const item = (id: string, title: string, updatedAt: string, extra: Partial<Item> = {}): Item => ({
  id, title, notes: "", kind: "task", categoryId: "task", priority: 0, date: "2026-10-08", time: null, durationMin: 0,
  reminders: [], recurrence: null, seriesId: null, doneAt: null, firedKeys: [], contactId: null, source: "local",
  externalId: null, createdAt: updatedAt, updatedAt, deletedAt: null, projectId: null, ...extra,
});

describe("synchronisation PC ↔ iPhone", () => {
  it("dernière version gagne", () => {
    expect(shouldApply(undefined, "2026-01-01T00:00:00Z")).toBe(true);
    expect(shouldApply("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z")).toBe(false);
    expect(shouldApply("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")).toBe(true);
  });

  it("une tâche créée sur le PC arrive sur l'iPhone, cochée sur l'iPhone revient sur le PC", async () => {
    const { api } = fakeCloud();
    const pc = new LocalRepository("pc");
    const phone = new LocalRepository("phone");
    await pc.saveItem(item("a", "Appeler Thomas", "2026-10-07T10:00:00.000Z"));
    await syncOnce(pc, api, "u1");
    expect(await syncOnce(phone, api, "u1")).toBe(true);
    expect((await phone.loadItemById("a"))?.title).toBe("Appeler Thomas");

    await phone.saveItem({ ...(await phone.loadItemById("a"))!, doneAt: "2026-10-07T11:00:00.000Z", updatedAt: new Date(Date.now() + 1000).toISOString() });
    await syncOnce(phone, api, "u1");
    await syncOnce(pc, api, "u1");
    expect((await pc.loadItemById("a"))?.doneAt).toBe("2026-10-07T11:00:00.000Z");
  });

  it("conflit : la modification la plus récente gagne partout", async () => {
    const { api } = fakeCloud();
    const pc = new LocalRepository("pc2");
    const phone = new LocalRepository("phone2");
    await pc.saveItem(item("b", "Devis", "2026-10-07T09:00:00.000Z"));
    await syncOnce(pc, api, "u2");
    await syncOnce(phone, api, "u2");
    // les deux modifient hors ligne ; l'iPhone plus tard
    const t1 = new Date(Date.now() + 5000).toISOString();
    const t2 = new Date(Date.now() + 9000).toISOString();
    await pc.saveItem({ ...(await pc.loadItemById("b"))!, title: "Devis (PC)", updatedAt: t1 });
    await phone.saveItem({ ...(await phone.loadItemById("b"))!, title: "Devis (iPhone)", updatedAt: t2 });
    await syncOnce(phone, api, "u2");
    await syncOnce(pc, api, "u2"); // le PC envoie une version plus ancienne : refusée par le serveur
    await syncOnce(phone, api, "u2");
    expect((await pc.loadItemById("b"))?.title).toBe("Devis (iPhone)");
    expect((await phone.loadItemById("b"))?.title).toBe("Devis (iPhone)");
  });

  it("suppressions et note du jour suivent", async () => {
    const { api } = fakeCloud();
    const pc = new LocalRepository("pc3");
    const phone = new LocalRepository("phone3");
    await pc.saveItem(item("c", "À supprimer", "2026-10-07T09:00:00.000Z"));
    await pc.setKV("journal:2026-10-07", JSON.stringify({ t: "Bonne journée", u: new Date(Date.now() + 1000).toISOString() }));
    await syncOnce(pc, api, "u3");
    await syncOnce(phone, api, "u3");
    expect(JSON.parse((await phone.getKV("journal:2026-10-07"))!).t).toBe("Bonne journée");
    await phone.saveItem({ ...(await phone.loadItemById("c"))!, deletedAt: "2026-10-07T12:00:00.000Z", updatedAt: new Date(Date.now() + 3000).toISOString() });
    await syncOnce(phone, api, "u3");
    await syncOnce(pc, api, "u3");
    expect((await pc.loadItems()).find((i) => i.id === "c")).toBeUndefined();
  });

  it("catégories par défaut d'un nouvel appareil n'écrasent pas celles modifiées", async () => {
    const { api } = fakeCloud();
    const pc = new LocalRepository("pc4");
    const phone = new LocalRepository("phone4");
    await pc.saveCategory({ id: "call", name: "Appels pros", icon: "phone", color: "#fff", kind: "task", sort: 4, builtin: true, updatedAt: "2026-10-01T00:00:00.000Z" });
    await phone.saveCategory({ id: "call", name: "Appel", icon: "phone", color: "#fff", kind: "task", sort: 4, builtin: true, updatedAt: "2000-01-01T00:00:00.000Z" });
    await syncOnce(pc, api, "u4");
    await syncOnce(phone, api, "u4");
    await syncOnce(pc, api, "u4");
    expect((await phone.loadAllCategories()).find((c) => c.id === "call")?.name).toBe("Appels pros");
    expect((await pc.loadAllCategories()).find((c) => c.id === "call")?.name).toBe("Appels pros");
  });
});
