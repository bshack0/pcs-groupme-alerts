## Planning Center -> GroupMe Alert Bot

Self-hosted open-source bot for churches.  
Each church forks/clones this repo and deploys its own instance (Railway, VPS, or any always-on Node environment).

The bot pulls Planning Center Services assignments and open spots, then posts formatted alerts to your configured GroupMe bot destination.

## Quick Start

1. Install dependencies:
   - `npm install`
2. Create `.env` next to `package.json` (template below).
3. Run setup validation:
   - `npm run setup-check`
4. Dry-run a real message build:
   - `DRY_RUN=true npm run run-once`
5. Start scheduler:
   - `npm start`

## .env Template

```env
# Planning Center
PCO_APP_ID=your_pco_app_id
PCO_SECRET=your_pco_secret
PCO_SERVICE_TYPE_ID=123456

# GroupMe destination
GROUPME_BOT_ID=your_groupme_bot_id
GROUPME_ACCESS_TOKEN=your_groupme_access_token

# Optional destination metadata (for docs/log clarity only)
GROUPME_GROUP_ID=optional_group_id
GROUPME_DESTINATION_LABEL=Weekend Safety Alerts

# Team selection (backward-compatible default: Security,Medical)
TEAM_NAMES=Security,Medical

# Optional team rules (JSON array). If set, this overrides TEAM_NAMES.
# TEAM_RULES=[{"label":"Security Team","match":"security","signUpUrl":"https://example.org/security-signup"},{"label":"Medical Team","match":"medical","signUpUrl":"https://example.org/medical-signup"}]

# Optional per-team signup URL overrides keyed by team match/name
# TEAM_SIGNUP_URLS={"security":"https://example.org/security-signup","medical":"https://example.org/medical-signup"}

# Optional legacy signup URL keys (still supported)
# MEDICAL_SIGNUP_URL=https://example.org/medical-signup
# SECURITY_SIGNUP_URL=https://example.org/security-signup

# Set true to log instead of posting
DRY_RUN=false
```

## Team and Channel Selection

- Team selection is config-driven:
  - `TEAM_NAMES` for simple CSV setup.
  - `TEAM_RULES` for explicit labels, match text, and per-team signup URLs.
- GroupMe routing is set by:
  - `GROUPME_BOT_ID` (used for posting)
  - `GROUPME_ACCESS_TOKEN` (API auth)
- `GROUPME_GROUP_ID` is optional metadata for setup clarity.

## Commands

- `npm run setup-check`  
  Validates Planning Center connectivity, service type, team matching, and shows routing target.

- `npm run smoke-check`  
  Alias of setup-check for pre-deploy smoke validation.

- `npm run run-once`  
  Executes one posting cycle immediately.

- `npm run test-run`  
  Sunday-focused debug run using test helper flow.

- `npm start`  
  Starts hourly scheduler loop.

- `npm run start:ui`  
  Starts the built-in admin UI for managing runtime config overrides.

- `npm run start:all`  
  Runs scheduler and admin UI together in one process.

## Admin UI (deployed management)

This project now includes a lightweight web UI so a deployed instance can be managed without editing env files directly.

- Start it with `npm run start:ui`
- Open `/ui` on your deployed app
- The UI saves settings to `config.local.json` (gitignored)
- `config.local.json` overrides `.env` and `.env.local` at runtime

Optional security:

- Set `UI_ADMIN_TOKEN` in your deployment environment
- Then all `/api/config` calls require `x-admin-token`
- In the UI page, paste that token into the Admin token field before Load/Save

Recommended deployment pattern:

- Easiest single service: `npm run start:all`
- Or separate processes:
  - scheduler: `npm start`
  - UI: `npm run start:ui`
- Keep a persistent filesystem if you want `config.local.json` changes to survive restarts

## Deployment Notes

- This project is intended for self-hosting per church.
- For Railway or similar:
  - set env vars in platform settings
  - deploy as a long-running worker/service
  - start command: `npm start`
- For cron-style invocation:
  - run `npm run run-once` on your schedule
  - keep `DRY_RUN=true` until you verify output

## Troubleshooting

- Planning Center auth errors:
  - verify `PCO_APP_ID` and `PCO_SECRET`
- Service type not found:
  - confirm `PCO_SERVICE_TYPE_ID` belongs to your account
- No matching teams:
  - adjust `TEAM_NAMES` or `TEAM_RULES[*].match` to align with actual team names
- Wrong posting target:
  - verify `GROUPME_BOT_ID` and token pair are for the intended GroupMe bot


