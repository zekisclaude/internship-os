import "./globals.css";
import type { Metadata } from "next";
import { currentUser, siteIsOpen } from "@/lib/session";
import Nav from "@/components/Nav";

export const metadata: Metadata = { title: "Internship OS", robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  return (
    <html lang="en">
      <body>
        {u && (
          <div className="top">
            <b>Internship OS</b>
            <Nav />
            <span className="sp" />
            {!siteIsOpen() && <form action="/api/auth/logout" method="post"><button className="btn">Lock</button></form>}
          </div>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
