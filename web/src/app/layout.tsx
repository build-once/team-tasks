import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";

import { Footer } from "@/app/components/Footer";

// The two typefaces in docs/design/team-tasks-screens.pdf. Both come from
// next/font/google, which is built into Next.js, so no package was added and
// nothing is fetched from Google at runtime.
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const sans = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
});

// The third place the app's one-line promise appears -- the others are the front
// page and the sign-in page. It said "and who's doing it" until issue #196, which
// nothing in the app did: no screen shows who created a task, and no column records
// who ticked one. All three were changed together on purpose, because a description
// in <head> is what a search result and a shared link show, and leaving this one
// behind would have kept the claim alive in the place most people meet it first.
export const metadata: Metadata = {
  title: "Team Tasks",
  description: "See what's done, what's left, and which list it's on.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        {children}

        {/* HERE RATHER THAN ON EACH PAGE, so there is no screen without a
            version and no screen that has to remember to add one. It was on the
            front page only before, and it said "Team Tasks version 2".

            Outside {children} on purpose: a loading.tsx fallback and an error.tsx
            boundary both replace the page, and the footer should survive both --
            a screen that has just broken is exactly when somebody wants to know
            which build broke. */}
        <Footer />
      </body>
    </html>
  );
}
