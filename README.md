# Tous Azimuts — site

Site du podcast **Tous Azimuts : pour un monde plus accessible**, reconstruit avec
[Astro](https://astro.build) pour remplacer l'ancien site sur le plan gratuit de
WordPress.com. Généré en site statique, hébergé sur GitHub Pages.

## Développement local

```bash
npm install
npm run dev
```

## Structure du contenu

- `src/content/saisons/` — une entrée par saison (numéro, années, saison en cours ou non).
- `src/content/emissions/` — une entrée par émission (frontmatter + conducteur en Markdown).
  Le champ `draft: true` masque une émission du site tant qu'elle n'est pas validée
  (équivalent du préfixe `publié-`/`OK-` utilisé jusqu'ici dans les conducteurs Dropbox).

## État actuel

- Structure du site répliquée depuis l'export WordPress (pages, saisons, gabarit d'émission).
- 11 émissions déjà publiées sur l'ancien site ont été migrées ici (Émissions 1, n°2, 65, 66,
  77, 78, 168, 171, 172, 173, 174).
- La Saison 2 (2018-2019) n'a aucune émission archivée — page laissée vide volontairement.
- Reste à faire : migrer les conducteurs déjà enrichis de liens dans le dossier Dropbox
  (saisons 2 à 9 + hors série, environ 140 émissions), ajouter le logo, brancher un CMS
  Git (Decap ou Sveltia) si besoin d'une interface d'édition pour Carinne, mettre à jour le
  flux RSS une fois la migration vers RSS.com terminée, et passer au domaine `tazfm.fr`
  quand il sera acheté (voir commentaire dans `astro.config.mjs`).

## Déploiement

Automatique via GitHub Actions (`.github/workflows/deploy.yml`) à chaque push sur `main`.
Penser à activer GitHub Pages avec la source « GitHub Actions » dans les réglages du dépôt.
