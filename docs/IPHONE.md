# Charles sur l'iPhone

Charles devient une appli web installée sur l'écran d'accueil, synchronisée avec le PC via Supabase (gratuit).

## 1. Créer le projet Supabase (une fois, ~10 min)
1. https://supabase.com → **New project** → nom `charles`, mot de passe de base (au choix, à garder), région **Paris (eu-west-3)** → Create.
2. Menu de gauche **SQL Editor** → **New query** → coller tout le fichier `docs/supabase.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email** : désactiver **Confirm email** → Save. (Plus simple : pas de mail de confirmation à cliquer.)
4. **Project Settings → Data API** (ou API) : noter
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon / public key** (longue clé `eyJ…`) — ou **publishable key** (`sb_publishable_…`) selon l'affichage, les deux marchent. Elle est faite pour être publique : la sécurité vient des règles « chacun ne voit que ses données ».

## 2. Donner ces deux valeurs à GitHub
Dépôt Charles → **Settings → Secrets and variables → Actions → onglet Variables → New repository variable** :
- `SUPABASE_URL` = l'URL du projet
- `SUPABASE_ANON_KEY` = la clé anon

## 3. Activer la page web
Dépôt Charles → **Settings → Pages** → Source : **GitHub Actions**.

## 4. Publier
Copier la nouvelle version dans `Documents\Charles` → GitHub Desktop → Commit → Push.
Au bout de ~10 min :
- le PC propose la mise à jour (avec la synchro) ;
- la version iPhone est en ligne sur `https://robinveche.github.io/Charles/`.

## 5. Se connecter
- **PC** : Paramètres → Synchronisation iPhone → e-mail + mot de passe → **Créer mon compte**. Tes données actuelles partent dans le cloud.
- **iPhone** : ouvrir `https://robinveche.github.io/Charles/` dans **Safari** → **Partager** (carré avec flèche) → **Sur l'écran d'accueil** → ouvrir l'icône Charles → **Se connecter** avec le même compte.

## Ce qui marche sur l'iPhone
Aujourd'hui, calendrier, tâches, bilan, revue du soir, journée type, ajout rapide, annotations — tout se synchronise en quelques secondes (et hors connexion, ça se rattrape au retour du réseau).

Pas encore : les notifications sur l'iPhone (elles restent sur le PC) et le widget d'écran d'accueil (réservé aux applis natives).
