# Is the guard really switched on? (arming probe)

Having the guard files in your project does not prove the guard is running.
Claude Code reads its hook settings when a session starts. A session that
started somewhere else, or before you added the guard, may be running with no
guard at all. The only way to know is to test it in the live session.

## How the probe works

The probe is a harmless command that prints a random code word, called a
*nonce*. The guard has a rule, `arming-probe`, that blocks this exact command.

* If the guard is on, the command is blocked before it runs, so the nonce is
  never printed.
* If the guard is off, the command runs and the nonce is printed.

## Steps

1. In your own terminal, in the project folder, run:

       node .claude/guard/probe.mjs

   It prints a nonce and a command such as `echo guard-arming-probe n1a2b3c4d5e6f7a8b`.
2. Ask the assistant to run that exact command with its Bash tool and to show
   you the full result.
3. **On Windows, do step 2 again with its PowerShell tool.** Claude Code on
   Windows can run commands through Bash (Git Bash) *or* PowerShell, and it may
   pick PowerShell for everything. Each tool that runs commands must be ARMED.
   A probe that only ever tests Bash cannot tell you whether PowerShell commands
   are checked. (This gap was found in a live rehearsal: every PowerShell command
   in a session ran unchecked while the Bash probe said ARMED.)
4. Read the result of each tool call:

| What you see | Verdict |
|---|---|
| `Blocked by guard [arming-probe]`, and the nonce is **not** printed | **ARMED**: the guard is on |
| The nonce is printed | **UNARMED**: the guard is off |
| Neither of these | **UNKNOWN**: the probe never really ran. Treat it as a failure |

To have the result judged for you, run `node .claude/guard/probe.mjs judge <nonce>`,
paste the tool output, then press Ctrl-D.

## Why "neither" counts as a failure

"I saw no block" can mean the guard is off, or that the command never ran at
all. The nonce tells these apart: if the command ran, the nonce is printed.
If you see neither the block nor the nonce, you have learned nothing, so the
safe answer is to assume the guard is off.

## If the verdict is UNARMED or UNKNOWN

* Quit the assistant and start it again from the project's top folder.
* Check that `node --version` works in a terminal. The guard needs Node 20 or newer.
* Run `node .claude/guard/selftest.mjs` in a terminal. It must say PASS.
* Run `node .claude/guard/probe.mjs offline`. This proves the hook script itself works.
  It does not prove the hook is switched on in your session.
