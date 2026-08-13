import { defineConfig } from 'astro/config';

// Site hébergé sur GitHub Pages en attendant l'achat et la configuration
// du domaine tazfm.fr. Quand le domaine sera prêt : passer site à
// 'https://tazfm.fr' et base à '/', puis ajouter public/CNAME.
export default defineConfig({
  site: 'https://sofquipeut.github.io',
  base: '/emissiontousazimuts',
});
