---
name: ai-feature-safety
description: Guardrails for features in your own product that call an AI model. Never say "done" until the write is checked, cap the spending, use evals as a gate before changes, and treat model output as untrusted input. Use when building a chatbot, AI summary, AI agent or anything that calls a model API, or when the user says "add AI to my app", "the bot said it saved it but it didn't", "our AI bill spiked" or "let's change the prompt".
license: Apache-2.0
---

# AI feature safety

A model is a very capable guesser. Your product must check its work, limit its budget, and never let its words be mistaken for facts.

## When to use
- Building or changing any feature that calls a model API.
- Changing a prompt, a model or a model setting.
- When the AI says it did something that did not happen, or when costs jump.

## Always / Ask first / Never
### Always
- After any action the model triggers, read the result back from the database before telling the user "done". The message comes from the check, not from the model's words.
- Cap spending in three places: a budget limit at the provider, per-user or per-day limits in your app, and a maximum token count and timeout on each call.
- Keep a set of evals: fixed example inputs with the expected behaviour. Run them before any prompt or model change, and block the change if the score drops.
- Treat model output as untrusted input: check its shape, escape it before showing it as HTML, and only allow actions from a fixed list.
- Keep API keys on the server.

### Ask first
- Before raising a spending limit.
- Before letting the model take actions with real effects, such as sending email, spending money or removing data.
- Before switching to a different model or model version.

### Never
- Never treat the model saying "I've saved your booking" as proof.
- Never put the model API key in frontend code.
- Never run model output as code, a shell command or a database query, or show it as raw HTML.
- Never ship a prompt change without running the evals.

## Steps
1. **List the actions.** Write down everything the feature can do. Mark each action that changes something.
2. **Check every write.** For each action: the code does it, then reads it back. The user sees "saved" only when the read-back matches.
3. **Set the caps.** Provider budget limit, in-app per-user limit, a maximum token count per call, a timeout, and alerts at 50% and 80% of budget.
4. **Build the evals.** At least 20 cases, including hard ones: attempts to override your instructions hidden in user input, empty input, off-topic requests. Store the expected outcomes. A script runs them and prints how many passed out of how many.
5. **Gate on the evals.** Run them in CI. A drop in score blocks the merge.
6. **Validate the output.** Parse it against a schema. Reject or retry on a mismatch. Escape it before display.
7. **Log metadata, not content.** Tokens, cost and response time: yes. Users' private text: no.

## Evidence to show
- The read-back check, and a test showing "done" appears only after a confirmed write.
- The spending limits as set (provider, app, per call).
- The eval run output with its count, for example "23 of 24 passed", before and after the change.
- The result of an instruction-override test case.

## Red flags
- "The AI confirmed it saved it."
- "We'll add a spending limit later."
- "I tweaked the prompt and it seemed better in a couple of tries."
- "We show the AI's HTML directly."
- "The model decides which SQL to run."

## Course lessons
- Book 1 Ch 20: adding an AI feature safely.
- Book 2 Ch 18: costs, limits and evals.
- Book 3 Ch 22: untrusted model output and agent actions.
