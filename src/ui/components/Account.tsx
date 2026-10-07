import { useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { cloudConfigured, signIn, signOut, signUp, syncNow, useSync } from "../../data/cloud";
import { BrandMark } from "./Icon";

/** Formulaire e-mail / mot de passe (le même compte sur le PC et l'iPhone). */
export function AccountForm({ compact }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (f: typeof signIn) => {
    if (!email || !pw) return setMsg("E-mail et mot de passe requis.");
    setBusy(true); setMsg(null);
    const err = await f(email, pw);
    setBusy(false);
    if (err) setMsg(err);
  };
  return (
    <form className="account-form" onSubmit={(e) => { e.preventDefault(); run(signIn); }} style={compact ? { maxWidth: 360 } : undefined}>
      <input className="input" type="email" autoComplete="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="input" type="password" autoComplete="current-password" placeholder="Mot de passe (6 caractères min.)" value={pw} onChange={(e) => setPw(e.target.value)} />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "…" : "Se connecter"}</button>
        <button className="btn" type="button" disabled={busy} onClick={() => run(signUp)}>Créer mon compte</button>
      </div>
      {msg && <div className="hint" style={{ color: msg.startsWith("Compte créé") ? "var(--accent)" : "var(--urgent)" }}>{msg}</div>}
    </form>
  );
}

/** Écran d'accueil de la version iPhone tant qu'on n'est pas connecté. */
export function LoginScreen() {
  return (
    <div className="login-screen">
      <div className="login-card">
        <BrandMark size={40} />
        <div className="brand-name" style={{ marginTop: 14, fontSize: 13 }}>CHARLES</div>
        <p className="hint" style={{ textAlign: "center", margin: "10px 0 20px", fontSize: 13 }}>
          Connectez-vous avec le même compte que sur votre ordinateur : vos tâches, rendez-vous et journée type se synchronisent.
        </p>
        <AccountForm />
      </div>
    </div>
  );
}

/** Section « Synchronisation » des paramètres. */
export function SyncSettings() {
  const s = useSync();
  if (!cloudConfigured) {
    return (
      <div className="set-group">
        <span className="eyebrow">Synchronisation iPhone</span>
        <div className="set-row"><div className="l"><b><CloudOff size={14} style={{ verticalAlign: -2 }} /> Non configurée</b>
          <small>Cette version n'a pas encore l'adresse Supabase (variables GitHub). Voir docs/IPHONE.md.</small></div></div>
      </div>
    );
  }
  return (
    <div className="set-group">
      <span className="eyebrow">Synchronisation iPhone</span>
      {s.email ? (
        <div className="set-row">
          <div className="l">
            <b><Cloud size={14} style={{ verticalAlign: -2, color: "var(--accent)" }} /> Connecté · {s.email}</b>
            <small>
              {s.error ? <span style={{ color: "var(--urgent)" }}>{s.error}</span>
                : s.syncing ? "Synchronisation…"
                  : s.lastSync ? `Dernière synchro : ${new Date(s.lastSync).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "En attente"}
            </small>
          </div>
          <button className="btn" onClick={() => syncNow()} disabled={s.syncing}><RefreshCw size={13} /> Synchroniser</button>
          <button className="btn ghost" onClick={() => signOut()}>Déconnexion</button>
        </div>
      ) : (
        <div className="set-row" style={{ alignItems: "flex-start" }}>
          <div className="l"><b>Un compte pour retrouver Charles sur l'iPhone</b><small>Gratuit. Vos données restent aussi sur cet ordinateur.</small></div>
          <AccountForm compact />
        </div>
      )}
    </div>
  );
}
