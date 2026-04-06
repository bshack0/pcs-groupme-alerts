const express = require('express');
const fs = require('fs');
const config = require('./config');

const app = express();
app.use(express.json());

const PORT = Number(process.env.UI_PORT || process.env.PORT || 3000);
const ADMIN_TOKEN = String(process.env.UI_ADMIN_TOKEN || '').trim();

function authOk(req) {
  if (!ADMIN_TOKEN) return true;
  const token = String(req.headers['x-admin-token'] || '').trim();
  return token && token === ADMIN_TOKEN;
}

function requireAuth(req, res, next) {
  if (authOk(req)) return next();
  return res.status(401).json({ error: 'Unauthorized. Missing/invalid x-admin-token' });
}

function readCurrentConfig() {
  const filePath = config.localConfigPath;
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return {};
  }
}

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/config', requireAuth, (_req, res) => {
  res.json({
    source: config.localConfigPath,
    data: readCurrentConfig(),
  });
});

app.post('/api/config', requireAuth, (req, res) => {
  const data = req.body && typeof req.body === 'object' ? req.body : null;
  if (!data) {
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }

  const json = `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(config.localConfigPath, json, 'utf8');
  return res.json({ ok: true, savedTo: config.localConfigPath });
});

app.get('/ui', (_req, res) => {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PCS GroupMe Admin</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 900px; margin: 32px auto; padding: 0 16px; }
    h1 { margin-bottom: 8px; }
    p { color: #444; }
    textarea { width: 100%; min-height: 420px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
    .row { margin: 12px 0; }
    input[type="password"] { width: 100%; padding: 8px; }
    button { padding: 10px 14px; margin-right: 8px; cursor: pointer; }
    .ok { color: #0a7a33; }
    .err { color: #b00020; }
  </style>
</head>
<body>
  <h1>PCS GroupMe Admin UI</h1>
  <p>Edit runtime config for this deployed instance. Changes are saved to <code>config.local.json</code>.</p>
  <p>Supported keys include: <code>PCO_APP_ID</code>, <code>PCO_SECRET</code>, <code>PCO_SERVICE_TYPE_ID</code>, <code>GROUPME_BOT_ID</code>, <code>GROUPME_ACCESS_TOKEN</code>, <code>GROUPME_GROUP_ID</code>, <code>GROUPME_DESTINATION_LABEL</code>, <code>TEAM_NAMES</code>, <code>TEAM_RULES</code>, <code>TEAM_SIGNUP_URLS</code>, <code>DRY_RUN</code>.</p>
  <div class="row">
    <label>Admin token (only needed if UI_ADMIN_TOKEN is set)</label>
    <input id="token" type="password" />
  </div>
  <div class="row">
    <button id="loadBtn">Load</button>
    <button id="saveBtn">Save</button>
    <span id="status"></span>
  </div>
  <textarea id="editor"></textarea>
  <script>
    const statusEl = document.getElementById('status');
    const tokenEl = document.getElementById('token');
    const editorEl = document.getElementById('editor');

    function setStatus(text, ok) {
      statusEl.textContent = text;
      statusEl.className = ok ? 'ok' : 'err';
    }

    function headers() {
      const h = { 'Content-Type': 'application/json' };
      const token = tokenEl.value.trim();
      if (token) h['x-admin-token'] = token;
      return h;
    }

    async function load() {
      setStatus('Loading...', true);
      const resp = await fetch('/api/config', { headers: headers() });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to load config');
      editorEl.value = JSON.stringify(data.data || {}, null, 2);
      setStatus('Loaded config.local.json', true);
    }

    async function save() {
      let payload;
      try {
        payload = JSON.parse(editorEl.value || '{}');
      } catch (err) {
        setStatus('Invalid JSON: ' + err.message, false);
        return;
      }
      setStatus('Saving...', true);
      const resp = await fetch('/api/config', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to save config');
      setStatus('Saved to config.local.json', true);
    }

    document.getElementById('loadBtn').addEventListener('click', () => load().catch(err => setStatus(err.message, false)));
    document.getElementById('saveBtn').addEventListener('click', () => save().catch(err => setStatus(err.message, false)));

    editorEl.value = JSON.stringify({
      PCO_SERVICE_TYPE_ID: "",
      TEAM_NAMES: "Security,Medical",
      GROUPME_DESTINATION_LABEL: "Weekend Safety Alerts",
      DRY_RUN: "true"
    }, null, 2);
  </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

function startUiServer(port = PORT) {
  const server = app.listen(port, () => {
    console.log(`Admin UI running on port ${port}`);
    if (!ADMIN_TOKEN) {
      console.warn('UI_ADMIN_TOKEN is not set. UI endpoints are unsecured.');
    }
  });
  return server;
}

if (require.main === module) {
  startUiServer();
}

module.exports = { app, startUiServer };
