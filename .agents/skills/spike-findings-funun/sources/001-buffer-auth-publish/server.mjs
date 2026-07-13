// Spike 001: buffer-auth-publish
// Self-contained harness (no npm install) that proves Buffer's ONLY open auth
// path for new third-party apps — a personal API key (BYOK) against the new
// GraphQL API at https://api.buffer.com — can (1) read the account + channels
// and (2) create a scheduled post. Run: `node server.mjs`, open the printed URL,
// paste your Buffer personal API key (publish.buffer.com/settings/api).
//
// The key is entered at runtime in the browser and forwarded server-side to
// Buffer (avoids CORS + never touches disk or git). Every Buffer call is
// recorded in a forensic in-memory log you can view and export as JSON.

import http from 'node:http'

const PORT = 5170
const BUFFER_ENDPOINT = 'https://api.buffer.com'

// ─── Forensic log ─────────────────────────────────────────────────────────────
const logEvents = []
function logEvent(category, data) {
  logEvents.push({ ts: new Date().toISOString(), category, ...data })
}

// ─── Buffer GraphQL proxy ─────────────────────────────────────────────────────
async function bufferGraphQL(apiKey, label, query, variables) {
  const started = Date.now()
  logEvent('request', { label, query: query.replace(/\s+/g, ' ').trim().slice(0, 120) })
  try {
    const res = await fetch(BUFFER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables: variables ?? {} }),
    })
    const raw = await res.text()
    let json
    try {
      json = JSON.parse(raw)
    } catch {
      json = { _unparseable: raw.slice(0, 800) }
    }
    logEvent('response', {
      label,
      status: res.status,
      ms: Date.now() - started,
      hasGraphqlErrors: Array.isArray(json.errors) && json.errors.length > 0,
      errorSummary: Array.isArray(json.errors) ? json.errors.map(e => e.message).slice(0, 3) : undefined,
    })
    return { status: res.status, json }
  } catch (e) {
    logEvent('error', { label, message: String(e), ms: Date.now() - started })
    return { status: 0, json: { _networkError: String(e) } }
  }
}

// GraphQL string literal — JSON.stringify yields a valid GraphQL double-quoted
// string, safely escaping the user's caption / URL for inline interpolation.
const gql = v => JSON.stringify(v)

function accountQuery() {
  return `query { account { id organizations { id name } } }`
}

function channelsQuery(organizationId) {
  return `query { channels(input: { organizationId: ${gql(organizationId)} }) { id name service } }`
}

function createPostMutation({ channelId, text, dueAt, imageUrl }) {
  const assets = imageUrl ? `assets: [{ image: { url: ${gql(imageUrl)} } }]` : ''
  return `mutation {
    createPost(input: {
      text: ${gql(text)}
      channelId: ${gql(channelId)}
      schedulingType: automatic
      mode: customScheduled
      dueAt: ${gql(dueAt)}
      ${assets}
    }) {
      ... on PostActionSuccess { post { id text dueAt assets { id mimeType } } }
      ... on MutationError { message }
    }
  }`
}

// ─── HTTP server ──────────────────────────────────────────────────────────────
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise(resolve => {
    let data = ''
    req.on('data', c => (data += c))
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch {
        resolve({})
      }
    })
  })
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req

  if (method === 'GET' && url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(HTML)
    return
  }

  if (method === 'GET' && url === '/api/log') {
    const errors = logEvents.filter(e => e.category === 'error' || e.hasGraphqlErrors).length
    return json(res, 200, {
      count: logEvents.length,
      requests: logEvents.filter(e => e.category === 'request').length,
      errors,
      events: logEvents,
    })
  }

  if (method === 'POST' && url === '/api/reset-log') {
    logEvents.length = 0
    return json(res, 200, { ok: true })
  }

  if (method === 'POST' && url === '/api/account') {
    const { apiKey } = await readBody(req)
    if (!apiKey) return json(res, 400, { error: 'apiKey required' })
    const r = await bufferGraphQL(apiKey, 'account', accountQuery())
    return json(res, 200, r)
  }

  if (method === 'POST' && url === '/api/channels') {
    const { apiKey, organizationId } = await readBody(req)
    if (!apiKey || !organizationId) return json(res, 400, { error: 'apiKey + organizationId required' })
    const r = await bufferGraphQL(apiKey, 'channels', channelsQuery(organizationId))
    return json(res, 200, r)
  }

  if (method === 'POST' && url === '/api/create-post') {
    const { apiKey, channelId, text, dueAt, imageUrl } = await readBody(req)
    if (!apiKey || !channelId || !text || !dueAt)
      return json(res, 400, { error: 'apiKey + channelId + text + dueAt required' })
    const r = await bufferGraphQL(apiKey, 'createPost', createPostMutation({ channelId, text, dueAt, imageUrl }))
    return json(res, 200, r)
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(PORT, () => {
  console.log(`\nSpike 001 — buffer-auth-publish`)
  console.log(`  Open:  http://localhost:${PORT}`)
  console.log(`  Get a personal API key: https://publish.buffer.com/settings/api`)
  console.log(`  (key stays in memory only — never written to disk or git)\n`)
})

// ─── UI ───────────────────────────────────────────────────────────────────────
const HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Spike 001 — Buffer auth + publish</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 -apple-system, system-ui, sans-serif; background: #0a0a0f; color: #e7e7ef; padding: 28px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #8b8ba7; margin: 0 0 20px; font-size: 13px; }
  .card { border: 1px solid #23233a; background: #12121c; border-radius: 12px; padding: 18px; margin-bottom: 16px; }
  .step { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #8b8ba7; margin: 0 0 10px; font-weight: 700; }
  label { display: block; font-size: 12px; color: #8b8ba7; margin: 10px 0 4px; }
  input, textarea { width: 100%; background: #0a0a0f; border: 1px solid #2c2c46; color: #e7e7ef; border-radius: 8px; padding: 8px 10px; font: inherit; }
  button { background: linear-gradient(90deg, #818CF8, #D946EF); border: 0; color: #fff; font-weight: 700; border-radius: 8px; padding: 9px 16px; cursor: pointer; margin-top: 12px; }
  button.sec { background: #23233a; }
  button:disabled { opacity: .4; cursor: not-allowed; }
  pre { background: #0a0a0f; border: 1px solid #23233a; border-radius: 8px; padding: 12px; overflow-x: auto; font-size: 12px; white-space: pre-wrap; word-break: break-word; max-height: 320px; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  .ok { color: #34d399; } .bad { color: #fb7185; } .muted { color: #8b8ba7; }
  .pill { display: inline-block; border: 1px solid #2c2c46; border-radius: 999px; padding: 2px 10px; margin: 3px 4px 0 0; font-size: 12px; cursor: pointer; }
  .pill.on { border-color: #818CF8; background: rgba(129,140,248,.15); }
</style>
</head>
<body>
  <h1>Spike 001 — Buffer auth + publish (BYOK)</h1>
  <p class="sub">Proves a Buffer <strong>personal API key</strong> can read channels and schedule a post via the new GraphQL API. Third-party OAuth is closed to new apps in 2026, so this BYOK path is the only one available. Your key stays in memory only.</p>

  <div class="card">
    <p class="step">Step 0 — Your key</p>
    <label>Buffer personal API key (from publish.buffer.com/settings/api)</label>
    <input id="key" type="password" placeholder="paste key — stays in browser + server memory only" />
  </div>

  <div class="card">
    <p class="step">Step 1 — Account &amp; channels</p>
    <button id="btnAccount">Get account + organizations</button>
    <div id="orgs"></div>
    <div id="channels"></div>
  </div>

  <div class="card">
    <p class="step">Step 2 — Create a scheduled test post</p>
    <p class="muted" style="font-size:12px;margin:0">Pick a channel above first. Schedules ~1 hour out; you can delete it in Buffer after.</p>
    <label>Caption</label>
    <textarea id="text" rows="2">Funūn spike test — scheduled via the Buffer GraphQL API 🎵</textarea>
    <label>Image URL (optional — Buffer needs a public URL; Funūn uses cover_art_url)</label>
    <input id="img" type="url" placeholder="https://... (leave blank for text-only)" />
    <div class="row">
      <button id="btnPost" disabled>Schedule test post to selected channel</button>
      <span id="selChan" class="muted" style="align-self:center"></span>
    </div>
    <div id="postResult"></div>
  </div>

  <div class="card">
    <p class="step">Forensic log</p>
    <div class="row">
      <button class="sec" id="btnLog">Refresh log</button>
      <button class="sec" id="btnExport">Export JSON</button>
      <button class="sec" id="btnReset">Reset</button>
    </div>
    <pre id="log" class="muted">No events yet.</pre>
  </div>

<script>
  const $ = id => document.getElementById(id)
  let selectedChannel = null
  const key = () => $('key').value.trim()

  async function post(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return res.json()
  }
  function show(el, obj) { el.innerHTML = '<pre>' + escapeHtml(JSON.stringify(obj, null, 2)) + '</pre>' }
  function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) }

  $('btnAccount').onclick = async () => {
    if (!key()) return alert('Paste your API key first')
    $('orgs').innerHTML = '<p class="muted">Loading…</p>'
    const r = await post('/api/account', { apiKey: key() })
    const orgs = r?.json?.data?.account?.organizations ?? []
    if (!orgs.length) { show($('orgs'), r); return }
    $('orgs').innerHTML = '<p class="ok">Account OK — organizations:</p>' +
      orgs.map(o => '<span class="pill" data-org="' + o.id + '">' + escapeHtml(o.name || o.id) + '</span>').join('')
    document.querySelectorAll('[data-org]').forEach(el => el.onclick = () => loadChannels(el.dataset.org))
    if (orgs.length === 1) loadChannels(orgs[0].id)
  }

  async function loadChannels(orgId) {
    $('channels').innerHTML = '<p class="muted">Loading channels…</p>'
    const r = await post('/api/channels', { apiKey: key(), organizationId: orgId })
    const chans = r?.json?.data?.channels ?? []
    if (!chans.length) { show($('channels'), r); return }
    $('channels').innerHTML = '<p class="ok">Channels — click one to target:</p>' +
      chans.map(c => '<span class="pill" data-chan="' + c.id + '" data-name="' + escapeHtml((c.service||'') + ' · ' + (c.name||'')) + '">' + escapeHtml((c.service||'?') + ' · ' + (c.name||c.id)) + '</span>').join('')
    document.querySelectorAll('[data-chan]').forEach(el => el.onclick = () => {
      selectedChannel = el.dataset.chan
      document.querySelectorAll('[data-chan]').forEach(x => x.classList.remove('on'))
      el.classList.add('on')
      $('selChan').textContent = 'Target: ' + el.dataset.name
      $('btnPost').disabled = false
    })
  }

  $('btnPost').onclick = async () => {
    if (!selectedChannel) return alert('Select a channel first')
    const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    $('postResult').innerHTML = '<p class="muted">Scheduling…</p>'
    const r = await post('/api/create-post', {
      apiKey: key(), channelId: selectedChannel,
      text: $('text').value, dueAt, imageUrl: $('img').value.trim() || undefined,
    })
    const success = r?.json?.data?.createPost?.post
    const err = r?.json?.data?.createPost?.message || r?.json?.errors
    if (success) $('postResult').innerHTML = '<p class="ok">✓ Scheduled — post id ' + escapeHtml(success.id) + ' for ' + escapeHtml(success.dueAt || dueAt) + '</p><pre>' + escapeHtml(JSON.stringify(success, null, 2)) + '</pre>'
    else $('postResult').innerHTML = '<p class="bad">✗ Failed</p><pre>' + escapeHtml(JSON.stringify(err ?? r, null, 2)) + '</pre>'
    refreshLog()
  }

  async function refreshLog() {
    const r = await fetch('/api/log').then(x => x.json())
    $('log').textContent = 'events: ' + r.count + '  requests: ' + r.requests + '  errors: ' + r.errors + '\\n\\n' + JSON.stringify(r.events, null, 2)
  }
  $('btnLog').onclick = refreshLog
  $('btnReset').onclick = async () => { await post('/api/reset-log', {}); refreshLog() }
  $('btnExport').onclick = async () => {
    const r = await fetch('/api/log').then(x => x.json())
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'spike-001-buffer-log.json'; a.click()
  }
</script>
</body>
</html>`
