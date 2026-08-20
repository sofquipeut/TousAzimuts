# Worker commentaires — déploiement

Système de commentaires "maison" pour tazfm.fr : formulaire sans compte
visiteur requis, stockage Cloudflare D1, notification par email (Resend),
modération en un clic depuis le mail (pas de dashboard).

## Prérequis

- Un compte Cloudflare (gratuit) : https://dash.cloudflare.com/sign-up
- Un compte Resend (gratuit, 3000 emails/mois) : https://resend.com/signup
  - Clé API à créer dans Resend > API Keys.
  - Pas besoin de vérifier de domaine pour démarrer : l'adresse d'envoi
    par défaut `onboarding@resend.dev` fonctionne sans configuration DNS.

## Déploiement

```bash
cd worker
npm install -g wrangler   # si pas déjà installé
wrangler login

# Créer la base D1
wrangler d1 create taz-comments
# → copier le "database_id" retourné dans wrangler.toml

# Créer les tables
wrangler d1 execute taz-comments --remote --file=./schema.sql

# Définir les secrets (ne jamais les mettre dans wrangler.toml)
wrangler secret put RESEND_API_KEY
wrangler secret put MODERATION_SECRET   # ex: openssl rand -hex 32

# Déployer
wrangler deploy
```

Une fois déployé, `wrangler deploy` affiche l'URL du Worker
(`https://taz-comments.<votre-sous-domaine>.workers.dev`). Coller cette
URL dans `src/lib/comments.ts` (`COMMENTS_API_BASE`) côté site pour
activer le bloc commentaires.

## Test rapide

```bash
curl -X POST https://taz-comments.<sous-domaine>.workers.dev/api/comments \
  -H "Content-Type: application/json" \
  -d '{"pageId":"test","pageUrl":"https://tazfm.fr","pageTitle":"Test","name":"Test","body":"Ceci est un test.","startedAt":0}'
```

Un email de modération doit arriver sur `contact@tazfm.fr` (ou l'adresse
définie dans `NOTIFY_TO_EMAIL`), avec deux liens : Approuver / Rejeter.
