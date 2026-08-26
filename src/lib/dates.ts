// Affiche "2025 à 2026" plutôt que "2025-2026" : le tiret est mal
// interprété par certaines synthèses vocales (lu comme "moins" ou avalé).
export function formatYears(years: string): string {
  return years.replace(/^(\d{4})-(\d{4})$/, '$1 à $2');
}
