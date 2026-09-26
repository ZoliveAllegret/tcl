# TCL

Application Expo pour le réseau TCL de Lyon : recherche d’arrêts, prochains passages, horaires théoriques, lignes, favoris et carte des véhicules.

## Lancer

```bash
npm install
npx expo start --web
```

L’app s’ouvre sur `http://localhost:8081`. Pour y accéder depuis un téléphone sur le même Wi-Fi :

```bash
npx expo start --web --host lan
```

La carte web est une carte Leaflet. Sur iOS et Android, elle utilise `react-native-maps`, qui n’est pas inclus dans Expo Go : il faut un build de développement.

Vérifier le typage et les tests :

```bash
npx tsc --noEmit
npm test
npm run test:e2e
```

`test:e2e` exporte la PWA puis la sert en local. Le premier lancement installe Chromium : `npx playwright install chromium`.

## Écrans

- **Recherche** : arrêts par nom ou commune, favoris, puis arrêts autour de vous si la position est autorisée.
- **Lignes** : métro, tramway, bus et navettes, avec le nom long de la ligne et la liste des arrêts.
- **Carte** : véhicules en temps réel, filtrables par ligne. Le bus, le tramway et le métro ont chacun une silhouette.
- **Favoris** : arrêts enregistrés sur l’appareil.
- **Fiche arrêt** : passages temps réel et horaires théoriques dans les deux sens.

Les passages et les positions se rechargent toutes les 10 secondes. Le flux véhicules ne bouge souvent qu’environ toutes les 30 secondes.

## Données

Les identifiants et les URL sont dans `src/config.ts`. Le compte `demo` / `demo4dev` est celui documenté par le portail [data.grandlyon.com](https://data.grandlyon.com). Remplace-le par un compte personnel si le quota de démonstration sature.

| Usage | Source |
| --- | --- |
| Arrêts | `tcl_sytral.tclarret` |
| Passages temps réel | `tcl_sytral.tclpassagearret` |
| Positions des véhicules | SIRI-Lite `vehicle-monitoring` |
| Horaires et noms de lignes | GTFS TCL |
| Nom de commune affiché | [Base Adresse Nationale](https://api-adresse.data.gouv.fr), géocodage inverse à moins de 80 m |

La commune publiée par TCL suit parfois le point GPS juste derrière la limite communale. L’affichage reprend alors le nom de la commune BAN, sans modifier la donnée d’origine. Les arrondissements de Lyon ne sont pas remplacés.

Les favoris et le cache des arrêts (24 h) restent dans le navigateur ou sur l’appareil.

## PWA

`public/manifest.json` et `public/sw.js` permettent d’installer le site. Le service worker met en cache l’interface, pas les appels vers data.grandlyon.com. L’installation depuis l’écran d’accueil demande une adresse HTTPS.

Export du site statique :

```bash
npx expo export --platform web
```

Les fichiers sont dans `dist/`. Pour les servir avec les en-têtes de sécurité :

```bash
npm run export:web
npm run serve:web
```

Le serveur écoute sur `127.0.0.1:4173`. Sur une machine distante : `HOST=0.0.0.0 PORT=4173 npm run serve:web`, derrière HTTPS (un service worker et l’installation PWA l’exigent).
