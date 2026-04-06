const axios = require('axios');
const config = require('./config');
const { formatDisplayDate, formatServiceTime } = require('./utils.date');
const { format, startOfDay } = require('date-fns');

const groupMeClient = axios.create({
  baseURL: config.groupMe.baseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

function statusToEmoji(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'confirmed') return '✅';
  if (s === 'declined') return '❌';
  return '⏳';
}

function getSundayDateKey(serviceTime) {
  if (!serviceTime) return null;
  const date = new Date(serviceTime);
  if (isNaN(date.getTime())) return null;
  
  // Get the date at midnight local time and format as local date string (YYYY-MM-DD)
  const localDate = startOfDay(date);
  return format(localDate, 'yyyy-MM-dd');
}

function normalizeTeamKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function getConfiguredTeamRules() {
  const rules = Array.isArray(config.teams.rules) ? config.teams.rules : [];
  if (rules.length > 0) {
    return rules;
  }
  const names = Array.isArray(config.teams.names) ? config.teams.names : [];
  return names.map((name) => ({
    label: name,
    match: normalizeTeamKey(name),
    signUpUrl: '',
  }));
}

function getSignUpUrlForTeam(teamRule, teamName) {
  const byRule = teamRule && teamRule.signUpUrl ? String(teamRule.signUpUrl) : '';
  if (byRule) return byRule;

  const key = normalizeTeamKey(teamName);
  const byExact = config.teams.signUpUrls && config.teams.signUpUrls[key];
  if (byExact) return byExact;

  return (
    (config.teams.signUpUrls && config.teams.signUpUrls.defaultSignUpUrl) || ''
  );
}

function formatScheduleMessage(members, targetDate, formatTimeFn, neededPositions = []) {
  // Get the target date key (YYYY-MM-DD format) using local date
  const targetDateKey = targetDate instanceof Date && !Number.isNaN(targetDate.getTime())
    ? format(startOfDay(targetDate), 'yyyy-MM-dd')
    : null;
  
  // Group members by date, filtering to only include the target date
  const byDate = {};
  for (const m of members) {
    const dateKey = getSundayDateKey(m.serviceTime);

    // Only keep members scheduled for the target date
    if (targetDateKey && dateKey) {
      if (dateKey !== targetDateKey) {
        continue; // Skip dates that don't match the target date
      }
    }
    if (!dateKey) {
      // Skip members without service times
      continue;
    }
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(m);
  }
  
  const lines = [];

  function pushLine(line) {
    lines.push(line);
  }

  // Add greeting at the beginning with date included
  if (targetDate instanceof Date && !Number.isNaN(targetDate.getTime())) {
    const dateHeader = formatDisplayDate(targetDate);
    pushLine(`Here is your ${dateHeader} rundown. Here is who is on deck:`);
    pushLine(''); // Blank line after greeting
  }

  // Only show dates that have assignments (skip empty days)
  const datesToShow = Object.keys(byDate).sort();
  
  // Process each date that has assignments
  for (const dateKey of datesToShow) {
    const dateMembers = byDate[dateKey];
    
    // Skip if no members for this date (shouldn't happen, but safety check)
    if (!dateMembers || dateMembers.length === 0) {
      continue;
    }
    
    const teamRules = getConfiguredTeamRules();
    const teamBuckets = {};
    for (const rule of teamRules) {
      teamBuckets[rule.match] = [];
    }

    // Sort by service time (lowest to highest)
    function sortByTime(a, b) {
      if (!a.serviceTime && !b.serviceTime) return 0;
      if (!a.serviceTime) return 1; // TBD goes to end
      if (!b.serviceTime) return -1;
      return a.serviceTime.getTime() - b.serviceTime.getTime();
    }

    for (const m of dateMembers) {
      const memberTeamName = normalizeTeamKey(m.teamName);
      const rule = teamRules.find((r) => memberTeamName.includes(r.match));
      if (!rule) continue;
      teamBuckets[rule.match].push(m);
    }

    // Helper to add a member line
    function addMemberLine(member) {
      const timeText = member.serviceTime ? formatTimeFn(member.serviceTime) : 'TBD';
      const emoji = statusToEmoji(member.status);
      const displayName = member.personName || 'Unknown';
      // Format: Status - Time - Person (removed position)
      const line = `${emoji} - ${timeText} - ${displayName}`;
      pushLine(line);
    }

    // Helper to add an open position line (no URL - URL goes at bottom of team)
    function addOpenPositionLine(member) {
      const timeText = member.serviceTime ? formatTimeFn(member.serviceTime) : 'TBD';
      // Format: Emoji - Time - "Sign Up Available" (matches member format, but with emoji instead of status)
      const line = `⚠️ - ${timeText} - Sign Up Available`;
      pushLine(line);
    }

    for (const rule of teamRules) {
      const membersForTeam = (teamBuckets[rule.match] || []).sort(sortByTime);

      const confirmedOrPending = membersForTeam.filter((m) => m.status !== 'declined');
      const neededForTeam = neededPositions.filter((np) => {
        const npDateKey = getSundayDateKey(np.serviceTime);
        if (npDateKey !== dateKey) return false;
        const npTeamName = normalizeTeamKey(np.teamName);
        return npTeamName.includes(rule.match);
      });

      const neededByTime = {};
      for (const np of neededForTeam) {
        const timeKey = np.serviceTime ? np.serviceTime.toISOString() : 'TBD';
        neededByTime[timeKey] = (neededByTime[timeKey] || 0) + (np.quantity || 1);
      }

      const assignedByTime = {};
      for (const member of confirmedOrPending) {
        const timeKey = member.serviceTime ? member.serviceTime.toISOString() : 'TBD';
        assignedByTime[timeKey] = (assignedByTime[timeKey] || 0) + 1;
      }

      const openByTime = {};
      for (const timeKey in neededByTime) {
        const open = neededByTime[timeKey] - (assignedByTime[timeKey] || 0);
        if (open > 0) openByTime[timeKey] = open;
      }

      if (confirmedOrPending.length === 0 && Object.keys(openByTime).length === 0) {
        continue;
      }

      pushLine(`👥 ${String(rule.label || rule.match).toUpperCase()}:`);

      const allItems = [...confirmedOrPending.map((m) => ({ ...m, isOpen: false }))];
      for (const timeKey in openByTime) {
        const openCount = openByTime[timeKey];
        const serviceTime = timeKey !== 'TBD' ? new Date(timeKey) : null;
        for (let i = 0; i < openCount; i += 1) {
          allItems.push({ serviceTime, isOpen: true });
        }
      }
      allItems.sort(sortByTime);

      for (const item of allItems) {
        if (item.isOpen) addOpenPositionLine(item);
        else addMemberLine(item);
      }

      if (Object.keys(openByTime).length > 0) {
        const signUpUrl = getSignUpUrlForTeam(rule, rule.match);
        if (signUpUrl) pushLine(`Sign up: ${signUpUrl}`);
      }

      pushLine('');
    }
  }

  pushLine(''); // Blank line before legend
  pushLine('✅ = Confirmed | ⏳ = Pending');

  return lines.join('\n');
}

async function postMessage(text, pictureUrl) {
  if (config.flags.dryRun) {
    console.log('[DRY_RUN] Would post to GroupMe:\n', text);
    return;
  }

  const payload = {
    bot_id: config.groupMe.botId,
    text,
  };
  if (pictureUrl) {
    payload.picture_url = pictureUrl;
  }

  const resp = await groupMeClient.post('/bots/post', payload, {
    params: {
      token: config.groupMe.accessToken,
    },
  });

  if (resp.status !== 202) {
    console.warn(
      `Unexpected GroupMe response status: ${resp.status}`,
      resp.data
    );
  }
}

module.exports = {
  postMessage,
  formatScheduleMessage,
};


