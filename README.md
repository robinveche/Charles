# CHARLES

Votre journée en un coup d'œil. Agenda, tâches et rappels pour Windows : rapide, discret, hors ligne.

**Tauri 2 + React + TypeScript + SQLite.** Installeur de quelques Mo, démarrage quasi instantané, bien plus léger qu'une application Electron.

---

## Obtenir `CharlesSetup.exe`

### Option A : sans rien installer (GitHub)
1. Créez un dépôt GitHub privé et poussez ce dossier.
2. Ouvrez l'onglet **Actions**, puis **Build Windows** et **Run workflow**.
3. Environ 10 min plus tard, téléchargez l'artefact **CharlesSetup** : il contient `CharlesSetup.exe`.

### Option B : sur votre PC
Prérequis, à installer une seule fois :
- **Node.js LTS** : `winget install OpenJS.NodeJS.LTS`
- **Rust** : `winget install Rustlang.Rustup`. L'installeur propose « Visual Studio C++ Build Tools » : acceptez.

Ensuite, faites un clic droit sur `scripts/build-windows.ps1` puis **Exécuter avec PowerShell**.
`CharlesSetup.exe` apparaît à la racine du projet.

### Développement (rechargement à chaud)
```bash
npm install
npm run tauri dev      # l'application complète
npm run dev            # interface seule dans le navigateur : http://localhost:1420/?demo=1
npm test               # 29 tests (parseur, retards, récurrences, reports)
```

---

## Utilisation

| Raccourci | Action |
|---|---|
| **Ctrl + Espace** | Ajout rapide, depuis n'importe où dans Windows |
| **Ctrl + Maj + Espace** | Afficher ou masquer le widget |
| **Ctrl + N** | Nouvelle tâche (formulaire complet) |
| **Ctrl + K** | Recherche globale et commandes |
| **Ctrl + 1…4** | Aujourd'hui, Calendrier, Tâches, Historique |
| **/** | Aller à la saisie rapide |
| **Maj + Entrée** | Dans la saisie rapide : ouvrir le détail avant de créer |
| **Échap** | Fermer |
| Calendrier : **← →**, **T**, **J / S / M** | Naviguer, revenir à aujourd'hui, passer en vue jour, semaine ou mois |

Tous les raccourcis se modifient dans **Paramètres**.

### Ce que comprend la saisie rapide
```
Relancer Lucas vendredi à 14h        → Relance client · ven. · 14:00
RDV Martin mardi 10h                 → Rendez-vous · mar. · 10:00
Envoyer dossier demain               → Tâche · demain
Appeler fournisseur dans 2 heures    → Appel · aujourd'hui · +2 h
Réunion client jeudi de 14h à 15h30  → Rendez-vous · 1 h 30
Sport tous les mardi et jeudi à 18h  → récurrent
Faire comptabilité tous les premiers du mois
Relancer prospects chaque lundi
Envoyer devis urgent   /   … !   /   … !!   → priorité importante ou urgente
Préparer pitch #spotwise              → catégorie personnalisée
ce soir · demain matin · cet après-midi · le 12 · 12/11 · 1er novembre · semaine prochaine
```

### Nouveautés 1.2
- **Durée dès la création** (bouton Durée : 15 min → 8 h, par demi-heure) ou en tapant « pendant 2h », « (1h30) ».
- **Projets** Spotwise / MP Finance / ICN (modifiables) : reconnus dans le titre ou via #spotwise ; **temps par projet** dans le Bilan.
- **Revue du soir** (18:00 par défaut) : trier ce qui reste, proposer les relances, voir demain, note du jour.
- **Relance automatique** : après un appel ou un RDV, « Relancer dans 3 j » en un clic (jours ouvrés).
- **Calendrier sans quadrillage**.
- **Mises à jour automatiques via GitHub** : voir [`docs/GITHUB.md`](docs/GITHUB.md).

### Nouveautés 1.1
- **Barre de type cliquable** sous la saisie : Tâche, RDV, Rappel, Appel… + Aujourd'hui / Demain / Date / Heure / Priorité. Dans Ctrl+Espace, **Tab** change de type.
- **Annotations** : cliquez sur une tâche pour écrire dessous (adresse, numéro, lien…). Liens, e-mails et numéros sont cliquables. Double-clic pour la fiche complète.
- **Journée type** (Calendrier → Journée type, ou Paramètres) : collez votre planning, il est répété chaque semaine. Blocs discrets, « En ce moment » en haut d'Aujourd'hui.
- **Bilan** : tâches terminées, rendez-vous, progression, semaine, répartition par catégorie, note du jour, historique.

### Règles de Charles
- **En retard** : une tâche horodatée passe « en retard » 30 min après son heure, une tâche datée le lendemain. Elle reste en haut tant qu'elle n'est pas traitée. Choix rapides : *Faire maintenant · +30 min · Cet après-midi · Demain · Choisir une date · Terminé*.
- **Rendez-vous** : un rendez-vous passé ne devient jamais « en retard ». Il rejoint l'historique.
- **Récurrences** : la tâche terminée part dans l'historique et la série passe automatiquement à la prochaine date.
- **Notifications** : rappels multiples par élément (à l'heure, 5, 15, 30 min, 1 h, 1 jour, ou personnalisé). Une relance arrive 1 h après une tâche oubliée, avec un résumé le matin. Si le PC était éteint, un seul récapitulatif s'affiche au démarrage, pas d'avalanche.
- **Fermer la fenêtre** = la cacher. Charles reste dans la barre système. Pour le quitter : clic droit sur l'icône, puis **Quitter**.

### Données
- Base locale : `%APPDATA%\app.charles.desktop\charles.db` (SQLite, mode WAL).
- Une sauvegarde complète par jour dans `…\backups\` (les 14 dernières sont conservées). Accès depuis **Paramètres → Système**.
- Aucun compte, aucune connexion requise.

---

## Structure du projet
```
src/
  core/            Logique pure, testée, sans interface
    types.ts         Modèle de données (Item, Category, Contact, Settings)
    parser.ts        Saisie naturelle en français
    selectors.ts     Aujourd'hui / retards / à venir / historique / recherche
    recurrence.ts    Calcul des occurrences
    dates.ts         Dates locales et libellés FR
  data/
    repository.ts    Interface de stockage (prête pour un futur stockage cloud)
    sqliteRepo.ts    SQLite (application Windows)
    localRepo.ts     localStorage (navigateur, démo)
    store.ts         État global, actions, annulation, synchro entre fenêtres
    scheduler.ts     Notifications (rappels, retards, résumé du matin)
  platform/          Pont vers Tauri (fenêtres, notifications, raccourcis)
  ui/
    App.tsx          Fenêtre principale (4 sections + paramètres)
    views/           Today, Calendar, Tasks, History, Settings
    windows/         CommandBar (Ctrl+Espace), Widget
    components/      QuickAdd, ItemRow, ItemEditor, Overlays…
  styles/global.css  Système visuel (sombre et clair)
src-tauri/
  src/lib.rs         Barre système, démarrage auto, instance unique
  src/windows.rs     Fenêtres principale, command bar et widget
  src/shortcuts.rs   Raccourcis globaux personnalisables
  src/db.rs          Schéma SQLite (migrations)
  tauri.conf.json    Fenêtres, installeur NSIS
```
Captures : [`docs/screenshots/`](docs/screenshots/). Détails techniques et feuille de route : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
