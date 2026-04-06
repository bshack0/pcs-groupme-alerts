const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env');
const envLocalPath = path.resolve(process.cwd(), '.env.local');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
if (fs.existsSync(envLocalPath)) {
  // Load local overrides last so personal secrets/settings take precedence.
  dotenv.config({ path: envLocalPath, override: true });
}

const localConfigPath = path.resolve(process.cwd(), 'config.local.json');
let localConfig = {};
if (fs.existsSync(localConfigPath)) {
  try {
    localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid JSON in config.local.json: ${err.message}`);
  }
}

function getOverride(name) {
  return Object.prototype.hasOwnProperty.call(localConfig, name)
    ? localConfig[name]
    : undefined;
}

function requireSetting(name) {
  const override = getOverride(name);
  const value =
    override !== undefined && override !== null && String(override).trim() !== ''
      ? String(override)
      : process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSetting(name, fallback = '') {
  const override = getOverride(name);
  if (override !== undefined && override !== null && String(override).trim() !== '') {
    return String(override);
  }
  const envValue = process.env[name];
  if (envValue !== undefined && envValue !== null && String(envValue).trim() !== '') {
    return String(envValue);
  }
  return fallback;
}

function parseCsv(value, fallback = '') {
  return String(value || fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeTeamKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function parseJsonEnv(name, defaultValue) {
  const override = getOverride(name);
  const raw =
    override !== undefined && override !== null ? String(override) : process.env[name];
  if (!raw || String(raw).trim() === '') {
    return defaultValue;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${name}: ${err.message}`);
  }
}

const TEAM_NAMES = parseCsv(getSetting('TEAM_NAMES', 'Security,Medical'));

const TEAM_SIGNUP_URLS = parseJsonEnv('TEAM_SIGNUP_URLS', {});
const normalizedTeamSignUpUrls = Object.fromEntries(
  Object.entries(TEAM_SIGNUP_URLS).map(([key, value]) => [
    normalizeTeamKey(key),
    String(value || '').trim(),
  ])
);

const TEAM_RULES = parseJsonEnv('TEAM_RULES', null);
const normalizedTeamRules = Array.isArray(TEAM_RULES)
  ? TEAM_RULES
      .map((rule) => ({
        label: String(rule.label || '').trim(),
        match: String(rule.match || '').trim(),
        signUpUrl: String(rule.signUpUrl || '').trim(),
      }))
      .filter((rule) => rule.label && rule.match)
  : TEAM_NAMES.map((name) => ({
      label: name,
      match: normalizeTeamKey(name),
      signUpUrl:
        normalizedTeamSignUpUrls[normalizeTeamKey(name)] ||
        normalizedTeamSignUpUrls[name] ||
        '',
    }));

const GROUPME_DESTINATION_LABEL = String(
  getSetting('GROUPME_DESTINATION_LABEL', 'Default GroupMe Bot')
).trim();

const GROUPME_GROUP_ID = String(getSetting('GROUPME_GROUP_ID', '')).trim();

const LEGACY_SIGNUP_URLS = {
  medical: getSetting('MEDICAL_SIGNUP_URL', ''),
  'medical response': getSetting('MEDICAL_SIGNUP_URL', ''),
  security: getSetting('SECURITY_SIGNUP_URL', ''),
  'security response': getSetting('SECURITY_SIGNUP_URL', ''),
};

const defaultSignUpUrl = `https://services.planningcenteronline.com/ministries/${requireSetting(
  'PCO_SERVICE_TYPE_ID'
)}/signup_sheet`;

const mergedSignUpUrls = {
  ...LEGACY_SIGNUP_URLS,
  ...normalizedTeamSignUpUrls,
};

const ACTIVE_TEAM_KEYS = normalizedTeamRules
  .map((rule) => normalizeTeamKey(rule.match))
  .filter(Boolean);

module.exports = {
  localConfigPath,
  planningCenter: {
    appId: requireSetting('PCO_APP_ID'),
    secret: requireSetting('PCO_SECRET'),
    serviceTypeId: requireSetting('PCO_SERVICE_TYPE_ID'),
    baseUrl: 'https://api.planningcenteronline.com/services/v2',
  },
  groupMe: {
    botId: requireSetting('GROUPME_BOT_ID'),
    accessToken: requireSetting('GROUPME_ACCESS_TOKEN'),
    // Optional metadata for setup clarity; GroupMe bots post by botId.
    groupId: GROUPME_GROUP_ID,
    destinationLabel: GROUPME_DESTINATION_LABEL,
    baseUrl: 'https://api.groupme.com/v3',
  },
  teams: {
    names: TEAM_NAMES,
    rules: normalizedTeamRules,
    activeTeamKeys: ACTIVE_TEAM_KEYS,
    signUpUrls: {
      defaultSignUpUrl,
      ...mergedSignUpUrls,
    },
  },
  flags: {
    dryRun: String(getSetting('DRY_RUN', '')).toLowerCase() === 'true',
  },
};


