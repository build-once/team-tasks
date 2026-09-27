// scripts/lib/secrets.mjs — shared secret-pattern set for Build Once tools.
// Zero dependencies. Used by launch-check.mjs (find) and handoff.mjs (redact).
// Callers must NEVER print a matched value — only the pattern name and a location.

const PLACEHOLDER_HINTS = [
  'example', 'your', 'xxxx', '****', 'changeme', 'change_me', 'placeholder', 'dummy',
  '<', '${', 'process.env', 'os.environ', 'redacted', 'fake', 'sample',
];

function looksLikePlaceholder(value) {
  const v = String(value).toLowerCase();
  return PLACEHOLDER_HINTS.some((h) => v.includes(h));
}

function jwtIsSensitive(token) {
  // Publishable "anon" JWTs are designed to ship in front-end code; anything else is treated as sensitive.
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return json && json.role !== 'anon';
  } catch {
    return true;
  }
}

function dbUrlIsSensitive(url) {
  if (/@(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal)\b/i.test(url)) return false;
  const pw = (/:\/\/[^:@\/]+:([^@]+)@/.exec(url) || [])[1] || '';
  return !looksLikePlaceholder(pw) && !/^(?:password|pass|postgres|root|secret)$/i.test(pw);
}

// Each pattern: name, re (no flags; flags are added by callers), optional check(match, groupValue).
// `group` = the capture group holding the secret value, when only part of the match is the secret.
export const SECRET_PATTERNS = [
  { name: 'private-key', re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/ },
  { name: 'stripe-live-key', re: /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}/ },
  { name: 'aws-access-key-id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'aws-secret-key', re: /aws_?secret_?access_?key["']?\s*[:=]\s*["']?([A-Za-z0-9/+]{40})/i, group: 1 },
  { name: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/ },
  { name: 'slack-token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}/ },
  { name: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'openai-style-key', re: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/ },
  { name: 'jwt-service-key', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, check: (m) => jwtIsSensitive(m) },
  { name: 'db-url-with-credentials', re: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/'"]+:[^\s@/'"]{3,}@[^\s/'"]+/i, check: (m) => dbUrlIsSensitive(m) },
  {
    name: 'generic-secret-assignment',
    re: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)["']?\s*[:=]\s*["']([^"'\s]{12,})["']/i,
    group: 1,
    check: (m, g) => !looksLikePlaceholder(g),
  },
];

export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Return the names of secret patterns found in one line of text (never the values). */
export function findSecrets(line) {
  const hits = [];
  for (const p of SECRET_PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags.replace('g', '') + 'g');
    let m;
    while ((m = re.exec(line)) !== null) {
      const g = p.group ? m[p.group] : m[0];
      if (!p.check || p.check(m[0], g)) { hits.push(p.name); break; }
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return hits;
}

/** Replace secret-looking values with [REDACTED:<name>]. Emails too, unless keepEmails. */
export function redact(text, { keepEmails = false } = {}) {
  let out = String(text);
  for (const p of SECRET_PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags.replace('g', '') + 'g');
    out = out.replace(re, (...args) => {
      const m = args[0];
      const g = p.group ? args[p.group] : m;
      if (p.check && !p.check(m, g)) return m;
      if (p.group && typeof g === 'string') return m.replace(g, `[REDACTED:${p.name}]`);
      return `[REDACTED:${p.name}]`;
    });
  }
  if (!keepEmails) out = out.replace(EMAIL_RE, '[REDACTED:email]');
  return out;
}
