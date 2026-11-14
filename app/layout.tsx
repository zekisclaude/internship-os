import "./globals.css";
import type { Metadata } from "next";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Internship OS", robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  return (
    <html lang="en">
      <body>
        {u && (
          <div className="top">
            <b>Internship OS</b>
            <nav>
              <a href="/">Review queue</a>
              <a href="/opportunities">Opportunities</a>
              <a href="/companies">Companies</a>
              <a href="/activity">Activity</a>
              <a href="/settings">Settings</a>
            </nav>
            <span className="sp" />
            <span className="mut small">{u.email}</span>
            <form action="/api/auth/logout" method="post"><button className="btn">Sign out</button></form>
          </div>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
