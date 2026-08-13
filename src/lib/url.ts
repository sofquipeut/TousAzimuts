// Petit helper pour préfixer les liens internes avec le "base" du site
// (utile tant que le site vit sous /emissiontousazimuts/ sur GitHub Pages ;
// deviendra un no-op quand on passera au domaine tazfm.fr avec base: '/').
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL;
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}
