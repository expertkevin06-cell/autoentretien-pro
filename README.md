# AutoEntretien Pro

Application PWA/APK pour consulter des fiches de préconisations d’entretien automobile, avec complétion assistée par Gemini.

## Fonctionnalités

- Filtres par origine, marque, modèle, motorisation, année.
- Mode hors ligne via Service Worker.
- Sauvegarde locale via IndexedDB.
- Fond d’écran personnalisé.
- Génération PDF via impression système.
- Mode administrateur.
- Import/export de base JSON.
- Chargement d’une base distante.
- Complétion des fiches via Gemini.
- Complétion automatique à l’ouverture.
- Génération automatique de `database.generated.json` via GitHub Actions.

## Mot de passe admin

Le mot de passe admin par défaut est défini dans `data.js` :

```js
adminPassword: "Kevin83600"
