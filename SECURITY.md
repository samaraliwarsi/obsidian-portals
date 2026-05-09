# Security Policy for Portals

## Reporting a Vulnerability

If you discover a possible security issue, please **do not create a public issue**. Instead, report it privately using GitHub’s built‑in vulnerability reporting:
- Go to the [Security tab](https://github.com/samaraliwarsi/obsidian-portals/security) of this repository,
  and click **“Report a vulnerability”**.
All reports will be acknowledged within a week, and I’ll work with you to validate and resolve the issue
before any public disclosure. Security reports are best done privately to avoid exposing vulnerabilities before a fix is ready. 
## What Portals Does (and Doesn’t Do)

- **No network access** – Portals never connects to the internet.  It makes no HTTP requests, no telemetry, and no analytics.
- **No data collection** – All preferences are stored **locally** inside your vault’s `data.json`, using Obsidian’s built‑in `saveData()` / `loadData()` APIs.  No information ever leaves your vault.
- **No third‑party scripts** – The plugin only runs the JavaScript that is bundled in the installed release. No external code is loaded at runtime.
- **Vault‑safe operations** – Every file action (create, rename, delete, move) uses Obsidian’s official Vault API. The plugin cannot read or write outside your vault.
- **No sensitive data** – Portals does not store or process any personal information, passwords, or API keys.
## Supported Versions
Only the latest release version receives security patches.  Please update to the most recent version before reporting an issue.
## Privacy
Portals respects your privacy – there are no hidden trackers, no usage logging,
and no external dependencies that phone home.