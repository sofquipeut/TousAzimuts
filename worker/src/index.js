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
.inline-edit textarea{width:100%;box-sizing:border-box;font:inherit}
.inline-edit button{margin-top:0.25rem}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
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

async function handleSearch(request, env) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) {
    return new Response(JSON.stringify([]), { headers: { ...JSON_HEADERS, ...corsHeaders(env) } });
  }

  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;

  const { results } = await env.DB.prepare(
    `SELECT page_id, page_title, page_url, author_name, body, created_at
     FROM comments
     WHERE status = 'approved' AND (body LIKE ? ESCAPE '\\' OR author_name LIKE ? ESCAPE '\\')
     ORDER BY created_at DESC
     LIMIT 30`
  )
    .bind(like, like)
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
  const token = url.searchParams.get('coms_token');
  return token && env.ADMIN_TOKEN && token === env.ADMIN_TOKEN;
}

async function handleAdmin(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('coms_token');

  if (!checkAdminToken(request, env)) {
    return new Response(htmlPage('Accès refusé', '<p>Token invalide ou manquant.</p>'), { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const { results } = await env.DB.prepare(
    `SELECT id, page_id, page_title, author_name, body, status, created_at FROM comments ORDER BY created_at DESC`
  ).all();

  const statusLabels = { pending: 'En attente', approved: 'Publié', rejected: 'Rejeté' };

  // Les cases de sélection et les boutons d'action groupée pointent vers
  // #bulk-form via l'attribut form="…" plutôt que d'imbriquer un <form>
  // autour du tableau : chaque ligne a aussi son propre petit formulaire
  // d'édition dans la cellule "Commentaire", et on ne peut pas imbriquer
  // un <form> dans un autre.
  const rows = (results || [])
    .map(
      (c) => `<tr>
        <td>
          <input type="checkbox" name="ids" value="${c.id}" id="c${c.id}" form="bulk-form">
          <label class="sr-only" for="c${c.id}">Sélectionner le commentaire de ${escapeHtml(c.author_name)}</label>
        </td>
        <td>${escapeHtml(c.page_title || c.page_id)}</td>
        <td>${escapeHtml(c.author_name)}</td>
        <td>
          <form method="post" action="/admin/edit" class="inline-edit">
            <input type="hidden" name="coms_token" value="${escapeHtml(token)}">
            <input type="hidden" name="id" value="${c.id}">
            <label class="sr-only" for="edit${c.id}">Modifier le commentaire de ${escapeHtml(c.author_name)}</label>
            <textarea id="edit${c.id}" name="body" rows="3" maxlength="2000">${escapeHtml(c.body)}</textarea>
            <button type="submit">Enregistrer</button>
          </form>
        </td>
        <td>${escapeHtml(statusLabels[c.status] || c.status)}</td>
        <td>${escapeHtml(c.created_at)}</td>
      </tr>`
    )
    .join('');

  const body = `
    <form id="bulk-form" method="post" action="/admin/bulk">
      <input type="hidden" name="coms_token" value="${escapeHtml(token)}">
    </form>

    <p>${(results || []).length} commentaire(s) au total.</p>
    <p><label><input type="checkbox" id="select-all"> Tout sélectionner</label></p>

    <table>
      <caption class="sr-only">Liste des commentaires</caption>
      <thead>
        <tr>
          <th scope="col">Sélection</th>
          <th scope="col">Émission</th>
          <th scope="col">Auteur</th>
          <th scope="col">Commentaire</th>
          <th scope="col">Statut</th>
          <th scope="col">Date</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <p>
      <button type="submit" form="bulk-form" name="action" value="approve">Approuver la sélection</button>
      <button type="submit" form="bulk-form" name="action" value="reject">Rejeter la sélection</button>
      <button type="submit" form="bulk-form" name="action" value="delete">Supprimer la sélection</button>
    </p>

    <script>
      document.getElementById('select-all').addEventListener('change', function (e) {
        document.querySelectorAll('input[name="ids"]').forEach(function (cb) {
          cb.checked = e.target.checked;
        });
      });
    </script>
  `;

  return new Response(htmlPage('Administration des commentaires', body), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function handleAdminBulk(request, env) {
  const formData = await request.formData();
  const token = formData.get('coms_token');
  const action = formData.get('action');
  const ids = formData.getAll('ids');

  if (!token || !env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response(htmlPage('Accès refusé', '<p>Token invalide ou manquant.</p>'), { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  if (ids.length > 0 && ['approve', 'reject', 'delete'].includes(action)) {
    const placeholders = ids.map(() => '?').join(',');
    if (action === 'delete') {
      await env.DB.prepare(`DELETE FROM comments WHERE id IN (${placeholders})`).bind(...ids).run();
    } else {
      const status = action === 'approve' ? 'approved' : 'rejected';
      await env.DB.prepare(`UPDATE comments SET status = ? WHERE id IN (${placeholders})`).bind(status, ...ids).run();
    }
  }

  return Response.redirect(`${new URL(request.url).origin}/admin?coms_token=${encodeURIComponent(token)}`, 302);
}

async function handleAdminEdit(request, env) {
  const formData = await request.formData();
  const token = formData.get('coms_token');
  const id = formData.get('id');
  const body = formData.get('body');

  if (!token || !env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response(htmlPage('Accès refusé', '<p>Token invalide ou manquant.</p>'), { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  if (id && typeof body === 'string' && body.trim() && body.trim().length <= 2000) {
    await env.DB.prepare(`UPDATE comments SET body = ? WHERE id = ?`).bind(body.trim(), id).run();
  }

  return Response.redirect(`${new URL(request.url).origin}/admin?coms_token=${encodeURIComponent(token)}`, 302);
}

// ---------------------------------------------------------------------------
// Statistiques de fréquentation
// Seuls des compteurs (page, jour, nombre de vues) sont stockés : ni adresse
// IP, ni identifiant, ni cookie. Un navigateur ne signale une page qu'une
// fois par jour (voir src/lib/visites.ts côté site).
// ---------------------------------------------------------------------------

const PAGE_ID_RE = /^[a-z0-9][a-z0-9/_.-]{0,119}$/;
const BOT_RE = /bot|crawl|spider|slurp|headless|preview|monitor|curl|wget/i;
let viewsSchemaReady = false;

async function ensureViewsSchema(env) {
  if (viewsSchemaReady) return;
  await env.DB.exec(
    'CREATE TABLE IF NOT EXISTS page_views (page_id TEXT NOT NULL, day TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (page_id, day))'
  );
  viewsSchemaReady = true;
}

function jsonResponse(data, env, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...corsHeaders(env) } });
}

async function pageTotal(env, pageId) {
  const row = await env.DB.prepare('SELECT COALESCE(SUM(views), 0) AS total FROM page_views WHERE page_id = ?')
    .bind(pageId)
    .first();
  return row ? row.total : 0;
}

async function handleViews(request, env) {
  await ensureViewsSchema(env);
  const url = new URL(request.url);
  let pageId = url.searchParams.get('pageId');
  let count = false;

  if (request.method === 'POST') {
    let data = {};
    try {
      data = await request.json();
    } catch {}
    pageId = data.pageId;
    count = true;
  }

  if (typeof pageId !== 'string' || !PAGE_ID_RE.test(pageId)) {
    return jsonResponse({ error: 'invalid_page_id' }, env, 400);
  }

  if (count && !BOT_RE.test(request.headers.get('User-Agent') || '')) {
    await env.DB.prepare(
      `INSERT INTO page_views (page_id, day, views) VALUES (?, date('now'), 1)
       ON CONFLICT(page_id, day) DO UPDATE SET views = views + 1`
    )
      .bind(pageId)
      .run();
  }

  return jsonResponse({ views: await pageTotal(env, pageId) }, env);
}

async function collectStats(env) {
  await ensureViewsSchema(env);
  const pages = (
    await env.DB.prepare(
      `SELECT page_id,
              SUM(views) AS total,
              SUM(CASE WHEN day >= date('now', '-29 days') THEN views ELSE 0 END) AS last30,
              SUM(CASE WHEN day >= date('now', '-6 days') THEN views ELSE 0 END) AS last7
       FROM page_views GROUP BY page_id ORDER BY total DESC, page_id ASC`
    ).all()
  ).results || [];
  const daily = (
    await env.DB.prepare(
      `SELECT day, SUM(views) AS views FROM page_views
       WHERE day >= date('now', '-29 days') GROUP BY day ORDER BY day DESC`
    ).all()
  ).results || [];
  const sum = (list, key) => list.reduce((n, p) => n + (p[key] || 0), 0);
  return {
    generatedAt: new Date().toISOString(),
    total: sum(pages, 'total'),
    last30: sum(pages, 'last30'),
    last7: sum(pages, 'last7'),
    emissionsTotal: sum(pages.filter((p) => p.page_id.startsWith('emissions/')), 'total'),
    pages,
    daily,
  };
}

async function handleStats(request, env) {
  if (!checkAdminToken(request, env)) {
    return new Response(htmlPage('Accès refusé', '<p>Token invalide ou manquant.</p>'), { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  const stats = await collectStats(env);
  const url = new URL(request.url);

  if (url.searchParams.get('format') === 'json') {
    return new Response(JSON.stringify(stats, null, 2), { headers: JSON_HEADERS });
  }

  const row = (cells) => `<tr>${cells.join('')}</tr>`;
  const pageRows = (list) =>
    list
      .map((p) => row([`<th scope="row">${escapeHtml(p.page_id)}</th>`, `<td>${p.total}</td>`, `<td>${p.last30}</td>`, `<td>${p.last7}</td>`]))
      .join('');
  const head = `<thead><tr><th scope="col">Page</th><th scope="col">Total</th><th scope="col">30 derniers jours</th><th scope="col">7 derniers jours</th></tr></thead>`;
  const emissions = stats.pages.filter((p) => p.page_id.startsWith('emissions/'));
  const others = stats.pages.filter((p) => !p.page_id.startsWith('emissions/'));

  const body = `
    <h2>En bref</h2>
    <ul>
      <li>Vues du site, au total : ${stats.total}</li>
      <li>Sur les 30 derniers jours : ${stats.last30}</li>
      <li>Sur les 7 derniers jours : ${stats.last7}</li>
      <li>Dont pages d'émissions, au total : ${stats.emissionsTotal}</li>
    </ul>
    <p>Une vue = une page consultée par un navigateur, au plus une fois par jour. Les visiteurs dont le navigateur bloque les scripts ne sont pas comptés : ce sont des ordres de grandeur.</p>

    <h2>Par émission</h2>
    <table><caption class="sr-only">Vues par émission</caption>${head}<tbody>${pageRows(emissions)}</tbody></table>

    <h2>Autres pages</h2>
    <table><caption class="sr-only">Vues des autres pages</caption>${head}<tbody>${pageRows(others)}</tbody></table>

    <h2>Par jour (30 derniers jours)</h2>
    <table><caption class="sr-only">Vues par jour</caption>
      <thead><tr><th scope="col">Jour</th><th scope="col">Vues</th></tr></thead>
      <tbody>${stats.daily.map((d) => row([`<th scope="row">${escapeHtml(d.day)}</th>`, `<td>${d.views}</td>`])).join('')}</tbody></table>
  `;
  return new Response(htmlPage('Statistiques de fréquentation', body), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
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
    if (url.pathname === '/api/comments/search' && request.method === 'GET') {
      return handleSearch(request, env);
    }
    if (url.pathname === '/api/moderate' && request.method === 'GET') {
      return handleModerate(request, env);
    }
    if (url.pathname === '/api/views' && (request.method === 'GET' || request.method === 'POST')) {
      return handleViews(request, env);
    }
    if (url.pathname === '/admin/stats' && request.method === 'GET') {
      return handleStats(request, env);
    }
    if (url.pathname === '/admin' && request.method === 'GET') {
      return handleAdmin(request, env);
    }
    if (url.pathname === '/admin/bulk' && request.method === 'POST') {
      return handleAdminBulk(request, env);
    }
    if (url.pathname === '/admin/edit' && request.method === 'POST') {
      return handleAdminEdit(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};
