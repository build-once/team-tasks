"use client";

// CaptchaGate.tsx -- the anti-robot check, and the submit button that waits for
// it. One component on all three sign-in screens.
//
// Build it 25 part 1, issue #284. Decision A (Turnstile), K (managed mode).
//
// ---------------------------------------------------------------------------
// WHY IT OWNS THE BUTTON AS WELL AS THE WIDGET
// ---------------------------------------------------------------------------
//
// Issue #284: "If the widget cannot load, the screen says so and offers a
// retry; it never submits without a token." The second half of that is a
// property of the BUTTON, so the button has to be inside the thing that knows
// whether there is a token. A widget that drew itself beside a button it could
// not reach would be a widget that watched the form post without one.
//
// So this is the second client component in the app, after
// web/src/app/tasks/AttachFile.tsx, and it is the same kind of exception: a
// thing that genuinely cannot happen on the server. Everything else on these
// three screens is still a server-rendered form posting to a server action.
//
// WITH NO SITE KEY IT IS NOTHING AT ALL. `turnstileView` answers "off", no
// script is fetched, no widget is drawn, and what renders is the plain
// `ActButton` the screens had before Build it 25. That is what keeps local work
// and a production deploy before the owner's widget exists both working --
// web/src/lib/env.ts is the thing that refuses a Vercel Production or Preview
// build with no key, so "off" cannot happen anywhere it would be a mistake.
//
// ---------------------------------------------------------------------------
// WHAT IT COSTS, SAID WHERE IT MATTERS
// ---------------------------------------------------------------------------
//
// Signing in starts needing JavaScript, and nothing else on these screens does.
// docs/plan.md calls that a real loss and does not pretend otherwise. There is
// a <noscript> line below saying so, in the place the box would have been --
// the same decision AttachFile.tsx took for the upload box, and the same one
// docs/plan.md took about what is inside a photograph: the person is told, in
// the place it matters, rather than left pressing something that cannot work.
//
// ---------------------------------------------------------------------------
// HOW THE TOKEN REACHES THE SERVER
// ---------------------------------------------------------------------------
//
// It is not passed by this component at all. Cloudflare's widget creates its
// own hidden field inside the surrounding form -- "an invisible input field is
// automatically created with the name cf-turnstile-response"
// (https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/,
// read 2026-10-11) -- so the token arrives in the FormData the server action
// already receives, and `readCaptchaToken` in web/src/lib/turnstile.ts is what
// reads it. This component's `callback` is used for ONE thing: knowing whether
// to enable the button.
//
// WHICH MEANS NO TOKEN IS EVER HELD IN THIS COMPONENT'S STATE. `solved` is a
// boolean. A credential that is not in a variable cannot be logged, reported or
// put in a URL by accident, and docs/plan.md's rule about what may reach an
// error report is a rule about this app's own code.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { ActButton } from "@/app/components/ActButton";
import { Banner } from "@/app/components/Banner";
import type { ButtonId } from "@/lib/buttons";
import {
  TURNSTILE_SCRIPT_URL,
  TURNSTILE_WORDS,
  maySubmit,
  turnstileView,
} from "@/lib/turnstile";

// The slice of Cloudflare's own global this component uses, and nothing more.
// Written out rather than pulled from a package, because there is no package:
// rule 17 makes adding one the owner's decision, and nothing here needs one --
// the whole of the interface is a script tag and three function calls, all four
// of them read off the client-side rendering page cited above.
type TurnstileGlobal = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      theme: "auto" | "light" | "dark";
    },
  ) => string | undefined;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
  }
}

export function CaptchaGate({
  siteKey,
  act,
  children,
}: {
  /** From web/src/lib/env.ts, read once there and handed down. "" means off. */
  siteKey: string;
  act: ButtonId;
  /** The button's label. Prose, as every label in this app is. */
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);

  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);

  const view = turnstileView({ siteKey, failed, token: solved ? "ok" : "" });

  useEffect(() => {
    // Nothing to do with no key, and nothing to tidy up either.
    if (siteKey === "") return;

    let cancelled = false;

    function draw() {
      if (cancelled) return;
      const element = box.current;
      const turnstile = window.turnstile;
      if (!element || !turnstile) return;
      // Already drawn: React may run this effect again, and a second widget in
      // the same box would mean two hidden fields with the same name.
      if (widgetId.current !== undefined) return;

      widgetId.current = turnstile.render(element, {
        sitekey: siteKey,
        callback: () => {
          setFailed(false);
          setSolved(true);
        },
        // The widget could not run its challenge at all.
        "error-callback": () => {
          setSolved(false);
          setFailed(true);
        },
        // Cloudflare's own figure: "Tokens expire after 300 seconds (5
        // minutes). Each token can only be validated once." Five minutes is
        // less than somebody can plausibly take over a password field, so this
        // happens, and the honest answer is to say the check timed out and
        // offer it again -- never to let the form post with a spent token and
        // come back saying the password was wrong.
        "expired-callback": () => {
          setSolved(false);
          setFailed(true);
        },
        theme: "auto",
      });
    }

    // One script for the page, however many of these components are on it. A
    // second <script> with the same src would load Turnstile twice.
    const already = document.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_URL}"]`,
    );

    if (already && window.turnstile) {
      draw();
    } else if (already) {
      already.addEventListener("load", draw);
      already.addEventListener("error", () => setFailed(true));
    } else {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", draw);
      // THE FAILURE THIS SCREEN EXISTS TO REPORT. A blocked script, a
      // locked-down work laptop, a network that drops the request: all of them
      // arrive here, and all of them must end with words on the screen rather
      // than a button that does nothing.
      script.addEventListener("error", () => {
        if (!cancelled) setFailed(true);
      });
      document.head.append(script);
    }

    return () => {
      cancelled = true;
      const id = widgetId.current;
      if (id !== undefined) {
        // "will not call any callback and will remove all related DOM
        // elements" -- which is what makes a React re-mount safe.
        window.turnstile?.remove(id);
        widgetId.current = undefined;
      }
    };
  }, [siteKey]);

  const retry = useCallback(() => {
    setSolved(false);
    setFailed(false);
    const id = widgetId.current;
    if (id !== undefined) {
      window.turnstile?.reset(id);
      return;
    }
    // The script never loaded, so there is no widget to reset. Reloading is the
    // only thing left that can fix it, and saying so is better than a button
    // that silently does nothing.
    window.location.reload();
  }, []);

  if (view === "off") {
    return (
      <ActButton className="btn btn--primary btn--block" act={act}>
        {children}
      </ActButton>
    );
  }

  return (
    <div className="captcha">
      {/* The widget itself. Cloudflare draws into this box and puts its hidden
          `cf-turnstile-response` field inside it, which is how the token gets
          into the form this component sits in. */}
      <div ref={box} />

      <noscript>
        <Banner tone="bad" icon="alert">
          {TURNSTILE_WORDS.noScript}
        </Banner>
      </noscript>

      {view === "failed" ? (
        <>
          <Banner tone="bad" icon="alert">
            {TURNSTILE_WORDS.failed}
          </Banner>
          <button className="btn btn--quiet" type="button" onClick={retry}>
            {TURNSTILE_WORDS.retry}
          </button>
        </>
      ) : null}

      {view === "waiting" ? (
        <p className="hint">{TURNSTILE_WORDS.waiting}</p>
      ) : null}

      {/* DISABLED RATHER THAN ABSENT. A button that is not there reads as a
          broken screen; a button that is there and faded, with a sentence
          beside it, reads as a screen waiting for something. And it is the
          whole of "it never submits without a token": with no token the press
          does not happen, so nothing is sent to Supabase and nothing comes back
          saying the password was wrong. */}
      <ActButton
        className="btn btn--primary btn--block"
        act={act}
        disabled={!maySubmit(view)}
      >
        {children}
      </ActButton>
    </div>
  );
}
