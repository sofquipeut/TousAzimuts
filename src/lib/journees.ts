// Calcul des dates et rendu HTML du calendrier des journées mondiales.
// Utilisé à la construction (version de secours sans JavaScript) et dans le
// navigateur (dates réelles du jour du visiteur) : une seule logique pour les deux.
// Les dates sont des chaînes « AAAA-MM-JJ » : pas de fuseau horaire à gérer.

export type Regle =
  | { t: 'fixe'; m: number; j: number }
  | { t: 'dernier-jour'; m: number }
  // n-ième jour de la semaine du mois : w = 0 (dimanche) à 6 (samedi)
  | { t: 'nieme'; m: number; w: number; n: number }
  // dates saisies année par année, pour les semaines qui bougent
  | { t: 'annees'; d: Record<string, [string, string]> };

export interface Journee {
  n: string;
  nv: string;
  ty: string;
  th: string;
  r: Regle;
  src?: string;
  tag?: string;
  e?: number[];
}

export interface Occurrence {
  debut: string;
  fin: string;
}

const pad = (x: number) => String(x).padStart(2, '0');
const iso = (a: number, m: number, j: number) => `${a}-${pad(m)}-${pad(j)}`;

export function occurrence(j: Journee, annee: number): Occurrence | null {
  const r = j.r;
  if (r.t === 'fixe') {
    const d = iso(annee, r.m, r.j);
    return { debut: d, fin: d };
  }
  if (r.t === 'dernier-jour') {
    const d = iso(annee, r.m, new Date(Date.UTC(annee, r.m, 0)).getUTCDate());
    return { debut: d, fin: d };
  }
  if (r.t === 'nieme') {
    const premier = new Date(Date.UTC(annee, r.m - 1, 1)).getUTCDay();
    const d = iso(annee, r.m, 1 + ((r.w - premier + 7) % 7) + 7 * (r.n - 1));
    return { debut: d, fin: d };
  }
  const p = r.d[String(annee)];
  return p ? { debut: p[0], fin: p[1] } : null;
}

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function parties(d: string) {
  const [a, m, j] = d.split('-').map(Number);
  return { a, m, j, w: new Date(Date.UTC(a, m - 1, j)).getUTCDay() };
}
const num = (j: number) => (j === 1 ? '1er' : String(j));

export function libelleDate(o: Occurrence): string {
  const d = parties(o.debut);
  if (o.debut === o.fin) return `${JOURS[d.w]} ${num(d.j)} ${MOIS[d.m - 1]} ${d.a}`;
  const f = parties(o.fin);
  if (d.m === f.m) {
    return `du ${JOURS[d.w]} ${num(d.j)} au ${JOURS[f.w]} ${num(f.j)} ${MOIS[f.m - 1]} ${f.a}`;
  }
  return `du ${num(d.j)} ${MOIS[d.m - 1]} au ${num(f.j)} ${MOIS[f.m - 1]} ${f.a}`;
}

export function moisDe(o: Occurrence): number {
  return parties(o.debut).m;
}

export function nomMois(m: number): string {
  return MOIS[m - 1];
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function aplatir(txt: string): string {
  return (txt || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface Contexte {
  /** Préfixe des liens internes (withBase côté build, passé tel quel côté navigateur). */
  lien: (chemin: string) => string;
  tagLabel: (slug: string) => string;
}

function liensHtml(j: Journee, ctx: Contexte): string {
  const items: string[] = [];
  if (j.src) {
    items.push(
      `<li><a href="${esc(j.src)}" target="_blank" rel="noopener">Source<span class="sr-only"> : ${esc(j.n)}</span></a></li>`
    );
  }
  if (j.e && j.e.length) {
    const lien = (n: number) => `<a href="${esc(ctx.lien(`/emissions/emission-${n}/`))}">émission ${n}</a>`;
    const liste = j.e
      .map((n, i) => (i > 0 ? (i === j.e!.length - 1 ? ' et ' : ', ') : '') + lien(n))
      .join('');
    items.push(`<li>Sujet évoqué dans : ${liste}.</li>`);
  }
  if (j.tag) {
    items.push(
      `<li><a href="${esc(ctx.lien(`/tags/${j.tag}/`))}">Toutes les émissions sur le sujet « ${esc(ctx.tagLabel(j.tag))} »</a></li>`
    );
  }
  return items.length ? `<ul class="journee-liens">${items.join('')}</ul>` : '';
}

function ficheHtml(j: Journee, o: Occurrence | null, annee: number, ctx: Contexte): string {
  const date = o
    ? `<p class="journee-date"><time datetime="${o.debut}">${esc(libelleDate(o))}</time></p>`
    : `<p class="journee-date">Dates ${annee} à confirmer.</p>`;
  const recherche = aplatir([j.n, j.th, j.nv, j.ty].join(' '));
  return (
    `<li class="journee" data-recherche="${esc(recherche)}" data-niveau="${esc(j.nv)}" data-type="${esc(j.ty)}">` +
    `<p class="journee-nom"><strong>${esc(j.n)}</strong></p>` +
    date +
    `<p class="journee-meta">${esc(j.nv.charAt(0).toUpperCase() + j.nv.slice(1))} — ${esc(j.ty)} — ${esc(j.th)}</p>` +
    liensHtml(j, ctx) +
    `</li>`
  );
}

/** Calendrier d'une année : une section par mois, puis les dates à confirmer. */
export function calendrierHtml(liste: Journee[], annee: number, ctx: Contexte): string {
  const avec = liste
    .map((j) => ({ j, o: occurrence(j, annee) }))
    .filter((x): x is { j: Journee; o: Occurrence } => x.o !== null)
    .sort((a, b) => a.o.debut.localeCompare(b.o.debut) || a.j.n.localeCompare(b.j.n, 'fr'));
  const sans = liste.filter((j) => occurrence(j, annee) === null);

  let html = '';
  for (let m = 1; m <= 12; m++) {
    const duMois = avec.filter((x) => moisDe(x.o) === m);
    if (!duMois.length) continue;
    html +=
      `<section class="cal-mois" aria-labelledby="cal-mois-${m}">` +
      `<h3 id="cal-mois-${m}">${nomMois(m).charAt(0).toUpperCase() + nomMois(m).slice(1)} ${annee}</h3>` +
      `<ul class="cal-liste">${duMois.map((x) => ficheHtml(x.j, x.o, annee, ctx)).join('')}</ul></section>`;
  }
  if (sans.length) {
    html +=
      `<section class="cal-mois" aria-labelledby="cal-mois-0">` +
      `<h3 id="cal-mois-0">Dates ${annee} à confirmer</h3>` +
      `<p>Ces semaines changent de dates chaque année. Elles seront ajoutées dès qu'elles sont annoncées.</p>` +
      `<ul class="cal-liste">${sans.map((j) => ficheHtml(j, null, annee, ctx)).join('')}</ul></section>`;
  }
  return html;
}

/** Journées en cours aujourd'hui et prochaines à venir. */
export function proches(liste: Journee[], aujourdhui: string, combien = 3) {
  const annee = Number(aujourdhui.slice(0, 4));
  const toutes: { j: Journee; o: Occurrence }[] = [];
  for (const a of [annee - 1, annee, annee + 1]) {
    for (const j of liste) {
      const o = occurrence(j, a);
      if (o) toutes.push({ j, o });
    }
  }
  const enCours = toutes
    .filter((x) => x.o.debut <= aujourdhui && aujourdhui <= x.o.fin)
    .sort((a, b) => a.o.debut.localeCompare(b.o.debut));
  const aVenir = toutes
    .filter((x) => x.o.debut > aujourdhui)
    .sort((a, b) => a.o.debut.localeCompare(b.o.debut) || a.j.n.localeCompare(b.j.n, 'fr'))
    .slice(0, combien);
  return { enCours, aVenir };
}

function procheItem(x: { j: Journee; o: Occurrence }): string {
  return (
    `<li><strong>${esc(x.j.n)}</strong> — ` +
    `<time datetime="${x.o.debut}">${esc(libelleDate(x.o))}</time>` +
    (x.j.src ? ` — <a href="${esc(x.j.src)}" target="_blank" rel="noopener">Source<span class="sr-only"> : ${esc(x.j.n)}</span></a>` : '') +
    `</li>`
  );
}

export function prochesHtml(liste: Journee[], aujourdhui: string): string {
  const { enCours, aVenir } = proches(liste, aujourdhui);
  return (
    `<h3>En cours aujourd'hui</h3>` +
    (enCours.length
      ? `<ul>${enCours.map(procheItem).join('')}</ul>`
      : `<p>Aucune journée ni semaine du calendrier n'a lieu aujourd'hui.</p>`) +
    `<h3>Les prochaines</h3>` +
    (aVenir.length
      ? `<ul>${aVenir.map(procheItem).join('')}</ul>`
      : `<p>Aucune date à venir n'est encore enregistrée.</p>`)
  );
}

export function dateLocaleIso(d: Date): string {
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
