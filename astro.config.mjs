import { defineConfig } from 'astro/config';

// Site hébergé sur GitHub Pages, servi via le domaine personnalisé tazfm.fr
// (voir public/CNAME). L'ancienne URL sofquipeut.github.io/TousAzimuts
// redirige automatiquement vers tazfm.fr une fois le domaine actif côté
// GitHub Pages.
export default defineConfig({
  site: 'https://tazfm.fr',
  base: '/',
});
