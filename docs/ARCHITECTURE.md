# Architecture de Charles

## Choix techniques
| Besoin | Choix | Pourquoi |
|---|---|---|
| Application de bureau légère | **Tauri 2** | Utilise WebView2, déjà présent dans Windows 10 et 11. Installeur d'environ 4 Mo contre plus de 80 Mo pour Electron, et 3 à 5 fois moins de RAM. |
| Interface | **React 19 + TypeScript**, CSS écrit à la main | Pas de framework CSS ni de librairie d'état : bundle d'environ 100 Ko gzip, rendu immédiat. |
| Stockage | **SQLite** (`tauri-plugin-sql`) en mode WAL | Fiable, transactionnel, lisible par n'importe quel outil, sauvegarde par `VACUUM INTO`. |
| Système | Plugins officiels Tauri : notification, global-shortcut, autostart, single-instance, window-state, opener | Maintenus par l'équipe Tauri, sans code natif maison à maintenir. |

## Trois fenêtres, une seule base de code
`main.tsx` lit l'étiquette de la fenêtre et affiche `App`, `CommandBar` ou `Widget`.
- **main** : toujours vivante, même cachée. Elle porte le **planificateur de notifications**. Le throttling WebView2 est désactivé (`additionalBrowserArgs`), donc les minuteries restent précises en arrière-plan.
- **quick** : transparente, toujours au premier plan, ouverte par Rust sur le raccourci global. Elle apparaît centrée sur l'écran où se trouve la souris.
- **widget** : transparente, hors de la barre des tâches. Trois calques possibles : *sur le bureau* (always-on-bottom), *normal*, *toujours au-dessus*. Position et taille sont mémorisées.

Chaque fenêtre garde son état en mémoire. Après chaque écriture, l'événement `charles://changed` est émis et les autres fenêtres se rechargent depuis SQLite, ce qui prend quelques millisecondes.

## Modèle de données
Tous les éléments (tâches et rendez-vous) vivent dans une seule table `items`. Le champ `kind` vaut `task` ou `event`.
Une règle unique pilote l'interface : *date + heure locales* (`date` YYYY-MM-DD, `time` HH:mm). Il n'y a pas de fuseau horaire à gérer en local, la conversion UTC se fera dans l'adaptateur de synchronisation.

Champs préparés pour la suite :
- `id` (UUID), `updatedAt`, `deletedAt` (suppression douce) : synchronisation multi-appareils en *last-write-wins*.
- `contactId` + table `contacts` : CRM léger (V2).
- `source` + `externalId` (index unique) : import Google Calendar sans doublons.
- table `sync_state` : curseurs et jetons de synchronisation.

**Récurrence** : une série = une seule ligne, qui porte la *prochaine* occurrence. Quand on la termine, une copie terminée (`seriesId` = la série) est créée et la série avance à la date suivante. Le calendrier calcule les occurrences futures à la volée. On ne génère donc jamais des centaines de lignes, et il n'y a rien à nettoyer.

**Notifications** : chaque envoi est mémorisé dans `firedKeys` (`date|heure|offset`). Déplacer un élément change la clé, ce qui reprogramme les rappels automatiquement.

## Feuille de route
**V1 (livrée)** : Aujourd'hui, saisie naturelle, command bar globale, catégories et priorités, retards et reports, notifications, calendrier jour/semaine/mois avec glisser-déposer, historique, recherche, widget, thèmes, sauvegardes.

**V2, déjà préparée :**
1. *Google Calendar* : créer `GoogleCalendarAdapter` (OAuth en mode « application de bureau », boucle locale). Il fera de l'import incrémental via `syncToken` stocké dans `sync_state`, puis un upsert sur `(source, externalId)`.
2. *Clients* : écran fiche contact (dernière interaction, prochaine action, historique). Il suffit de filtrer `items` par `contactId`.
3. *Compte et cloud* : implémenter `Repository` sur un backend (Supabase par exemple). La synchronisation pousse et tire les lignes `updatedAt > dernier_curseur`.
4. *Mises à jour automatiques* : plugin `tauri-plugin-updater` avec les releases GitHub.
5. *Signature de code* de l'installeur, pour supprimer l'avertissement SmartScreen.
