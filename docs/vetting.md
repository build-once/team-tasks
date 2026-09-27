# Vetting third-party tools

**Course link:** *Building Real Apps with AI*, Book 3 Lesson L27 ("Vet and pin every MCP server, plugin, extension and AI CLI before it gets a permission") and Book 3 Lesson S12 ("Treat everything your agent reads as possibly hostile").

## Why

Skills, plugins and connectors (MCP servers) run with your permissions. A skill is mostly text *for the AI to follow*, so a bad one does not need any code at all: one hidden sentence can tell the AI to do something and not mention it. Treat anything you download like a stranger's USB stick.

## Step 1: scan it

Download or clone the tool into a folder **without installing or running it**, then:

```
node scripts/vet-tool.mjs path/to/the-tool
```

The scan only reads files. It does not run, install or import anything, and it makes no network calls. It lists each finding with file, line and severity (HIGH, MEDIUM, LOW), then a verdict:

- **REVIEW NEEDED**: at least one HIGH or MEDIUM finding. Read each one.
- **No obvious red flags**: none of the known patterns matched.
- **UNVERIFIED**: nothing could be read (empty or missing folder). An empty scan proves nothing.

> **A clean scan is not proof of safety.** It only means none of these known patterns matched. New tricks will not match.

## What it looks for

| Finding | Why it matters |
|---|---|
| A download piped straight into a shell (`curl`/`wget`/`iwr` into `sh`/`bash`/`iex`) | Runs whatever the server sends today, unseen. |
| `eval` / `exec` / `os.system` / `shell=True` / `child_process` with a variable | Can run commands built from untrusted input. |
| Reads of credential folders (ssh, aws, gnupg, kube), browser cookies or saved passwords, or the keychain | Credential theft. |
| Collecting *all* environment variables in a file that also sends network requests | Classic key-stealing pattern. |
| `@latest`, unpinned `npx` / `uvx` / `pip install`, `install`/`postinstall` scripts in `package.json` | You get whatever is published tomorrow, and install scripts run the moment you install. |
| Hidden Unicode (zero-width, text-direction or "tag" characters) and long base64 blobs | Text that does not say what it looks like; hidden payloads. |
| Text aimed at the AI: "ignore previous instructions", "do not tell the user", "without asking the user", fake `<IMPORTANT>` tags | Prompt injection. These stay HIGH even inside Markdown, because Markdown is where they hide. |
| Telemetry / analytics calls | Your data may be leaving. Check what is sent and whether you can opt out. |
| The flag that turns off the assistant's permission prompts (`--dangerously-skip-permissions`) or a bypass-permissions mode | Removes the safety net this kit adds. |
| Missing LICENSE, or an AGPL, source-available, proprietary or unrecognised one | You may have no right to use it, or obligations you did not expect. A human must decide. |

Findings inside documentation files are one level less severe than the same thing in code (a README that *mentions* a command is less direct than code that runs it). The only exceptions are AI-aimed text and hidden characters.

## Step 2: read what it flagged

For each HIGH or MEDIUM finding, open the file at that line and ask: *is this what the tool says it does?* If you do not understand a line, do not install the tool. Ask someone, or ask the AI to explain the line **without running anything**.

## Step 3: configure it safely

If you do install a connector, start from the safe configs in `configs/mcp/` (notes in `configs/mcp/README.md`):

- **GitHub:** read-only mode, lockdown mode, a minimal toolset, and a fine-grained token for one repository.
- **Notion:** an integration with only "Read content" access, shared with only the pages it needs.
- **Playwright:** a pinned version, `--isolated`, localhost or a staging preview only, and no extra capabilities.

Always pin versions. Keep tokens in environment variables, never in files you commit.

## Proving the scanner works

```
node scripts/vet-tool.mjs --selftest
```

It builds a deliberately malicious practice folder and a harmless one in a temporary directory. It checks that every rule fires on the malicious one, and that the harmless one, full of near-misses (`regex.exec(...)`, "SSH into your server", "tell the user the result", pinned installs, an MIT licence), raises no HIGH or MEDIUM findings. That near-miss control is what shows the scanner does not simply flag everything.

## Sources (checked 2026-09-25)

- GitHub MCP server: https://github.com/github/github-mcp-server, and its configuration guide https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md (`--read-only` / `GITHUB_READ_ONLY`, `--lockdown-mode` / `GITHUB_LOCKDOWN_MODE`, `--toolsets` / `GITHUB_TOOLSETS`, `--tools` / `GITHUB_TOOLS`, `--exclude-tools` / `GITHUB_EXCLUDE_TOOLS`, `GITHUB_PERSONAL_ACCESS_TOKEN`). Release list: https://github.com/github/github-mcp-server/releases (v1.12.2, the newest on 2026-09-25, is the pinned container tag).
- Notion MCP server: https://github.com/makenotion/notion-mcp-server (`npx -y @notionhq/notion-mcp-server`, `NOTION_TOKEN`, read-only integration via "Read content" on the Configuration tab). Version 2.5.2 from https://registry.npmjs.org/@notionhq/notion-mcp-server/latest.
- Playwright MCP: https://github.com/microsoft/playwright-mcp (`--isolated`, `--headless`, `--allowed-origins`, `--blocked-origins`, `--block-service-workers`, `--caps`, `--allow-unrestricted-file-access`, `--output-dir`; "not a security boundary"). Version 0.0.82 from https://registry.npmjs.org/@playwright/mcp/latest.
