// Worker Cloudflare pour les commentaires du site Tous Azimuts.
// Stocke les commentaires dans D1, notifie par email (Resend) à chaque
// nouveau commentaire, et gère l'approbation/rejet via un lien signé
// cliquable directement depuis le mail (pas de dashboard à apprendre).

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || 'https://tazfm.fr',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlPage(title, body) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui,sans-serif;max-width:60rem;margin:3rem auto;padding:0 1rem;line-height:1.5}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccc;padding:0.5rem;text-align:left;vertical-align:top}
</style>
</head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}

async function handlePost(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: { ...JSON_HEADERS, ...corsHeaders(env) } });
  }

  const { pageId, pageUrl, pageTitle, name, body, website, startedAt } = data;

  // Piège à bots : le champ "website" doit rester vide, et le formulaire
  // ne doit pas être soumis en moins de 2 secondes après son affichage.
  if (website) {
    return new Response(JSON.stringify({ ok: true }), { status: 202, headers: { ...JSON_HEADERS, ...corsHeaders(env) } });
  }
  if (typeof startedAt === 'number' && Date.now() - startedAt < 2000) {
    return new Response(JSON.stringify({ ok: true }), { status: 202, headers: { ...JSON_HEADERS, ...corsHeaders(env) } });
  }

  if (!pageId || !name || !body || String(name).length > 80 || String(body).length > 2000) {
    return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: { ...JSON_HEADERS, ...corsHeaders(env) } });
  }

  const result = await env.DB.prepare(
    `INSERT INTO comments (page_id, page_url, page_title, author_name, body, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))`
  )
    .bind(pageId, pageUrl || '', pageTitle || '', String(name).trim(), String(body).trim())
    .run();

  const id = result.meta.last_row_id;

  const approveToken = await hmacHex(env.MODERATION_SECRET, `${id}:approve`);
  const rejectToken = await hmacHex(env.MODERATION_SECRET, `${id}:reject`);
  const workerUrl = new URL(request.url).origin;
  const approveUrl = `${workerUrl}/api/moderate?id=${id}&action=approve&token=${approveToken}`;
  const rejectUrl = `${workerUrl}/api/moderate?id=${id}&action=reject&token=${rejectToken}`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.NOTIFY_FROM_EMAIL || 'Tous Azimuts <onboarding@resend.dev>',
      to: env.NOTIFY_TO_EMAIL,
      subject: `Nouveau commentaire sur "${pageTitle || pageId}"`,
      html: htmlPage('Nouveau commentaire', `
        <p><strong>${escapeHtml(name)}</strong> a écrit :</p>
        <blockquote>${escapeHtml(body)}</blockquote>
        <p>Page : <a href="${escapeHtml(pageUrl || '')}">${escapeHtml(pageUrl || pageId)}</a></p>
        <p>
          <a href="${approveUrl}" style="color:green;font-weight:bold">✅ Approuver</a>
          &nbsp;·&nbsp;
          <a href="${rejectUrl}" style="color:crimson;font-weight:bold">❌ Rejeter</a>
        </p>
      `),
    }),
  });

  return new Response(JSON.stringify({ ok: true }), { status: 202, headers: { ...JSON_HEADERS, ...corsHeaders(env) } });
}

async function handleGet(request, env) {
  const url = new URL(request.url);
  const pageId = url.searchParams.get('pageId');
  if (!pageId) {
    return new Response(JSON.stringify({ error: 'missing_page_id' }), { status: 400, headers: { ...JSON_HEADERS, ...corsHeaders(env) } });
  }

  const { results } = await env.DB.prepare(
    `SELECT author_name, body, created_at FROM comments WHERE page_id = ? AND status = 'approved' ORDER BY created_at ASC`
  )
    .bind(pageId)
    .all();

  return new Response(JSON.stringify(results || []), { headers: { ...JSON_HEADERS, ...corsHeaders(env) } });
}

async function handleModerate(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const action = url.searchParams.get('action');
  const token = url.searchParams.get('token');

  if (!id || !['approve', 'reject'].includes(action) || !token) {
    return new Response(htmlPage('Lien invalide', '<p>Ce lien de modération est invalide.</p>'), { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const expected = await hmacHex(env.MODERATION_SECRET, `${id}:${action}`);
  if (token !== expected) {
    return new Response(htmlPage('Lien invalide', '<p>Ce lien de modération est invalide ou a expiré.</p>'), { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const status = action === 'approve' ? 'approved' : 'rejected';
  await env.DB.prepare(`UPDATE comments SET status = ? WHERE id = ?`).bind(status, id).run();

  const message = action === 'approve' ? 'Commentaire approuvé et publié ✅' : 'Commentaire rejeté ❌';
  return new Response(htmlPage(message, '<p>Vous pouvez fermer cette page.</p>'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function checkAdminToken(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  return token && env.ADMIN_TOKEN && token === env.ADMIN_TOKEN;
}

async function handleAdmin(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!checkAdminToken(request, env)) {
    return new Response(htmlPage('Accès refusé', '<p>Token invalide ou manquant.</p>'), { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const { results } = await env.DB.prepare(
    `SELECT id, page_id, page_title, author_name, body, status, created_at FROM comments ORDER BY created_at DESC`
  ).all();

  const statusLabels = { pending: 'En attente', approved: 'Publié', rejected: 'Rejeté' };

  const rows = (results || [])
    .map(
      (c) => `<tr>
        <td>${escapeHtml(c.page_title || c.page_id)}</td>
        <td>${escapeHtml(c.author_name)}</td>
        <td>${escapeHtml(c.body)}</td>
        <td>${escapeHtml(statusLabels[c.status] || c.status)}</td>
        <td>${escapeHtml(c.created_at)}</td>
        <td>
          <form method="post" action="/admin/delete" style="margin:0">
            <input type="hidden" name="id" value="${c.id}">
            <input type="hidden" name="token" value="${escapeHtml(token)}">
            <button type="submit">Supprimer</button>
          </form>
        </td>
      </tr>`
    )
    .join('');

  const table = `
    <p>${(results || []).length} commentaire(s) au total.</p>
    <table>
      <caption class="sr-only">Liste des commentaires</caption>
      <thead>
        <tr>
          <th scope="col">Émission</th>
          <th scope="col">Auteur</th>
          <th scope="col">Commentaire</th>
          <th scope="col">Statut</th>
          <th scope="col">Date</th>
          <th scope="col">Action</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  return new Response(htmlPage('Administration des commentaires', table), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function handleAdminDelete(request, env) {
  const formData = await request.formData();
  const id = formData.get('id');
  const token = formData.get('token');

  if (!id || !token || !env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response(htmlPage('Accès refusé', '<p>Token invalide ou manquant.</p>'), { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  await env.DB.prepare(`DELETE FROM comments WHERE id = ?`).bind(id).run();

  return Response.redirect(`${new URL(request.url).origin}/admin?token=${encodeURIComponent(token)}`, 302);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (url.pathname === '/api/comments' && request.method === 'POST') {
      return handlePost(request, env);
    }
    if (url.pathname === '/api/comments' && request.method === 'GET') {
      return handleGet(request, env);
    }
    if (url.pathname === '/api/moderate' && request.method === 'GET') {
      return handleModerate(request, env);
    }
    if (url.pathname === '/admin' && request.method === 'GET') {
      return handleAdmin(request, env);
    }
    if (url.pathname === '/admin/delete' && request.method === 'POST') {
      return handleAdminDelete(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};
