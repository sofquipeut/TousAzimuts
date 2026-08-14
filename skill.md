# Skill : le site Tous Azimuts (Astro + GitHub Pages)

Ce document décrit le fonctionnement complet du site du podcast/émission radio
**Tous Azimuts**, pour tout agent IA (Hermes, DeepSeek, Claude...) amené à y
publier du contenu, le déboguer ou le faire évoluer. Il remplace l'ancien
site WordPress.com.

**Propriétaire du site : Sofian.** Il est aveugle, navigue au clavier avec
NVDA (bureau) et VoiceOver (iPhone). L'accessibilité clavier/lecteur d'écran
est une exigence non négociable de tout changement — voir la section
« Contraintes impératives » en fin de document avant de toucher au code.

---

## 1. Vue d'ensemble de l'architecture

- **Générateur de site statique** : [Astro](https://astro.build) (v4). Le
  contenu (Markdown) est compilé en HTML statique à la construction, il n'y a
  pas de serveur applicatif ni de base de données.
- **Hébergement** : GitHub Pages, servi depuis le dépôt lui-même.
- **Dépôt GitHub** : `sofquipeut/TousAzimuts` (anciennement
  `emissiontousazimuts` — GitHub redirige automatiquement l'ancien nom vers
  le nouveau pour les appels API/git, donc les deux fonctionnent).
- **Branche de production** : `main`. Tout push sur `main` déclenche
  automatiquement une reconstruction et une republication du site (voir §5).
- **URL actuelle** : `https://sofquipeut.github.io/TousAzimuts/`
  (deviendra `https://tazfm.fr/` une fois le domaine acheté et configuré —
  voir §9).
- **Édition de contenu sans coder** : une interface d'administration Sveltia
  CMS est disponible sur `/admin/` (voir §6).
- **Recherche plein texte** : Pagefind, indexé automatiquement à chaque
  build (voir §7).

Il n'y a **aucune base de données, aucun backend, aucune dépendance à un
service tiers pour le fonctionnement du site lui-même** — tout est fichiers
texte (Markdown) versionnés dans Git. C'est un choix délibéré : robustesse,
gratuité, portabilité, et accessibilité (pas de widgets JS complexes sauf
strict nécessaire).

---

## 2. Structure des dossiers

```
├── astro.config.mjs          # config Astro (site, base path)
├── package.json              # scripts npm (dev, build, postbuild=pagefind)
├── .github/workflows/deploy.yml   # pipeline de déploiement GitHub Actions
├── public/
│   ├── admin/                # interface Sveltia CMS (index.html + config.yml)
│   ├── favicon.svg
│   └── images/uploads/       # images uploadées via le CMS
├── skill.md                  # ce document
└── src/
    ├── content/
    │   ├── config.ts         # schéma des collections (validation Zod)
    │   ├── saisons/           # un fichier .md par saison (saison-1.md, saison-2.md...)
    │   └── emissions/         # un fichier .md par émission (emission-174.md...)
    ├── components/
    │   ├── Header.astro      # en-tête : barre de thème + titre + nav
    │   ├── Footer.astro      # pied de page : réseaux sociaux + nav
    │   └── EmissionCard.astro # carte résumé d'une émission (listes)
    ├── layouts/
    │   └── Base.astro        # squelette HTML commun à toutes les pages
    ├── lib/
    │   └── url.ts            # helper withBase() — voir §10, point critique
    ├── pages/
    │   ├── index.astro       # accueil
    │   ├── [slug].astro      # page d'une saison (ex : /saison-9/)
    │   ├── emissions/[slug].astro  # page d'une émission (ex : /emissions/emission-174/)
    │   ├── podcast.astro     # page « s'abonner au podcast »
    │   ├── contact.astro
    │   └── recherche.astro   # page de recherche (Pagefind)
    └── styles/
        └── global.css        # tout le CSS du site (pas de framework CSS)
```

---

## 3. Modèle de contenu

Deux collections Astro, définies et validées dans `src/content/config.ts` :

### Collection `saisons`

Un fichier Markdown par saison, ex. `src/content/saisons/saison-9.md` :

```md
---
number: 9
years: "2025-2026"
ongoing: true
---
```

Champs :
- `number` (nombre, obligatoire) — numéro de saison, utilisé dans le slug de fichier (`saison-N.md`) qui devient l'URL (`/saison-N/`).
- `years` (texte, obligatoire) — ex. `"2025-2026"`.
- `ongoing` (booléen, défaut `false`) — une seule saison doit être marquée
  `true` à la fois : c'est elle qui est mise en avant dans le menu comme
  « saison en cours ».

**Numérotation** : on garde la numérotation officielle historique du
WordPress (Saisons 1 à 9 en 2026). La Saison 2 (2018-2019) est
intentionnellement vide — aucun conducteur d'archive n'a été retrouvé pour
cette période.

### Collection `emissions`

Un fichier Markdown par émission, ex. `src/content/emissions/emission-174.md` :

```md
---
title: "Émission 174"
number: 174
season: saison-9
pubDate: 2026-07-08T11:04:47Z
diffusion: "Diffusée sur Radio Mon Païs 90.1 FM le 03/07/2026 à 19h..."
audioUrl: "https://rss.com/podcasts/tous-azimuts-pour-un-monde-plus-accessible/3063891"
rssPlayerId: "3063891"
excerpt: "Résumé court affiché dans les listes et dans les résultats de recherche."
draft: false
---

Corps de l'article en Markdown : rubriques, invités, liens, playlist musicale...
```

Champs :
- `title` (texte, obligatoire).
- `number` (nombre, optionnel) — numéro d'émission affiché.
- `season` (référence vers `saisons`, obligatoire) — doit correspondre
  exactement au **nom de fichier sans extension** d'une saison existante
  (ex. `saison-9` pour `saison-9.md`).
- `pubDate` (date ISO, obligatoire) — date de publication, utilisée pour le
  tri (plus récent en premier).
- `diffusion` (texte, optionnel) — phrase libre décrivant les dates/heures
  de diffusion radio. Si absente, le site affiche automatiquement
  « Diffusée le [pubDate formatée] ».
- `audioUrl` (URL, optionnel) — lien d'écoute simple (bouton), utilisé
  **seulement si `rssPlayerId` est vide**.
- `rssPlayerId` (texte, optionnel) — identifiant numérique de l'épisode chez
  RSS.com (voir §8). S'il est présent, un lecteur audio intégré remplace le
  bouton `audioUrl`.
- `excerpt` (texte, obligatoire) — résumé court, utilisé dans les listes de
  la page de saison, sur l'accueil et comme meta-description SEO.
- `draft` (booléen, défaut `true`) — tant que `true`, l'émission n'apparaît
  **nulle part** sur le site public (ni page de saison, ni accueil, ni
  recherche), mais son URL directe reste accessible si on la devine. Mettre
  `false` pour publier réellement.
- Corps du fichier (après le `---` de fin) : le texte de l'émission en
  Markdown standard (titres, listes, liens, gras/italique).

**Important — fidélité du contenu** : les émissions déjà publiées ont été
migrées telles quelles depuis l'export WordPress, sans réécriture ni
enrichissement inventé. Toute nouvelle émission doit suivre la même règle :
ne jamais inventer de contenu (rubriques, invités, musiques...), ne
retranscrire que ce qui a été fourni par un humain.

---

## 4. Comment publier une nouvelle émission

Deux méthodes équivalentes, au choix.

### Méthode A — Interface Sveltia CMS (recommandée pour un humain, y compris non-technique)

1. Aller sur `https://sofquipeut.github.io/TousAzimuts/admin/`.
2. Se connecter avec un jeton d'accès personnel GitHub (fine-grained
   personal access token, droits de lecture/écriture sur le dépôt) — voir
   §6 pour le détail de l'authentification.
3. Choisir la collection « Émissions » → « Nouvelle émission ».
4. Remplir les champs (titre, numéro, saison, date, résumé, contenu...).
   Laisser « Brouillon » coché tant que l'émission n'est pas prête.
5. Décocher « Brouillon » et publier : Sveltia CMS crée/committe
   directement le fichier `.md` correspondant sur la branche `main` via
   l'API GitHub — ce qui déclenche automatiquement le redéploiement (§5).

### Méthode B — Agent IA (Hermes, DeepSeek, Claude...) via l'API GitHub

C'est la méthode à utiliser quand un agent IA reçoit pour instruction de
publier une émission à partir d'un conducteur fourni par Sofian (texte brut,
fichier Dropbox, etc.) :

1. Identifier le prochain numéro d'émission disponible et la saison en
   cours (`ongoing: true` dans `src/content/saisons/`).
2. Convertir le conducteur fourni en Markdown selon le gabarit du §3, **sans
   rien inventer** — ne remplir que ce qui est explicitement donné.
3. Créer le fichier `src/content/emissions/emission-N.md` (commit direct sur
   `main`, ou passer par une branche + pull request si l'agent n'a que des
   droits limités).
4. Si l'émission a un lecteur RSS.com, ajouter `rssPlayerId` (voir §8) ;
   sinon `audioUrl` si un lien d'écoute existe déjà, sinon rien (le site
   n'affichera simplement pas de bouton d'écoute).
5. Vérifier le déploiement GitHub Actions (workflow « Déploiement GitHub
   Pages », déclenché automatiquement sur push vers `main`) puis rapporter
   à Sofian l'URL finale pour qu'il teste avec son lecteur d'écran avant de
   considérer la tâche terminée — **un agent IA ne peut pas vérifier
   visuellement/à l'oreille le rendu final, seulement l'humain peut
   confirmer que c'est correct.**

---

## 5. Déploiement (GitHub Actions)

Fichier : `.github/workflows/deploy.yml`. Se déclenche sur chaque push vers
`main` (ou manuellement via `workflow_dispatch`).

Étapes : `npm install` → `npm run build` (qui lance `astro build` puis,
via le script `postbuild`, `pagefind --site dist` pour réindexer la
recherche) → publication du dossier `dist/` sur GitHub Pages via les actions
officielles `upload-pages-artifact` et `deploy-pages`.

**Prérequis one-shot déjà fait** : dans les réglages du dépôt GitHub
(Settings → Pages), la source doit être « GitHub Actions » (pas « Deploy
from a branch »). Ce réglage n'est exposé que sur le site web github.com,
pas via l'app mobile ni l'API — si jamais il doit être refait sur un
nouveau dépôt, seul un humain avec accès au navigateur peut le faire.

Un déploiement prend en général 1 à 3 minutes. Pour vérifier son statut :
lister les workflow runs de la branche `main` via l'API GitHub Actions
(`list_workflow_runs`), regarder le dernier run et son `conclusion`
(`success`/`failure`).

---

## 6. Administration de contenu : Sveltia CMS

Sveltia CMS est un CMS « headless » basé sur Git : il édite directement les
fichiers `.md` du dépôt via l'API GitHub, il n'y a pas de base de données
séparée. Deux fichiers le configurent :

- `public/admin/index.html` — charge le script Sveltia CMS
  (`https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js`).
- `public/admin/config.yml` — définit le backend (`github`,
  `repo: sofquipeut/emissiontousazimuts`, `branch: main`) et les champs de
  formulaire pour chaque collection (`emissions`, `saisons`), qui doivent
  rester synchronisés avec le schéma Zod de `src/content/config.ts`.

**Authentification** : configurée en mode « Sign In with Token » (le plus
simple, pas de service intermédiaire ni de compte OAuth séparé à gérer).
Chaque éditeur doit générer son propre jeton d'accès personnel *fine-grained*
sur GitHub (Settings → Developer settings → Personal access tokens), avec
accès en lecture/écriture limité au dépôt `TousAzimuts`, puis le coller dans
l'écran de connexion de `/admin/`.

**Point de vigilance non résolu** : si d'autres personnes que Sofian
(ex. Carinne) doivent éditer souvent, partager un unique jeton n'est pas une
bonne pratique (révocation impossible sans couper tout le monde, traçabilité
nulle). Deux options pour la suite : (a) chaque éditeur génère son propre
jeton, ou (b) mettre en place l'authentification OAuth complète de Sveltia
(nécessite un petit service relais, ex. le Cloudflare Worker officiel
`sveltia-cms-auth`, + une OAuth App GitHub enregistrée). Décision à prendre
avec Sofian selon la fréquence d'édition réelle des tiers.

---

## 7. Recherche (Pagefind)

[Pagefind](https://pagefind.app) indexe automatiquement tout le HTML généré
à chaque build (`postbuild` dans `package.json`). Aucune configuration de
contenu à faire — un nouveau fichier `.md` publié devient cherchable dès le
prochain déploiement.

**Détail d'implémentation important** : le widget packagé `PagefindUI` de
Pagefind ne fonctionnait pas de façon fiable/déboguable dans cet
environnement. La page `src/pages/recherche.astro` utilise donc un
formulaire HTML natif accessible (`<input type="search">` + `<button>`)
couplé à l'API bas niveau `pagefind.js` (`pagefind.init()`,
`pagefind.search(query)`) chargée dynamiquement via `import()`. Si la
recherche doit être modifiée un jour, repartir de cette page plutôt que de
réintroduire `PagefindUI`.

---

## 8. Lecteur audio RSS.com

Le podcast est hébergé sur [RSS.com](https://rss.com). Deux pièges à
connaître avant de toucher à ce système :

1. **L'URL MP3 directe fournie par le flux RSS est signée et expire au bout
   de 24h** — impossible de la figer dans un site statique généré une fois
   pour toutes. Ne jamais utiliser `<audio src="...">` avec cette URL.
2. La solution retenue est le **lecteur intégré natif de RSS.com** (iframe),
   dont l'URL ne change pas dans le temps :
   ```
   https://player.rss.com/{show-slug}/{episode-id}?theme=color&v=2&share=false&about=false
   ```
   - `show-slug` est fixe : `tous-azimuts-pour-un-monde-plus-accessible`
     (codé en dur dans `src/pages/emissions/[slug].astro`).
   - `episode-id` est le champ `rssPlayerId` du frontmatter de l'émission
     — visible dans l'URL de partage RSS.com (`.../podcasts/{show-slug}/{episode-id}/`)
     ou dans le code d'intégration fourni par RSS.com (menu Partager →
     Intégrer).
   - Tant qu'une émission n'a pas de `rssPlayerId`, le site retombe sur le
     bouton simple `audioUrl` s'il existe.

**Limite connue, hors de notre contrôle** : le lecteur RSS.com (contenu
d'une iframe cross-origin) a des défauts d'accessibilité de son côté
(boutons étiquetés `icon_play`/`icon_backward`, logo étiqueté `whiteTex`) —
signalés à leur support par Sofian. On ne peut pas modifier le DOM d'une
iframe tierce depuis notre site ; seul RSS.com peut corriger ça.

---

## 9. Domaine personnalisé (à faire)

Le domaine `tazfm.fr` n'est pas encore acheté/configuré. Prérequis déjà
préparés dans `astro.config.mjs` (commenté). Une fois le domaine acheté :

1. Configurer les DNS chez le registrar (enregistrements A vers les IP
   GitHub Pages, ou CNAME pour un sous-domaine).
2. Ajouter un fichier `public/CNAME` contenant `tazfm.fr`.
3. Changer dans `astro.config.mjs` : `site: 'https://tazfm.fr'` et
   `base: '/'` (au lieu de `/TousAzimuts`).
4. Redéployer, puis activer « Enforce HTTPS » dans Settings → Pages une
   fois le certificat émis.

Une fois actif, GitHub Pages redirige **automatiquement** toute URL
`sofquipeut.github.io/TousAzimuts/...` vers `tazfm.fr/...`, y compris pour
chaque sous-page (émissions, saisons, recherche, `/admin/`), sans code
supplémentaire de notre part.

---

## 10. Contraintes impératives — à lire avant tout changement

1. **Toujours utiliser `withBase()` (`src/lib/url.ts`) pour tout lien
   interne**, jamais un chemin en dur (`/saison-1/`). Le site est actuellement
   servi sous un sous-chemin (`/TousAzimuts`) : un lien codé en dur casse dès
   que le `base` change (ce qui s'est déjà produit : bug 404 corrigé).
2. **Accessibilité clavier/lecteur d'écran non négociable.** Tout élément
   interactif doit être un élément HTML natif (`<button>`, `<a>`,
   `<input>`) chaque fois que possible. Éviter les widgets JS tiers
   packagés (l'expérience avec `PagefindUI`, non débogable, en est la
   preuve) : préférer une implémentation maison minimale avec les API bas
   niveau, plus lente à écrire mais vérifiable et robuste.
3. **Ne jamais inventer de contenu.** Toute émission, tout texte publié
   doit venir d'une source fournie par un humain (conducteur, export
   WordPress...). En cas de doute ou d'information manquante, demander
   plutôt que de compléter par supposition.
4. **Contraste des couleurs et thème clair/sombre** : les couleurs vivent
   dans des variables CSS (`src/styles/global.css`, section `:root`).
   Distinguer les couleurs « de remplissage » (fond coloré + texte blanc
   fixe : `--color-brand`, `--color-accent`) des couleurs « de texte sur
   fond de page » (`--color-link`, `--color-link-hover`, qui changent entre
   thème clair et sombre pour rester conformes au contraste WCAG AA
   4,5:1). Ne pas mélanger les deux rôles en ajoutant de nouvelles couleurs.
5. **Aucune vérification visuelle/auditive possible par un agent IA sans
   accès navigateur.** Toute tâche impliquant un rendu (mise en page,
   lecteur audio, contraste réel perçu) doit se conclure en demandant à
   Sofian (ou à un autre humain) de tester et de confirmer, jamais en
   affirmant que « ça marche » sans confirmation humaine.
6. **Toujours committer sur `main` en clair** (pas de secrets, tokens ou
   identifiants dans le dépôt). Les jetons d'accès Sveltia CMS restent côté
   client (stockage navigateur de l'éditeur), jamais dans le code.

---

## 11. Historique / décisions déjà prises (pour ne pas les rouvrir sans raison)

- Générateur choisi : **Astro** (plutôt qu'Eleventy).
- Commentaires des visiteurs : renvoyés vers la **page Facebook**
  (`facebook.com/tous.azimuts.9`), pas de système de commentaires intégré
  au site (pour ne pas obliger les visiteurs à créer un compte GitHub ou
  autre).
- CMS choisi : **Sveltia** (pas Decap — les deux sont interchangeables mais
  un seul suffit et alourdirait le dépôt sans bénéfice).
- Numérotation des saisons : celle du WordPress d'origine, Saison 2 laissée
  vide plutôt que renumérotée.
- Le podcast est en cours de migration progressive vers RSS.com (une seule
  émission, la 174, y est disponible à ce jour) ; le flux RSS affiché sur la
  page `/podcast/` est encore l'ancien flux Anchor.fm et devra être mis à
  jour une fois la bascule complète.
