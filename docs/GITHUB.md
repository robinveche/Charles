# Charles sur GitHub : plus jamais de compilation à la main

Une fois en place, chaque nouvelle version se publie toute seule et Charles propose « Mettre à jour » sur ton PC.

## Mise en place (une seule fois, environ 15 min)

1. **Compte GitHub** : créer un compte gratuit sur https://github.com (si tu n'en as pas).
2. **GitHub Desktop** : dans PowerShell `winget install GitHub.GitHubDesktop`, l'ouvrir et se connecter avec ton compte.
3. **Déplacer le dossier** (conseillé) : déplacer `charles` de Téléchargements vers `Documents` (ex. `C:\Users\Robin\Documents\charles`).
4. Dans GitHub Desktop : **File → Add local repository…** → choisir le dossier `charles`.
   Il dit que ce n'est pas encore un dépôt → cliquer **create a repository** → **Create repository**.
5. Cliquer **Publish repository** :
   - Name : `charles`
   - **Décocher « Keep this code private »** : les mises à jour automatiques ont besoin que les versions publiées soient accessibles. Le code ne contient aucune donnée personnelle (tes tâches restent sur ton PC).
6. Sur github.com, ouvrir ton dépôt `charles` → **Settings → Secrets and variables → Actions → New repository secret** :
   - Name : `TAURI_SIGNING_PRIVATE_KEY`
   - Secret : ouvrir le fichier `charles-updater.key` avec le Bloc-notes, tout copier, coller.
   - **Add secret**. Puis range ce fichier en lieu sûr (clé USB / gestionnaire de mots de passe) et ne le partage jamais : c'est lui qui prouve que les mises à jour viennent de toi.
7. Onglet **Actions** → **Release** → **Run workflow** → **Run workflow**. Attendre 10–15 min (pastille verte).
8. Onglet **Code** → à droite **Releases** → dernière version → télécharger `Charles_x.y.z_x64-setup.exe` et l'installer (par-dessus l'ancienne, tes données sont conservées).

C'est cette version-là qui sait se mettre à jour toute seule.

## Ensuite, pour chaque nouvelle version

1. Extraire le zip que Claude t'envoie **dans ton dossier `charles`** en remplaçant les fichiers.
2. GitHub Desktop affiche les fichiers modifiés → en bas à gauche, écrire un petit résumé → **Commit to main** → **Push origin**.
3. C'est tout. 10–15 min plus tard, Charles affiche « Charles x.y.z est disponible → Mettre à jour ».

(Paramètres → Mises à jour → **Rechercher** pour vérifier tout de suite.)
