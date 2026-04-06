const config = require('./config');
const {
  getServiceTypes,
  getTeamsForServiceType,
  getPlansForWeekRange,
} = require('./services.planningCenter');

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

async function runSetupCheck() {
  console.log('Running setup check...');
  console.log('');

  console.log('GroupMe destination:');
  console.log(`- Label: ${config.groupMe.destinationLabel || 'Default GroupMe Bot'}`);
  console.log(`- Bot ID: ${config.groupMe.botId}`);
  if (config.groupMe.groupId) {
    console.log(`- Group ID (metadata): ${config.groupMe.groupId}`);
  }
  console.log('');

  console.log('Planning Center connectivity check...');
  const serviceTypes = await getServiceTypes();
  const chosenServiceType = serviceTypes.find(
    (st) => String(st.id) === String(config.planningCenter.serviceTypeId)
  );
  if (!chosenServiceType) {
    throw new Error(
      `Configured PCO_SERVICE_TYPE_ID (${config.planningCenter.serviceTypeId}) was not found in this account.`
    );
  }
  console.log(
    `- OK: service type ${chosenServiceType.id} (${chosenServiceType.attributes?.name || 'Unknown'})`
  );
  console.log('');

  console.log('Team selection check...');
  const teams = await getTeamsForServiceType(config.planningCenter.serviceTypeId);
  const availableTeamNames = teams.map((t) => String(t.attributes?.name || ''));
  const missing = [];

  const configuredRules = Array.isArray(config.teams.rules) ? config.teams.rules : [];
  for (const rule of configuredRules) {
    const match = normalize(rule.match);
    const matched = availableTeamNames.some((name) => normalize(name).includes(match));
    if (!matched) {
      missing.push(rule.label || rule.match);
    }
  }

  if (missing.length > 0) {
    console.log('- WARNING: Some configured teams did not match Planning Center teams:');
    for (const name of missing) {
      console.log(`  - ${name}`);
    }
  } else {
    console.log('- OK: all configured teams match Planning Center teams.');
  }
  console.log('');

  console.log('Upcoming plan check (next 7 days, dry read only)...');
  const now = new Date();
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const plans = await getPlansForWeekRange(
    config.planningCenter.serviceTypeId,
    now,
    inSevenDays
  );
  console.log(`- Found ${plans.length} plan(s).`);
  console.log('');

  console.log('Setup check complete.');
}

if (require.main === module) {
  runSetupCheck().catch((err) => {
    console.error('Setup check failed:', err.message || err);
    process.exit(1);
  });
}

module.exports = { runSetupCheck };
