# Safe connector (MCP) configs

JSON cannot hold comments, so the notes for each file are here. Each file is a ready-to-copy `mcpServers` block (the shape Claude Code reads from a project `.mcp.json`). Copy the block you need into your own `.mcp.json`, then follow the notes.

Before adding **any** connector, vet it: `node scripts/vet-tool.mjs <downloaded-folder>` and read `docs/vetting.md`.

Flag and variable names below were checked against each project's official README on 2026-09-25 (links in `docs/vetting.md`). Versions were checked against the npm registry / GitHub releases on the same day. Check them again before you rely on them; tools change fast.

## github.readonly.json - GitHub, read-only, locked down

| Setting | What it does |
|---|---|
| `GITHUB_READ_ONLY=1` | Read-only mode. The server README says it disables every tool that is not read-only, even if a toolset asks for it. (Flag form: `--read-only`.) The value `1` means "on": the server's own README uses `GITHUB_READ_ONLY=1` and `GITHUB_LOCKDOWN_MODE=1`. |
| `GITHUB_LOCKDOWN_MODE=1` | Lockdown mode. In public repositories the server only surfaces content from users with push access. The project calls it a *best-effort* filter to reduce prompt-injection risk; it is not a guarantee. (Flag form: `--lockdown-mode`.) |
| `GITHUB_TOOLSETS=repos,issues,pull_requests` | A minimal toolset instead of `all`. Remove any you do not need. You can go narrower still with `GITHUB_TOOLS=<tool>,<tool>`. |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | Use a **fine-grained** personal access token limited to **one repository**, with **read-only** permissions (Contents: read, Issues: read, Pull requests: read, Metadata: read). Give it a short expiry. The token is the real limit: read-only mode is a second layer, not the only one. |
| `${GITHUB_MCP_READONLY_TOKEN}` | The token comes from an environment variable on your machine, never pasted into the file. Claude Code expands `${VAR}` in `.mcp.json`; other clients may not. Check yours. |
| `:v1.12.2` | Pinned to release `v1.12.2`, the newest on 2026-09-25. The project's release workflow publishes the image under the release tag, `v` included. Stronger still: run `docker pull ghcr.io/github/github-mcp-server:v1.12.2`, note the `sha256:` digest it prints, and pin by digest (`...github-mcp-server@sha256:...`) so the image can never change under you. Never use `latest`. |

## notion.readonly.json - Notion, read-only integration

| Setting | What it does |
|---|---|
| `@notionhq/notion-mcp-server@2.5.2` | Pinned version (latest on npm on 2026-09-25). Never `@latest`. |
| `NOTION_TOKEN` | The integration token, read from `${NOTION_READONLY_TOKEN}` on your machine. |
| Read-only | Read-only is set **in Notion, not in this file.** The official README says to give the integration only **"Read content"** access on its **Configuration** tab. Do that when you create the integration. |
| Page sharing | The integration can see only the pages you share with it. Share the smallest set of pages. |

The Notion README also warns that exposing workspace data to an AI carries "a non-zero risk". Read-only limits what the AI can change, but it can still read and repeat what it sees.

## playwright.isolated.json - browser automation, isolated

| Setting | What it does |
|---|---|
| `@playwright/mcp@0.0.82` | Pinned version (latest on npm on 2026-09-25). The official README example uses `@latest`; do not copy that. |
| `--isolated` | Keeps the browser profile in memory and never saves it to disk, so no cookies or logins leak between sessions. |
| `--headless` | No visible browser window. |
| `--allowed-origins "http://localhost:3000;http://127.0.0.1:3000"` | Only your local app. Replace with your **staging preview URL** if you test there. Never production. Semicolon-separated. |
| `--block-service-workers` | Blocks service workers. |
| `--output-dir ./.playwright-mcp` | Screenshots and traces land in one folder you can gitignore. |
| Unsafe tools off | No `--caps` (so the extra `devtools`, `network`, `storage` and `config` capabilities stay off), no `--allow-unrestricted-file-access`, no `--extension` or `--cdp-endpoint` (those attach to your real, logged-in browser), no `--user-data-dir` or `--storage-state` pointing at real logins. |

**Important:** the Playwright README says `--allowed-origins` "does not serve as a security boundary" and that Playwright MCP "is **not** a security boundary". The allow-list stops accidents, not attackers. Keep secrets and production logins out of any browser the AI drives.
