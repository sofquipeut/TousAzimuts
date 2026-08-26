import { visit } from 'unist-util-visit';

// Ouvre dans un nouvel onglet uniquement les liens vraiment externes (autre
// nom d'hôte que le site lui-même). Pas d'annonce "(nouvelle fenêtre)" :
// retirée à la demande de Sofian (utilisateur NVDA), qui la trouvait pénible
// à l'usage sur un site où la quasi-totalité des liens sont externes.
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
    });
  };
}
