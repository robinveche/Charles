import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { longDate, relativeDay, toISODate } from "../../core/dates";
import { buildHistory } from "../../core/selectors";
import { categoryOf, useCharles } from "../../data/store";
import { ItemRow } from "../components/ItemRow";

/** Historique complet (filtrable), affiché sous le bilan du jour. */
export function HistoryList() {
  const { items } = useCharles();
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(30);
  const now = new Date();
  const today = toISODate(now);
  const groups = useMemo(() => {
    const f = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const fq = f(q.trim());
    const filtered = fq ? items.filter((i) => f(`${i.title} ${i.notes} ${categoryOf(i.categoryId).name}`).includes(fq)) : items;
    return buildHistory(filtered, now);
  }, [items, q]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="section" style={{ marginTop: 56 }}>
      <div className="section-head"><span className="eyebrow">Historique</span></div>
      <div className="quick" style={{ marginTop: 4 }}>
        <Search size={16} className="quick-plus" style={{ top: 15 }} />
        <input className="quick-input" placeholder="Filtrer ce que j'ai fait…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="hint" style={{ marginTop: 10 }}>{total} élément{total > 1 ? "s" : ""} terminé{total > 1 ? "s" : ""}</div>
      {groups.slice(0, limit).map((g) => (
        <section className="section" key={g.date} style={{ marginTop: 26 }}>
          <div className="section-head">
            <span className="eyebrow">{relativeDay(g.date, today)}</span>
            <span className="meta">{longDate(g.date)} · {g.items.length}</span>
          </div>
          <div className="list">{g.items.map((i) => <ItemRow key={i.id} item={i} variant="history" />)}</div>
        </section>
      ))}
      {groups.length > limit && (
        <button className="btn" style={{ marginTop: 20 }} onClick={() => setLimit(limit + 30)}>Afficher plus</button>
      )}
      {groups.length === 0 && <div className="empty" style={{ marginTop: 24 }}>{q ? "Aucun résultat." : "Ce que vous terminez apparaîtra ici."}</div>}
    </div>
  );
}
