import { visit } from 'unist-util-visit';

// Ouvre dans un nouvel onglet uniquement les liens vraiment externes (autre
// nom d'hôte que le site lui-même), et prévient les utilisateurs de lecteur
// d'écran via un texte masqué visuellement (cf. §11 skill.md : ne jamais
// ouvrir un nouvel onglet sans prévenir, exigence d'accessibilité non
// négociable sur ce site).
const SITE_HOSTNAME = 'tazfm.fr';

export function rehypeExternalLinks() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'a' || typeof node.properties?.href !== 'string') return;

      let url;
      try {
        url = new URL(node.properties.href, `https://${SITE_HOSTNAME}`);
      } catch {
        return;
      }
      if (!/^https?:$/.test(url.protocol) || url.hostname === SITE_HOSTNAME) return;

      node.properties.target = '_blank';
      node.properties.rel = ['noopener', 'noreferrer'];
      node.children.push({
        type: 'element',
        tagName: 'span',
        properties: { className: ['sr-only'], 'data-pagefind-ignore': true },
        children: [{ type: 'text', value: ' (nouvelle fenêtre)' }],
      });
    });
  };
}
