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

export const metadata: Metadata = {
  title: "Team Tasks",
  description: "See what's done, what's left and who's doing it.",
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
