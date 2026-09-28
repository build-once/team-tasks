import type { ReactNode } from "react";

type Tone = "ok" | "bad";
type IconName = "check" | "mail" | "alert";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: "false",
  } as const;

  if (name === "check") {
    return (
      <svg {...common}>
        <path d="M4.5 12.6l4.6 4.6L19.5 6.8" />
      </svg>
    );
  }

  if (name === "mail") {
    return (
      <svg {...common}>
        <rect x="2.8" y="5" width="18.4" height="14" rx="2.5" />
        <path d="M3.4 6.6L12 13l8.6-6.4" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M12 7.4v5.4" />
      <path d="M12 16.3v.1" />
    </svg>
  );
}

// A message the person actually needs to read: an error, or a confirmation
// that something worked. Errors announce themselves; confirmations are polite.
export function Banner({
  tone,
  icon,
  children,
}: {
  tone: Tone;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <p
      className={`banner banner--${tone}`}
      role={tone === "bad" ? "alert" : "status"}
    >
      <Icon name={icon} />
      <span>{children}</span>
    </p>
  );
}
