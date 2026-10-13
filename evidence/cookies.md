# Evidence: cookies and browser storage on the sign-in screens

Result: **PASS — and the answer is smaller than anybody expected.** On production's signed-out
`/login`, **this app stores nothing at all on a visitor's device**: no cookie, no session storage, no
local storage. **Cloudflare's widget stores one local-storage item**, on its own origin, under the key
`cf.turnstile.u`. **Question 15 is answered: no banner, with disclosure.**
Date: 2026-10-13
How checked: **the owner**, in Chrome, in a normal window (not incognito), with storage cleared first,
against **production** `/login` at version `45d187b`, signed out, waiting until the widget reached
"Success!". Then DevTools → Application → Storage → Cookies / Session Storage / Local Storage, every
origin node expanded.
Checked by: **the owner**. Written up by Claude Code from the owner's report, 2026-10-13. **Nobody
writing this opened a browser, a dashboard or a connector**, and nothing was run against staging or
production from this session.

---

## 1. What was found

| Store | `https://team-tasks-virid.vercel.app` | `https://challenges.cloudflare.com` |
|---|---|---|
| **Cookies** | **none** | **none** |
| **Session storage** | **empty** | **empty** |
| **Local storage** | **empty** | **ONE item**, key **`cf.turnstile.u`** — value not recorded |

**No value was recorded, deliberately** (rules 7 and 18). A cookie's or a storage item's value can be a
credential; the name, the store and the origin are what a cookie list needs, and they are all that is
written down.

## 2. The three things this settles

1. **This app sets no cookie on a signed-out visitor.** Not one. `docs/data-inventory.md` §5.1 lists
   three things the app and its libraries *can* set, and the reading shows why none of them was there:
   the Supabase session cookie and the PKCE verifier are written when a sign-in or a link exchange
   happens, and `reset-link-used` only on the password-reset path. **A signed-out `/login` triggers
   none of the three.**
2. **Nothing of ours is in browser storage either.** A search of `web/src` for `localStorage` and
   `sessionStorage` finds no match, and the reading agrees with the code: both stores were empty for
   this app's origin.
3. **Cloudflare's widget stores exactly one thing, and it is on CLOUDFLARE'S origin, not ours.**
   `challenges.cloudflare.com` is a third-party frame; `cf.turnstile.u` sits in that frame's own local
   storage. Our page cannot read it, and neither can any script of ours — a different origin's local
   storage is unreachable from this app by the browser's own rule.

**And one thing it does not settle, which is the honest part: there were no cookies on a widget that
settled itself.** The owner's run reached "Success!" without being asked to tick anything. Cloudflare's
own cookie page describes `cf_clearance` as "Challenge completion proof" and says it "is required for
JavaScript detections" — so **a challenge that asks for an interaction may yet set one.** That case has
not been seen. Section 5 is the list.

## 3. What `cf.turnstile.u` is, and how long it lasts — **NOT CONFIRMED**

**Three Cloudflare pages were read on 2026-10-13 and NOT ONE of them mentions it**, by that name or by
any description of browser storage:

| Page read | What it says about browser storage |
|---|---|
| [Turnstile](https://developers.cloudflare.com/turnstile/) (the overview and FAQ content) | **nothing.** Its only sentence on data handling is "Turnstile does not access, store, or transmit user communications, form entries, or other page inputs" — which is about page *inputs*, not about what the widget writes |
| [Client-side rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/) | **nothing.** No mention of localStorage, sessionStorage or cookies |
| [Cloudflare cookies](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/) | **nothing about storage other than cookies**, and it does not mention Turnstile by name at all |

And the [Turnstile Privacy
Addendum](https://www.cloudflare.com/turnstile-privacy-policy/), read 2026-10-11 and again on
2026-10-12, points away rather than answering: "For more information about the cookies used by
Cloudflare, please check our Cookie Policy and our Turnstile Developer Docs" — and the two pages it
points at are the two above.

**So what is written here is what was observed and nothing more**: one item, in local storage, on
Cloudflare's own origin, present after the widget ran. **Its purpose and its lifetime are not
confirmed, and no guess at either is recorded.** Local storage has **no expiry of its own** — unlike a
cookie, nothing in the browser removes it on a clock — which is a property of the store rather than a
statement about this item, and is the one thing that can be said without reading a page.

**What would settle it:** a Cloudflare page that documents the key, or Cloudflare support. **It is not
settled by looking at the value**, which is why the value was not recorded.

## 4. Why "no banner, with disclosure" — the owner's decision of 2026-10-13

**The decision is the owner's and the reasoning is recorded so it is not re-argued.** What the reading
establishes:

- **nothing is stored for analytics, marketing or profiling.** `docs/plan.md`'s "Analytics: stays at
  none" is a decision, there is no analytics package in `web/package.json`, and the only outside
  script the app loads is Cloudflare's, on three screens;
- **everything this app would ever store is strictly necessary** — a session, a PKCE verifier, and a
  15-minute marker that decides what one screen draws — and **on a signed-out visitor it stores none of
  them**;
- **the one third-party item is on a third party's origin, set by a bot check**, which Cloudflare
  categorises with its strictly-necessary set and about which it says "Cloudflare does not track users
  from site to site or from session to session".

**"With disclosure" is the part that is not optional.** The privacy page must **name `cf.turnstile.u`**,
say it is Cloudflare's and not ours, say what it is for as far as anybody knows, and **say that
Cloudflare does not document it** — because a cookie answer that leaves out the one thing actually
found on the device would be the kind of true-sounding omission this whole build exists to avoid.

**And it is a legal judgement, not a reading of the code.** The owner took it; `docs/plan.md`'s answer
5 records that the owner's own reading of the documents **is not a legal review**.

## 5. Not checked, and each of these is one more look

1. **`/signup` and `/forgot-password`** — the other two screens with the widget.
2. **Any signed-in page.** The Supabase session cookie is *expected* there, and the point of looking is
   to write down its name shape, domain, `HttpOnly`, `Secure`, `SameSite` and expiry. **Its value must
   never be recorded**: it is a working sign-in.
3. **A challenge that asks for an interaction.** The run that happened settled itself, so
   `cf_clearance` has not been looked for in the case Cloudflare says it is for.
4. **Any browser other than Chrome**, and **any phone** — which is the device `docs/plan.md` says this
   app is for.
5. **Whether Vercel sets anything** on the addresses the app is served at. None was found here, which
   is evidence for production's own domain and not for a Preview deploy, where Vercel's toolbar is a
   different matter.

## 6. Output (secrets removed)

```
Reported by the owner, 13 October 2026. Chrome, normal window, storage cleared first.
Production /login, version 45d187b, signed out, widget reached "Success!".

DevTools -> Application -> Storage:

  Cookies
    https://team-tasks-virid.vercel.app      (none)
    https://challenges.cloudflare.com        (none)

  Session storage
    https://team-tasks-virid.vercel.app      (empty)
    https://challenges.cloudflare.com        (empty)

  Local storage
    https://team-tasks-virid.vercel.app      (empty)
    https://challenges.cloudflare.com        1 item
                                             key:   cf.turnstile.u
                                             value: [NOT RECORDED]
```

**No screenshot.** The owner's report is the record, and it is labelled as a report throughout.
