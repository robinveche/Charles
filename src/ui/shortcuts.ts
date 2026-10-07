/** Raccourcis au format accélérateur Tauri : "Control+Shift+Space", "Alt+K"… */

export function eventToAccel(e: KeyboardEvent | React.KeyboardEvent): string | null {
  const code = e.code;
  if (["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(code)) return null;
  let key: string;
  if (code.startsWith("Key")) key = code.slice(3);
  else if (code.startsWith("Digit")) key = code.slice(5);
  else if (/^F\d+$/.test(code)) key = code;
  else key = ({ Space: "Space", Enter: "Enter", Period: ".", Comma: ",", Slash: "/", Semicolon: ";", Backquote: "`", Minus: "-", Equal: "=" } as Record<string, string>)[code] ?? code;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Control");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  return [...mods, key].join("+");
}

export function matches(e: KeyboardEvent, accel: string): boolean {
  const a = eventToAccel(e);
  return !!a && a.toLowerCase() === accel.toLowerCase().replace("commandorcontrol", "control").replace("ctrl+", "control+");
}

export function displayAccel(accel: string): string {
  return accel.replace(/CommandOrControl|Control/g, "Ctrl").replace("Super", "Win").replace("Space", "Espace").split("+").join(" + ");
}
