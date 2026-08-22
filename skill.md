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
  contenu (Markdown) est compilé en HTML statique à la construction.
- **Hébergement** : GitHub Pages, servi depuis le dépôt lui-même.
- **Dépôt GitHub** : `sofquipeut/TousAzimuts` (anciennement
  `emissiontousazimuts` — GitHub redirige automatiquement l'ancien nom vers
  le nouveau pour les appels API/git, donc les deux fonctionnent).
- **Branche de production** : `main`. Tout push sur `main` déclenche
  automatiquement une reconstruction et une republication du site (voir §5).
- **URL de production** : `https://tazfm.fr/` (domaine personnalisé actif,
  voir `public/CNAME` et `astro.config.mjs` : `site: 'https://tazfm.fr'`,
  `base: '/'`). L'ancienne URL `sofquipeut.github.io/TousAzimuts/` redirige
  automatiquement vers ce domaine.
- **Édition de contenu sans coder** : interface d'administration Sveltia CMS
  sur `/admin/site/`, accessible depuis une page d'accueil d'administration
  `/admin/` (voir §6).
- **Recherche plein texte** : Pagefind, indexé automatiquement à chaque
  build (voir §9).
- **Commentaires visiteurs** : système « maison » (Cloudflare Worker + D1 +
  email), pas de compte requis (voir §7).
- **Tags et maillage thématique** : chaque émission peut porter des tags
  (liste fermée de 24) permettant un bloc « Émissions sur les mêmes
  thèmes », des liens « publié dans » et des pages de catégorie `/tags/*`
  (voir §4).

Le site lui-même (contenu, navigation) ne dépend d'aucune base de données ni
backend applicatif : tout est fichiers texte (Markdown) versionnés dans Git.
Seul le système de commentaires (optionnel, isolé) utilise une brique
serveur externe (Cloudflare Worker + D1), documentée au §7.

---

## 2. Structure des dossiers

```
├── astro.config.mjs          # config Astro (site, base path)
├── package.json              # scripts npm (dev, build, postbuild=pagefind)
├── skill.md                  # ce document
├── .github/workflows/
│   ├── deploy.yml                    # build + publication GitHub Pages (push sur main)
│   ├── deploy-comments-worker.yml    # redéploie le Worker si worker/** change (push sur main)
│   ├── setup-comments-worker.yml     # provisioning initial du Worker (D1, secrets) — one-shot, workflow_dispatch
│   └── set-admin-token.yml           # (re)définit le secret ADMIN_TOKEN du Worker — workflow_dispatch
├── public/
│   ├── CNAME                  # tazfm.fr
│   ├── admin/
│   │   ├── index.html         # page d'accueil admin : 2 liens (site / commentaires)
│   │   └── site/               # interface Sveltia CMS proprement dite (index.html + config.yml)
│   └── images/uploads/        # images uploadées via le CMS
├── worker/                    # Worker Cloudflare des commentaires (voir §7)
│   ├── src/index.js
│   ├── schema.sql
│   ├── wrangler.toml
│   └── README.md
└── src/
    ├── content/
    │   ├── config.ts          # schéma des collections (validation Zod)
    │   ├── saisons/            # un fichier .md par saison (saison-1.md, saison-2.md...)
    │   └── emissions/          # un fichier .md par émission (emission-174.md...)
    ├── components/
    │   ├── Header.astro       # en-tête : barre de thème + titre + nav
    │   ├── Footer.astro       # pied de page : réseaux sociaux + nav
    │   ├── EmissionCard.astro # carte résumé d'une émission (listes)
    │   ├── ShareLinks.astro   # liens de partage (réseaux sociaux) d'une émission
    │   ├── SimilarEpisodes.astro # bloc "Émissions sur les mêmes thèmes" (voir §4)
    │   └── Comments.astro     # bloc commentaires (formulaire + liste), voir §7
    ├── layouts/
    │   └── Base.astro         # squelette HTML commun à toutes les pages
    ├── lib/
    │   ├── url.ts             # helper withBase() — voir §10, point critique
    │   ├── tags.ts            # table slug -> libellé accentué des tags (voir §4)
    │   └── comments.ts        # URL de base de l'API du Worker commentaires (voir §7)
    ├── pages/
    │   ├── index.astro        # accueil (saisons + liste des sujets/tags)
    │   ├── [slug].astro        # page d'une saison (ex : /saison-9/)
    │   ├── emissions/[slug].astro  # page d'une émission (ex : /emissions/emission-174/)
    │   ├── tags/[tag].astro    # page d'une catégorie (ex : /tags/sante/), voir §4
    │   ├── podcast.astro       # page « s'abonner au podcast »
    │   ├── contact.astro       # formulaire de contact (Formspree, indépendant du reste)
    │   ├── merci.astro         # page de remerciement après envoi du formulaire de contact
    │   └── recherche.astro     # page de recherche (Pagefind)
    └── styles/
        └── global.css          # tout le CSS du site (pas de framework CSS)
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
tags: ["deficience-visuelle", "technologie", "culture"]
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
- `tags` (tableau de chaînes, défaut `[]`) — voir §4, système de tags et de
  maillage thématique.
- `draft` (booléen, défaut `true`) — tant que `true`, l'émission n'apparaît
  **nulle part** sur le site public (ni page de saison, ni accueil, ni
  recherche, ni pages de tags), mais son URL directe reste accessible si on
  la devine. Mettre `false` pour publier réellement.
- Corps du fichier (après le `---` de fin) : le texte de l'émission en
  Markdown standard (titres, listes, liens, gras/italique).

**Important — fidélité du contenu** : les émissions déjà publiées ont été
migrées telles quelles depuis l'export WordPress, sans réécriture ni
enrichissement inventé. Toute nouvelle émission doit suivre la même règle :
ne jamais inventer de contenu (rubriques, invités, musiques...), ne
retranscrire que ce qui a été fourni par un humain.

**État actuel (référence)** : 149 émissions publiées au total, couvrant les
saisons 1, 3 à 9 (la saison 2 n'a pas de conducteur retrouvé). Toutes les
149 sont taguées. Quelques trous de numérotation sont normaux et documentés,
pas des oublis : l'émission n°17 (audio dupliqué du n°16, jamais résolu),
la saison 2 entière (20-38), et les numéros 58 et 153-156 (aucun conducteur
correspondant dans les archives Dropbox).

---

## 4. Système de tags et maillage thématique

Objectif : aider un visiteur à retrouver d'autres émissions sur un sujet qui
l'intéresse, sans base de données ni recherche complexe — uniquement via
des tags statiques calculés au moment du build.

### Taxonomie (liste fermée, 24 tags)

Deux familles : 10 tags de type de handicap (`deficience-visuelle`,
`deficience-auditive`, `handicap-moteur`, `polyhandicap`, `autisme`,
`handicap-intellectuel`, `handicap-psychique`, `troubles-dys`,
`maladie-chronique`, `handicap-invisible`) et 14 tags de sujet
(`technologie`, `accessibilite-numerique`, `audiodescription`, `braille`,
`culture`, `sport`, `legislation`, `emploi`, `education`,
`vie-quotidienne`, `sante`, `aidants`, `temoignage`, `international`).

La liste est **volontairement fermée** (pas de saisie libre dans le CMS) :
ça évite les tags dupliqués/mal orthographiés (`sante` vs `Santé` vs
`santé`) et les tags orphelins qui ne rapprocheraient jamais aucune
émission. Si un vrai nouveau sujet récurrent apparaît plus tard, ajouter le
tag **aux deux endroits suivants, en même temps** :
1. `public/admin/site/config.yml` — options du champ `tags` (widget
   `select`, `multiple: true`), avec `{ label: "Libellé accentué",
   value: "slug-ascii" }`.
2. `src/lib/tags.ts` — objet `TAG_LABELS`, même paire `slug -> libellé`.

Ces deux fichiers doivent rester synchronisés à la main (rien ne les génère
l'un depuis l'autre) : c'est la seule dette de maintenance introduite par ce
système.

### Convention slug vs libellé

- **Valeur stockée en frontmatter et utilisée dans les URLs** : toujours en
  ASCII, minuscules, kebab-case, sans accent (`sante`, `deficience-visuelle`).
  Ça évite les soucis d'encodage d'URL (`/tags/sante/`) et reste cohérent
  avec le reste des slugs du site (saisons, émissions).
- **Libellé affiché** : français complet avec accents (`Santé`,
  `Déficience visuelle`), résolu via `tagLabel(slug)` (`src/lib/tags.ts`).
  Le visiteur ne voit jamais la valeur brute.

### Comment un tag est saisi

- **Via le CMS Sveltia** (`/admin/site/`) : liste déroulante fermée,
  aucune saisie possible — zéro risque de faute de frappe ou de doublon.
- **En éditant le Markdown à la main** : il faut recopier exactement la
  valeur ASCII de `src/lib/tags.ts` / `config.yml`. Une valeur qui n'existe
  pas dans cette liste ne casse rien au build (le schéma Zod accepte tout
  `string`), mais ce tag reste inerte : pas de page `/tags/...` générée
  pour lui, pas de rapprochement possible avec d'autres émissions.

### Ce que ça affiche sur le site

1. **`src/components/SimilarEpisodes.astro`**, inséré en bas de chaque page
   d'émission (`src/pages/emissions/[slug].astro`) : calcule, parmi toutes
   les émissions publiées, celles qui partagent **au moins 2 tags** avec
   l'émission courante, trie par nombre de tags partagés puis par date
   décroissante, affiche les 5 premières sous le titre « Émissions sur les
   mêmes thèmes ». N'affiche rien si aucune émission ne matche (pas
   d'erreur, section simplement absente). Les tags eux-mêmes ne sont **pas**
   affichés en clair dans ce bloc (choix explicite : juste le titre des
   émissions).
2. **Ligne « publié dans »** en haut de chaque page d'émission (juste sous
   le `<h1>`), qui liste les tags de l'émission courante comme des liens
   cliquables vers `/tags/{slug}/`.
3. **Pages de catégorie** `src/pages/tags/[tag].astro` : une page par tag
   *effectivement utilisé* par au moins une émission publiée (générées via
   `getStaticPaths()` à partir de la collection `emissions`, pas depuis la
   liste complète des 24 — un tag jamais utilisé n'a pas de page morte).
   Chaque page liste, triées par date décroissante, toutes les émissions
   publiées portant ce tag.
4. **Section « Sujets abordés »** sur la page d'accueil (`src/pages/index.astro`) :
   liste (triée alphabétiquement sur le libellé français) de tous les tags
   utilisés par au moins une émission publiée, chacun en lien vers sa page
   de catégorie.

### Maintenance récurrente que ça implique

La seule tâche qui revient à **chaque nouvelle émission publiée** : lui
attribuer des tags pertinents dans le CMS (ou à la main dans le Markdown, en
respectant les valeurs ASCII exactes). Sans ça, l'émission reste
publiée normalement mais n'apparaît dans aucun bloc « Émissions sur les
mêmes thèmes », aucune ligne « publié dans », aucune page de catégorie —
dégradation silencieuse, pas d'erreur de build.

---

## 5. Comment publier une nouvelle émission

Deux méthodes équivalentes, au choix.

### Méthode A — Interface Sveltia CMS (recommandée pour un humain, y compris non-technique)

1. Aller sur `https://tazfm.fr/admin/`, puis cliquer sur « Gérer le site »
   (renvoie vers `/admin/site/`, l'interface Sveltia CMS proprement dite).
2. Se connecter avec un jeton d'accès personnel GitHub (fine-grained
   personal access token, droits de lecture/écriture sur le dépôt) — voir
   §6 pour le détail de l'authentification.
3. Choisir la collection « Émissions » → « Nouvelle émission ».
4. Remplir les champs (titre, numéro, saison, date, résumé, **tags** —
   voir §4, contenu...). Laisser « Brouillon » coché tant que l'émission
   n'est pas prête.
5. Décocher « Brouillon » et publier : Sveltia CMS crée/committe
   directement le fichier `.md` correspondant sur la branche `main` via
   l'API GitHub — ce qui déclenche automatiquement le redéploiement (§8).

### Méthode B — Agent IA (Hermes, DeepSeek, Claude...) via l'API GitHub

C'est la méthode à utiliser quand un agent IA reçoit pour instruction de
publier une émission à partir d'un conducteur fourni par Sofian (texte brut,
fichier Dropbox, etc.) :

1. Identifier le prochain numéro d'émission disponible et la saison en
   cours (`ongoing: true` dans `src/content/saisons/`).
2. Convertir le conducteur fourni en Markdown selon le gabarit du §3, **sans
   rien inventer** — ne remplir que ce qui est explicitement donné.
3. Choisir 2 à 7 tags pertinents parmi la liste fermée de `src/lib/tags.ts`
   (voir §4) à partir du contenu réel du conducteur — ne pas inventer de
   thème absent du conducteur.
4. Créer le fichier `src/content/emissions/emission-N.md` (commit direct sur
   `main`, ou passer par une branche + pull request si l'agent n'a que des
   droits limités).
5. Si l'émission a un lecteur RSS.com, ajouter `rssPlayerId` (voir §9) ;
   sinon `audioUrl` si un lien d'écoute existe déjà, sinon rien (le site
   n'affichera simplement pas de bouton d'écoute).
6. Vérifier le déploiement GitHub Actions (workflow « Déploiement GitHub
   Pages », déclenché automatiquement sur push vers `main`) puis rapporter
   à Sofian l'URL finale pour qu'il teste avec son lecteur d'écran avant de
   considérer la tâche terminée — **un agent IA ne peut pas vérifier
   visuellement/à l'oreille le rendu final, seulement l'humain peut
   confirmer que c'est correct.**

---

## 6. Administration de contenu : Sveltia CMS

Sveltia CMS est un CMS « headless » basé sur Git : il édite directement les
fichiers `.md` du dépôt via l'API GitHub, il n'y a pas de base de données
séparée. Fichiers concernés :

- `public/admin/index.html` — page d'accueil d'administration : deux liens,
  « Gérer le site » (→ `/admin/site/`) et « Gérer les commentaires »
  (→ interface d'admin du Worker, §7). **Cette page contient en clair le
  jeton `coms_token` d'administration des commentaires** — voir la mise en
  garde correspondante au §7.
- `public/admin/site/index.html` — charge le script Sveltia CMS
  (`https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js`).
- `public/admin/site/config.yml` — définit le backend (`github`,
  `repo: sofquipeut/emissiontousazimuts`, `branch: main`) et les champs de
  formulaire pour chaque collection (`emissions`, `saisons`), qui doivent
  rester synchronisés avec le schéma Zod de `src/content/config.ts` **et**,
  pour le champ `tags`, avec `src/lib/tags.ts` (voir §4).

**Authentification** : configurée en mode « Sign In with Token » (le plus
simple, pas de service intermédiaire ni de compte OAuth séparé à gérer).
Chaque éditeur doit générer son propre jeton d'accès personnel *fine-grained*
sur GitHub (Settings → Developer settings → Personal access tokens), avec
accès en lecture/écriture limité au dépôt `TousAzimuts`, puis le coller dans
l'écran de connexion de `/admin/site/`.

**Point de vigilance non résolu** : si d'autres personnes que Sofian
(ex. Carinne) doivent éditer souvent, partager un unique jeton n'est pas une
bonne pratique (révocation impossible sans couper tout le monde, traçabilité
nulle). Deux options pour la suite : (a) chaque éditeur génère son propre
jeton, ou (b) mettre en place l'authentification OAuth complète de Sveltia
(nécessite un petit service relais, ex. le Cloudflare Worker officiel
`sveltia-cms-auth`, + une OAuth App GitHub enregistrée). Décision à prendre
avec Sofian selon la fréquence d'édition réelle des tiers.

---

## 7. Commentaires visiteurs (Cloudflare Worker + D1 + Resend)

Système de commentaires « maison », indépendant du reste du site (aucun
compte visiteur requis). Composants :

- **`worker/src/index.js`** — Worker Cloudflare, seul point d'entrée
  applicatif de tout le projet. Routes :
  - `POST /api/comments` — reçoit un commentaire (`pageId`, `pageUrl`,
    `pageTitle`, `name`, `body`), le stocke en base avec `status: pending`,
    envoie un email de notification via Resend avec deux liens signés
    (HMAC-SHA256, secret `MODERATION_SECRET`) : Approuver / Rejeter. Anti-spam
    en deux temps : champ honeypot `website` (doit rester vide) + délai
    minimum de 2 secondes entre l'affichage du formulaire et l'envoi.
  - `GET /api/comments?pageId=...` — retourne uniquement les commentaires
    `status: approved` d'une page.
  - `GET /api/moderate?id&action&token` — lien cliqué depuis l'email :
    bascule le commentaire en `approved` ou `rejected` si le token HMAC est
    valide.
  - `GET /admin?coms_token=...` — tableau HTML de tous les commentaires
    (tous statuts), avec cases à cocher et actions groupées (approuver /
    rejeter / supprimer), protégé par le secret `ADMIN_TOKEN` en query
    string.
  - `POST /admin/bulk` — traite les actions groupées du tableau ci-dessus.
- **`worker/schema.sql`** — une seule table `comments` (D1/SQLite) :
  `id, page_id, page_url, page_title, author_name, body, status,
  created_at`.
- **`worker/wrangler.toml`** — config Cloudflare : nom du Worker
  (`taz-comments`), binding D1, variables publiques (`ALLOWED_ORIGIN:
  https://tazfm.fr`, `NOTIFY_TO_EMAIL: radiotousazimuts@gmail.com`,
  `NOTIFY_FROM_EMAIL: notifications@tazfm.fr`). Les secrets
  (`RESEND_API_KEY`, `MODERATION_SECRET`, `ADMIN_TOKEN`) ne sont **jamais**
  dans ce fichier, uniquement via `wrangler secret put`.
- **`src/lib/comments.ts`** — `COMMENTS_API_BASE`, l'URL publique du Worker
  déployé (`https://taz-comments.hellosof.workers.dev`). Si cette constante
  est vidée, `src/components/Comments.astro` n'affiche plus rien du tout
  (interrupteur simple pour désactiver la fonctionnalité).
- **`src/components/Comments.astro`** — formulaire + liste, injecté en bas
  de chaque page d'émission. Accessible : `aria-live` sur la liste et sur
  les messages de statut, honeypot masqué par CSS (pas `display:none`, pour
  ne pas casser certains lecteurs d'écran), focus programmatique du message
  de statut après soumission.

**Déploiement du Worker** : automatique via
`.github/workflows/deploy-comments-worker.yml` sur tout push à `main` qui
touche `worker/**`. Le provisioning initial (création de la base D1,
chargement du schéma, définition des secrets, premier `wrangler deploy`) a
déjà été fait une fois via `.github/workflows/setup-comments-worker.yml`
(workflow manuel, `workflow_dispatch`) — à ne relancer que si la base D1
doit être recréée de zéro. `set-admin-token.yml` permet de re-générer/
redéfinir uniquement le secret `ADMIN_TOKEN` sans tout redéployer.

**Mise en garde de sécurité connue, non corrigée** : le lien « Gérer les
commentaires » de `public/admin/index.html` contient le `coms_token`
**en clair, committé dans le dépôt public**. N'importe qui trouvant ce
fichier peut approuver/rejeter/supprimer n'importe quel commentaire (mais
ne peut ni éditer le contenu du site, ni lire les secrets Cloudflare/Resend
réels — seul ce jeton de confort est exposé). Accepté comme compromis pour
l'instant (praticité pour Sofian), mais à corriger si ça devient gênant :
régénérer le jeton via `set-admin-token.yml` invalide instantanément l'ancien
lien.

---

## 8. Recherche (Pagefind)

[Pagefind](https://pagefind.app) indexe automatiquement tout le HTML généré
à chaque build (`postbuild` dans `package.json`). Aucune configuration de
contenu à faire — un nouveau fichier `.md` publié devient cherchable dès le
prochain déploiement (y compris les pages de tags, §4).

**Détail d'implémentation important** : le widget packagé `PagefindUI` de
Pagefind ne fonctionnait pas de façon fiable/déboguable dans cet
environnement. La page `src/pages/recherche.astro` utilise donc un
formulaire HTML natif accessible (`<input type="search">` + `<button>`)
couplé à l'API bas niveau `pagefind.js` (`pagefind.init()`,
`pagefind.search(query)`) chargée dynamiquement via `import()`. Si la
recherche doit être modifiée un jour, repartir de cette page plutôt que de
réintroduire `PagefindUI`.

---

## 9. Lecteur audio RSS.com

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

**État actuel** : la migration vers RSS.com est progressive (18 émissions
récentes ont un `rssPlayerId` à ce jour, les plus anciennes ont
au mieux un `audioUrl` externe ou aucun lien d'écoute). Le flux RSS affiché
sur la page `/podcast/` reflète encore l'ancien flux Anchor.fm par endroits
et devra être mis à jour une fois la bascule complète.

**Limite connue, hors de notre contrôle** : le lecteur RSS.com (contenu
d'une iframe cross-origin) a des défauts d'accessibilité de son côté
(boutons étiquetés `icon_play`/`icon_backward`, logo étiqueté `whiteTex`) —
signalés à leur support par Sofian. On ne peut pas modifier le DOM d'une
iframe tierce depuis notre site ; seul RSS.com peut corriger ça.

---

## 10. Déploiement (GitHub Actions)

Fichier : `.github/workflows/deploy.yml`. Se déclenche sur chaque push vers
`main` (ou manuellement via `workflow_dispatch`).

Étapes : `npm install` → `npm run build` (qui lance `astro build` puis,
via le script `postbuild`, `pagefind --site dist` pour réindexer la
recherche) → publication du dossier `dist/` sur GitHub Pages via les actions
officielles `upload-pages-artifact` et `deploy-pages`.

Le Worker de commentaires a son propre pipeline de déploiement, séparé
(voir §7) : `deploy-comments-worker.yml`, déclenché uniquement quand
`worker/**` change.

**Prérequis one-shot déjà fait** : dans les réglages du dépôt GitHub
(Settings → Pages), la source doit être « GitHub Actions » (pas « Deploy
from a branch »). Ce réglage n'est exposé que sur le site web github.com,
pas via l'app mobile ni l'API — si jamais il doit être refait sur un
nouveau dépôt, seul un humain avec accès au navigateur peut le faire.

Un déploiement prend en général 1 à 3 minutes. Pour vérifier son statut :
lister les workflow runs de la branche `main` via l'API GitHub Actions,
regarder le dernier run et son `conclusion` (`success`/`failure`).

---

## 11. Contraintes impératives — à lire avant tout changement

1. **Toujours utiliser `withBase()` (`src/lib/url.ts`) pour tout lien
   interne**, jamais un chemin en dur (`/saison-1/`). Un lien codé en dur
   casse si le `base` du site venait à changer à nouveau (déjà arrivé une
   fois : bug 404 corrigé).
2. **Accessibilité clavier/lecteur d'écran non négociable.** Tout élément
   interactif doit être un élément HTML natif (`<button>`, `<a>`,
   `<input>`) chaque fois que possible. Éviter les widgets JS tiers
   packagés (l'expérience avec `PagefindUI`, non débogable, en est la
   preuve) : préférer une implémentation maison minimale avec les API bas
   niveau, plus lente à écrire mais vérifiable et robuste.
3. **Ne jamais inventer de contenu.** Toute émission, tout texte publié,
   tout tag attribué doit venir d'une source fournie par un humain
   (conducteur, export WordPress...). En cas de doute ou d'information
   manquante, demander plutôt que de compléter par supposition.
4. **La liste des tags est fermée (§4).** Ne pas ajouter de tag à la volée
   dans une émission sans l'ajouter d'abord, à l'identique, dans
   `public/admin/site/config.yml` **et** `src/lib/tags.ts`.
5. **Contraste des couleurs et thème clair/sombre** : les couleurs vivent
   dans des variables CSS (`src/styles/global.css`, section `:root`).
   Distinguer les couleurs « de remplissage » (fond coloré + texte blanc
   fixe : `--color-brand`, `--color-accent`) des couleurs « de texte sur
   fond de page » (`--color-link`, `--color-link-hover`, qui changent entre
   thème clair et sombre pour rester conformes au contraste WCAG AA
   4,5:1). Ne pas mélanger les deux rôles en ajoutant de nouvelles couleurs.
6. **Aucune vérification visuelle/auditive possible par un agent IA sans
   accès navigateur.** Toute tâche impliquant un rendu (mise en page,
   lecteur audio, contraste réel perçu) doit se conclure en demandant à
   Sofian (ou à un autre humain) de tester et de confirmer, jamais en
   affirmant que « ça marche » sans confirmation humaine.
7. **Toujours committer sur `main` en clair** (pas de secrets, tokens ou
   identifiants dans le dépôt) — à l'exception connue et acceptée du
   `coms_token` de confort dans `public/admin/index.html` (voir §7), qui
   n'est **pas** un secret Cloudflare/Resend réel.

---

## 12. Historique / décisions déjà prises (pour ne pas les rouvrir sans raison)

- Générateur choisi : **Astro** (plutôt qu'Eleventy).
- CMS choisi : **Sveltia** (pas Decap — les deux sont interchangeables mais
  un seul suffit et alourdirait le dépôt sans bénéfice).
- Numérotation des saisons : celle du WordPress d'origine, Saison 2 laissée
  vide plutôt que renumérotée.
- Domaine personnalisé `tazfm.fr` acheté et configuré — le site n'est plus
  servi sous un sous-chemin GitHub Pages.
- Commentaires visiteurs : d'abord envisagé comme un simple renvoi vers la
  page Facebook, puis remplacé par un vrai système « maison » (Cloudflare
  Worker + D1 + Resend, §7) pour rester intégré au site sans exiger de
  compte tiers du visiteur.
- Système de tags + maillage thématique (§4) ajouté après la publication
  des 149 émissions historiques : taxonomie fermée de 24 tags conçue à
  partir d'un échantillon représentatif des conducteurs de toutes les
  saisons, puis appliquée rétroactivement à l'ensemble des émissions
  publiées. Les tags ne sont **jamais affichés en clair** dans le bloc de
  rapprochement (juste les titres des émissions similaires) ; ils sont en
  revanche cliquables sous forme de libellés français sur la ligne
  « publié dans » et sur les pages `/tags/*`.
- Le podcast est en cours de migration progressive vers RSS.com ; le flux
  RSS affiché sur la page `/podcast/` est encore partiellement l'ancien flux
  Anchor.fm et devra être mis à jour une fois la bascule complète.
