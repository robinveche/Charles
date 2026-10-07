import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { createItem, useCharles } from "../../data/store";
import { hideQuick, isTauri, onEvent } from "../../platform";
import { nextCategory, TypeBar, useParsed, type Choice } from "../components/QuickAdd";
import { summarize } from "../format";
import { displayAccel } from "../shortcuts";
import { BrandMark } from "../components/Icon";

/**
 * Fenêtre « Command Bar » : Ctrl+Espace depuis n'importe où → on tape → Entrée → elle disparaît.
 * Objectif : enregistrer une idée en moins de 5 secondes.
 */
export function CommandBar() {
  const { settings } = useCharles();
  const [text, setText] = useState("");
  const [done, setDone] = useState<{ title: string; detail: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [choice, setChoice] = useState<Choice>({});
  const parsed = useParsed(text, undefined, choice);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const reset = () => { setText(""); setChoice({}); setDone(null); clearTimeout(timer.current); };
  const hide = () => { hideQuick(); setTimeout(reset, 150); };

  useEffect(() => {
    const focus = () => { reset(); setTimeout(() => input.current?.focus(), 20); };
    focus();
    const un = onEvent("charles://quick-open", focus);
    // Clic ailleurs → la fenêtre se cache
    let unBlur: (() => void) | undefined;
    if (isTauri) {
      import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
        getCurrentWindow().onFocusChanged(({ payload }) => { if (!payload) hide(); }).then((u) => { unBlur = u; }));
    }
    return () => { un(); unBlur?.(); };
  }, []);

  const submit = async () => {
    if (!parsed) return hide();
    const item = await createItem(parsed.draft);
    setDone({ title: item.title, detail: summarize(item) });
    timer.current = setTimeout(hide, 1100);
  };

  return (
    <div className="cmd-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) hide(); }}>
      <div className="cmd" onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); hide(); } }}>
        {done ? (
          <div className="cmd-done">
            <span className="okc"><Check size={17} strokeWidth={3} /></span>
            <div><b>{done.title}</b><small>{done.detail}</small></div>
          </div>
        ) : (
          <>
            <div className="cmd-top" data-tauri-drag-region>
              <BrandMark size={16} />
              <span className="brand-name">CHARLES</span>
              <span className="kbd">Échap</span>
            </div>
            <input
              ref={input}
              className="cmd-input"
              placeholder="Que dois-je retenir ?"
              value={text}
              autoFocus
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); submit(); }
                // Tab / Maj+Tab : changer de type sans la souris
                else if (e.key === "Tab") {
                  e.preventDefault();
                  setChoice({ ...choice, categoryId: nextCategory(parsed?.draft.categoryId ?? choice.categoryId, e.shiftKey ? -1 : 1) });
                }
              }}
            />
            <div className="cmd-type">
              <TypeBar r={parsed} choice={choice} setChoice={setChoice} refocus={() => input.current?.focus()} compact />
            </div>
            <div className="cmd-chips">
              <span className="hint">Tab : changer de type · Entrée : enregistrer</span>
              <span className="chips-hint">{displayAccel(settings.shortcuts.quickAdd)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
