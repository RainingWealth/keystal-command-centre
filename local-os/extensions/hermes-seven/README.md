# Keystal × Hermes: Seven Capability Upgrade

Target: existing Keystal OS on the owner's Mac (http://127.0.0.1:8766). Keystal remains the control centre and Hermes remains its agent backend. This adds no new database, cloud host, public access, or alternative task manager. The GitHub Pages preview is static and cannot run these plugins.

## The seven items in the supplied TikTok screenshots

| Screen | Capability | Source | Where it runs | Boundary |
|---|---|---|---|---|
| 01 | Answers become apps | sagarmainkar/hermes-genui | Hermes Desktop | Desktop renderer; Keystal local chat stays text; disabling tool search may raise token use |
| 02 | Build Keynote decks | iwork-studio | Local macOS MCP | Apple apps and uv required; access limited to ~/Keystal/outputs/ai-artifacts |
| 03 | Every agent on one screen | olympus | Hermes dashboard, localhost:9119/olympus | Explicitly set controls=false; no public dashboard |
| 04 | Live published pages | super-artifacts | External hosted MCP | User must approve OAuth; external service stores pages/submissions |
| 05 | Test cheaper models | understudy | Hermes + Desktop scorecards | Candidate/judge providers receive redacted past conversations; usage costs money |
| 08 | Turn public websites into tools | webmint | Hermes local browser | Public/signed-out websites only; site changes may break extraction |
| 09 | Kanban recovery | kanban-empowered | Hermes gateway, worker profiles and Telegram | Can unblock/reassign tasks; exact Hermes revision/profile compatibility must be checked |

## Install on the Mac (not in ChatGPT, GitHub or GitHub Pages)

After this PR is merged or checked out in the Mac's existing checkout:

~~~bash
cd ~/Keystal/keystal-command-centre
bash local-os/extensions/hermes-seven/install.sh --plan
bash local-os/extensions/hermes-seven/install.sh --status
bash local-os/extensions/hermes-seven/install.sh --install-core
~~~

The installer requires interactive Hermes consent. It backs up nonsecret Hermes config outside the repository, fences iWork write paths, disables Olympus controls, and caps Understudy auditions at $0.50 each. It does not run auditions, submit web forms, start scheduled jobs, authorize accounts, restart the gateway, or expose any ports.

**Hermes >=0.22.5 is required for the full pack.** Check the actual installed version; run hermes update --check if needed. The script does not auto-update Hermes. Existing providers, logins, skills, ClickUp, n8n, Airtable, gateways, and tasks are not migrated or replaced.

When no live workers are executing:

~~~bash
hermes plugins list
hermes plugins doctor olympus
hermes plugins doctor understudy
hermes plugins doctor webmint
hermes plugins doctor iwork-studio
hermes plugins doctor hermes-genui
hermes gateway restart
hermes dashboard
~~~

In Hermes Desktop open Capabilities > Plugins and separately enable the Desktop UI pieces for GenUI and Understudy (and Olympus where offered). The Olympus tab is at http://127.0.0.1:9119/olympus by default. The Keystal Toolkit page links there, but does not claim the features are verified.

For **GenUI**, some models need hermes config set tools.tool_search.enabled off to render large boards. This exposes more tool definitions on every call. Prefer testing in a separate Hermes profile rather than increasing token spend in Keystal's existing main profile.

For **Understudy**, first test with fictional/sanitized sessions in a separate profile. Do not send real regulated insurance-client or financial information to other providers. The score measures single decisions, not end-to-end agent reliability; the pictured 90% result is not Keystal's result. On approved, sanitized data, follow the upstream CLI examples: hermes understudy estimate provider:model --sample 10; hermes understudy audition provider:model --sample 10. Only use providers already configured and reviewed. Actual monthly savings must be measured.

For **iWork**, allow macOS Automation for Keynote and ensure uv is available. Generate a dummy slide in ~/Keystal/outputs/ai-artifacts before touching branded documents.

For **webmint**, first mint a deterministic read-only extractor on a public site. Never turn login-required insurer portals, payment pages or sensitive client systems into a blind replay tool.

## Optional integrations are disabled by design

~~~bash
bash local-os/extensions/hermes-seven/install.sh --install-optional
~~~

**Super Artifacts** requires explicit external-account authorization. Only after reviewing data hosting/privacy and choosing the correct account:

~~~bash
hermes plugins enable super-artifacts
hermes mcp add super-artifacts --url https://superartifacts.app/mcp --auth oauth --connect-timeout 300
~~~

Verify account and publish only dummy PRIVATE content. Its published materials and form responses are hosted externally, not stored in Keystal SQLite.

**Kanban Empowered** actively changes Hermes Kanban states and listens for Telegram replies. Install disabled, review current INSTALL.md, assess all Hermes profile versions, then enable in a disposable test profile and run hermes kanban-empowered doctor before any production rollout. It is intentionally NOT run by the core installer.

## Rollback

~~~bash
bash local-os/extensions/hermes-seven/install.sh --disable
~~~

This disables plugins but does not delete installed code/plugin reports or undo task changes. If Super Artifacts was linked, separately run hermes mcp remove super-artifacts and revoke the provider authorization. The backup folder is ~/Keystal/outputs/keystal-os/local-state/hermes-upgrade-backups and should never be committed. The script does not copy ~/.hermes/.env.

## Verified sources

- https://github.com/stffinfcti/understudy
- https://github.com/sagarmainkar/hermes-genui
- https://hermes-agent.nousresearch.com/marketplace/olympus
- https://hermes-agent.nousresearch.com/marketplace/iwork-studio
- https://hermes-agent.nousresearch.com/docs/plugins/webmint
- https://hermes-agent.nousresearch.com/marketplace/super-artifacts
- https://hermes-agent.nousresearch.com/marketplace/kanban-empowered
- https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins

Community catalog inclusion is not a security audit. Nothing in this PR has been executed on the Mac.
