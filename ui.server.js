const express = require('express');
const fs = require('fs');
const config = require('./config');
const {
  getServiceTypes,
  getTeamsForServiceType,
} = require('./services.planningCenter');

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

app.get('/api/pco/service-types', requireAuth, async (_req, res) => {
  try {
    const serviceTypes = await getServiceTypes();
    const items = serviceTypes.map((st) => ({
      id: st.id,
      name: st.attributes?.name || `Service Type ${st.id}`,
    }));
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load service types' });
  }
});

app.get('/api/pco/teams', requireAuth, async (req, res) => {
  const serviceTypeId = String(req.query.serviceTypeId || '').trim();
  if (!serviceTypeId) {
    return res.status(400).json({ error: 'serviceTypeId is required' });
  }
  try {
    const teams = await getTeamsForServiceType(serviceTypeId);
    const items = teams.map((t) => ({
      id: t.id,
      name: t.attributes?.name || `Team ${t.id}`,
    }));
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load teams' });
  }
});

app.get('/ui', (_req, res) => {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PCS GroupMe Admin</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 980px; margin: 24px auto; padding: 0 16px; color: #111; }
    h1 { margin-bottom: 6px; }
    p { color: #444; }
    .wizard { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-top: 16px; background: #fff; }
    .stepper { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .stepDot { border: 1px solid #bbb; border-radius: 999px; padding: 6px 10px; font-size: 12px; color: #555; }
    .stepDot.active { border-color: #5b3fd0; color: #5b3fd0; font-weight: 600; }
    .step { display: none; }
    .step.active { display: block; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .grid-1 { display: grid; grid-template-columns: 1fr; gap: 10px; }
    label { display: block; font-size: 13px; margin-bottom: 4px; color: #222; }
    input, select, textarea { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; }
    textarea { min-height: 160px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    button { padding: 10px 14px; margin-right: 8px; cursor: pointer; border-radius: 6px; border: 1px solid #bbb; background: #f6f6f6; }
    button.primary { background: #5b3fd0; border-color: #5b3fd0; color: #fff; }
    button.ghost { background: #fff; }
    .row { margin: 12px 0; }
    .actions { margin-top: 14px; }
    .card { border: 1px solid #eee; border-radius: 8px; padding: 10px; margin-top: 8px; }
    .ok { color: #0a7a33; }
    .err { color: #b00020; }
    .muted { color: #666; font-size: 12px; }
    .teamItem { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
    .teamItem input[type="text"] { flex: 1; }
  </style>
</head>
<body>
  <h1>PCS GroupMe Setup Builder</h1>
  <p>Use this guided setup to configure a deployed instance. Settings are saved to <code>config.local.json</code>.</p>
  <div class="row">
    <label>Admin token (required only if <code>UI_ADMIN_TOKEN</code> is set)</label>
    <input id="token" type="password" />
  </div>

  <div class="wizard">
    <div class="stepper">
      <div class="stepDot active" data-step-dot="0">1. Credentials</div>
      <div class="stepDot" data-step-dot="1">2. Planning Center</div>
      <div class="stepDot" data-step-dot="2">3. Team Builder</div>
      <div class="stepDot" data-step-dot="3">4. Review & Save</div>
    </div>

    <div class="step active" data-step="0">
      <div class="grid">
        <div>
          <label>PCO_APP_ID</label>
          <input id="pcoAppId" />
        </div>
        <div>
          <label>PCO_SECRET</label>
          <input id="pcoSecret" />
        </div>
        <div>
          <label>GROUPME_BOT_ID</label>
          <input id="groupMeBotId" />
        </div>
        <div>
          <label>GROUPME_ACCESS_TOKEN</label>
          <input id="groupMeAccessToken" />
        </div>
        <div>
          <label>GROUPME_GROUP_ID (optional)</label>
          <input id="groupMeGroupId" />
        </div>
        <div>
          <label>GROUPME_DESTINATION_LABEL</label>
          <input id="destinationLabel" />
        </div>
      </div>
      <div class="actions">
        <button class="primary" id="toStep1">Next</button>
      </div>
    </div>

    <div class="step" data-step="1">
      <div class="row">
        <button class="ghost" id="loadServiceTypes">Load Service Types</button>
      </div>
      <div class="grid">
        <div>
          <label>Service Type</label>
          <select id="serviceTypeSelect">
            <option value="">Select a service type</option>
          </select>
        </div>
        <div>
          <label>DRY_RUN</label>
          <select id="dryRun">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      </div>
      <div class="actions">
        <button class="ghost" id="backTo0">Back</button>
        <button class="primary" id="toStep2">Next</button>
      </div>
    </div>

    <div class="step" data-step="2">
      <div class="row">
        <button class="ghost" id="loadTeams">Load Teams for Selected Service Type</button>
      </div>
      <div id="teamsContainer" class="card">
        <div class="muted">No teams loaded yet.</div>
      </div>
      <div class="actions">
        <button class="ghost" id="backTo1">Back</button>
        <button class="primary" id="toStep3">Next</button>
      </div>
    </div>

    <div class="step" data-step="3">
      <p class="muted">Review generated config JSON, then save.</p>
      <textarea id="reviewJson"></textarea>
      <div class="actions">
        <button class="ghost" id="backTo2">Back</button>
        <button class="primary" id="saveConfig">Save Config</button>
      </div>
    </div>
  </div>

  <div class="row"><span id="status"></span></div>

  <script>
    const statusEl = document.getElementById('status');
    const tokenEl = document.getElementById('token');
    const stepEls = [...document.querySelectorAll('[data-step]')];
    const dotEls = [...document.querySelectorAll('[data-step-dot]')];
    let currentStep = 0;
    let loadedTeams = [];
    let loadedServiceTypes = [];

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

    function gotoStep(idx) {
      currentStep = idx;
      stepEls.forEach((el, i) => el.classList.toggle('active', i === idx));
      dotEls.forEach((el, i) => el.classList.toggle('active', i === idx));
    }

    function readField(id) {
      return (document.getElementById(id).value || '').trim();
    }

    function writeField(id, value) {
      document.getElementById(id).value = value || '';
    }

    function buildConfigFromForm() {
      const selectedTeamRows = [...document.querySelectorAll('.teamRow')];
      const teamRules = selectedTeamRows
        .filter((row) => row.querySelector('.teamEnabled').checked)
        .map((row) => ({
          label: row.querySelector('.teamLabel').value.trim() || row.dataset.teamName,
          match: row.dataset.teamName.toLowerCase(),
          signUpUrl: row.querySelector('.teamSignUpUrl').value.trim(),
        }));

      return {
        PCO_APP_ID: readField('pcoAppId'),
        PCO_SECRET: readField('pcoSecret'),
        PCO_SERVICE_TYPE_ID: readField('serviceTypeSelect'),
        GROUPME_BOT_ID: readField('groupMeBotId'),
        GROUPME_ACCESS_TOKEN: readField('groupMeAccessToken'),
        GROUPME_GROUP_ID: readField('groupMeGroupId'),
        GROUPME_DESTINATION_LABEL: readField('destinationLabel'),
        TEAM_NAMES: teamRules.map((r) => r.label).join(','),
        TEAM_RULES: teamRules,
        DRY_RUN: readField('dryRun') || 'true',
      };
    }

    function refreshReviewJson() {
      const cfg = buildConfigFromForm();
      document.getElementById('reviewJson').value = JSON.stringify(cfg, null, 2);
    }

    async function load() {
      setStatus('Loading saved config...', true);
      const resp = await fetch('/api/config', { headers: headers() });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to load config');
      const cfg = data.data || {};

      writeField('pcoAppId', cfg.PCO_APP_ID);
      writeField('pcoSecret', cfg.PCO_SECRET);
      writeField('groupMeBotId', cfg.GROUPME_BOT_ID);
      writeField('groupMeAccessToken', cfg.GROUPME_ACCESS_TOKEN);
      writeField('groupMeGroupId', cfg.GROUPME_GROUP_ID);
      writeField('destinationLabel', cfg.GROUPME_DESTINATION_LABEL || 'Weekend Safety Alerts');
      writeField('dryRun', String(cfg.DRY_RUN || 'true'));

      if (cfg.PCO_SERVICE_TYPE_ID) {
        const sel = document.getElementById('serviceTypeSelect');
        const opt = document.createElement('option');
        opt.value = cfg.PCO_SERVICE_TYPE_ID;
        opt.textContent = cfg.PCO_SERVICE_TYPE_ID;
        sel.appendChild(opt);
        writeField('serviceTypeSelect', cfg.PCO_SERVICE_TYPE_ID);
      }

      if (Array.isArray(cfg.TEAM_RULES)) {
        loadedTeams = cfg.TEAM_RULES.map((r) => ({ name: r.label || r.match, signUpUrl: r.signUpUrl || '' }));
        renderTeamsFromRules(cfg.TEAM_RULES);
      }

      refreshReviewJson();
      setStatus('Loaded saved config.local.json', true);
    }

    function renderTeams(items) {
      const container = document.getElementById('teamsContainer');
      if (!items || items.length === 0) {
        container.innerHTML = '<div class="muted">No teams found for this service type.</div>';
        return;
      }

      container.innerHTML = items.map((team) => {
        const safeName = String(team.name || '').replace(/"/g, '&quot;');
        return '<div class="teamItem teamRow" data-team-name="' + safeName + '">' +
          '<input class="teamEnabled" type="checkbox" checked />' +
          '<input class="teamLabel" type="text" value="' + safeName + '" />' +
          '<input class="teamSignUpUrl" type="text" placeholder="Optional sign-up URL" />' +
          '</div>';
      }).join('');
    }

    function renderTeamsFromRules(rules) {
      const container = document.getElementById('teamsContainer');
      container.innerHTML = rules.map((rule) => {
        const label = String(rule.label || '').replace(/"/g, '&quot;');
        const match = String(rule.match || label).replace(/"/g, '&quot;');
        const signUpUrl = String(rule.signUpUrl || '').replace(/"/g, '&quot;');
        return '<div class="teamItem teamRow" data-team-name="' + match + '">' +
          '<input class="teamEnabled" type="checkbox" checked />' +
          '<input class="teamLabel" type="text" value="' + label + '" />' +
          '<input class="teamSignUpUrl" type="text" placeholder="Optional sign-up URL" value="' + signUpUrl + '" />' +
          '</div>';
      }).join('');
    }

    async function saveConfig() {
      let payload;
      try {
        payload = JSON.parse(document.getElementById('reviewJson').value || '{}');
      } catch (err) {
        throw new Error('Review JSON is invalid: ' + err.message);
      }

      setStatus('Saving config...', true);
      const resp = await fetch('/api/config', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to save config');
      setStatus('Saved builder config to config.local.json', true);
    }

    async function loadServiceTypes() {
      setStatus('Loading service types...', true);
      const resp = await fetch('/api/pco/service-types', { headers: headers() });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to load service types');
      loadedServiceTypes = data.items || [];
      const sel = document.getElementById('serviceTypeSelect');
      sel.innerHTML = '<option value="">Select a service type</option>';
      loadedServiceTypes.forEach((st) => {
        const opt = document.createElement('option');
        opt.value = st.id;
        opt.textContent = st.name + ' (' + st.id + ')';
        sel.appendChild(opt);
      });
      setStatus('Service types loaded', true);
    }

    async function loadTeams() {
      const serviceTypeId = readField('serviceTypeSelect');
      if (!serviceTypeId) throw new Error('Select a service type first');

      setStatus('Loading teams...', true);
      const resp = await fetch('/api/pco/teams?serviceTypeId=' + encodeURIComponent(serviceTypeId), {
        headers: headers(),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to load teams');

      loadedTeams = data.items || [];
      renderTeams(loadedTeams);
      refreshReviewJson();
      setStatus('Teams loaded. Select teams and optional sign-up URLs.', true);
    }

    document.getElementById('toStep1').addEventListener('click', () => {
      gotoStep(1);
      refreshReviewJson();
    });
    document.getElementById('backTo0').addEventListener('click', () => gotoStep(0));
    document.getElementById('toStep2').addEventListener('click', () => {
      gotoStep(2);
      refreshReviewJson();
    });
    document.getElementById('backTo1').addEventListener('click', () => gotoStep(1));
    document.getElementById('toStep3').addEventListener('click', () => {
      refreshReviewJson();
      gotoStep(3);
    });
    document.getElementById('backTo2').addEventListener('click', () => gotoStep(2));

    document.getElementById('loadServiceTypes')
      .addEventListener('click', () => loadServiceTypes().catch((err) => setStatus(err.message, false)));
    document.getElementById('loadTeams')
      .addEventListener('click', () => loadTeams().catch((err) => setStatus(err.message, false)));
    document.getElementById('saveConfig')
      .addEventListener('click', () => saveConfig().catch((err) => setStatus(err.message, false)));

    ['pcoAppId','pcoSecret','groupMeBotId','groupMeAccessToken','groupMeGroupId','destinationLabel','serviceTypeSelect','dryRun']
      .forEach((id) => {
        document.getElementById(id).addEventListener('input', refreshReviewJson);
        document.getElementById(id).addEventListener('change', refreshReviewJson);
      });
    document.getElementById('teamsContainer').addEventListener('input', refreshReviewJson);
    document.getElementById('teamsContainer').addEventListener('change', refreshReviewJson);

    load().catch(() => {
      writeField('destinationLabel', 'Weekend Safety Alerts');
      writeField('dryRun', 'true');
      refreshReviewJson();
      setStatus('No saved config found yet. Use builder to create one.', true);
    });
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
  const activeUiServer = startUiServer();
  // Keep a strong reference in standalone mode.
  global.__pcsGroupmeUiServer = activeUiServer;
}

module.exports = { app, startUiServer };
