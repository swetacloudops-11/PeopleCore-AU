import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PeopleCore AU — Super Admin",
  description: "PeopleCore AU platform super administration console",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
