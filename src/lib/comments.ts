// Config du système de commentaires "maison" : Cloudflare Worker + D1 +
// Resend pour les notifications. Pas de compte requis pour commenter,
// modération en un clic depuis le mail. Voir worker/README.md pour le
// déploiement.
// Laisser COMMENTS_API_BASE vide désactive complètement le bloc
// commentaires (voir components/Comments.astro).
export const COMMENTS_API_BASE = '';
