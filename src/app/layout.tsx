import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PeopleCore AU — Super Admin",
  description: "PeopleCore AU platform super administration console",
};

/**
 * Resolve the saved theme before the first paint so a dark-mode user never
 * sees a light flash. The public marketing site opts out of the dark rules,
 * so this only affects the app.
 */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('pc-theme');var d=s==='dark'||((!s||s==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
