import Script from "next/script";
import type { Metadata } from "next";
import Header from "@/components/Header";
import { AuthProvider } from "@/hooks/useAuth";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "ShiftSitter - Smart, verified childcare for shift-working families",
  description:
    "B2B-first childcare platform for shift-working teams. Reciprocal, trust-based matching between families, built for real-world schedules.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
        />
      </head>

      <body>
        <AuthProvider>
          <Script
            src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
            strategy="beforeInteractive"
          />
          <Header />
          <main className="ss-main">{children}</main>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
