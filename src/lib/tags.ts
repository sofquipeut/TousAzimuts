// Table slug (valeur stockée en frontmatter) -> libellé affiché.
// Doit rester synchronisée avec les options du champ "tags" dans
// public/admin/site/config.yml (widget CMS à liste fermée).
export const TAG_LABELS: Record<string, string> = {
  'deficience-visuelle': 'Déficience visuelle',
  'deficience-auditive': 'Déficience auditive',
  'handicap-moteur': 'Handicap moteur',
  polyhandicap: 'Polyhandicap',
  autisme: 'Autisme',
  'handicap-intellectuel': 'Handicap intellectuel',
  'handicap-psychique': 'Handicap psychique',
  'troubles-dys': 'Troubles dys',
  'maladie-chronique': 'Maladie chronique',
  'handicap-invisible': 'Handicap invisible',
  technologie: 'Technologie',
  'accessibilite-numerique': 'Accessibilité numérique',
  audiodescription: 'Audiodescription',
  braille: 'Braille',
  culture: 'Culture',
  sport: 'Sport',
  legislation: 'Législation',
  emploi: 'Emploi',
  education: 'Éducation',
  'vie-quotidienne': 'Vie quotidienne',
  sante: 'Santé',
  aidants: 'Aidants',
  temoignage: 'Témoignage',
  international: 'International',
};

export function tagLabel(slug: string): string {
  return TAG_LABELS[slug] ?? slug;
}
