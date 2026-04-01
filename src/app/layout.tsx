import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Header from "@/components/Header";
import AppFooter from "@/components/AppFooter";
import GuidedTour from "@/components/GuidedTour";
import { AuthProvider } from "@/hooks/useAuth";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import ClientErrorLogger from "@/components/ClientErrorLogger";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.shiftsitter.com"),
  title: {
    default: "ShiftSitter - Smart, verified childcare for shift-working families",
    template: "%s | ShiftSitter",
  },
  description:
    "B2B-first childcare platform for shift-working teams. Reciprocal, trust-based matching between families, built for real-world schedules.",
  applicationName: "ShiftSitter",
  keywords: [
    "shift-working families",
    "childcare",
    "reciprocal childcare",
    "parent matching",
    "trusted childcare",
    "care swaps",
    "family support",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "https://www.shiftsitter.com/",
    title: "ShiftSitter - Smart, verified childcare for shift-working families",
    description:
      "B2B-first childcare platform for shift-working teams. Reciprocal, trust-based matching between families, built for real-world schedules.",
    siteName: "ShiftSitter",
    images: [
      {
        url: "/og-shiftsitter-logo.png",
        width: 1200,
        height: 630,
        alt: "ShiftSitter logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ShiftSitter - Smart, verified childcare for shift-working families",
    description:
      "B2B-first childcare platform for shift-working teams. Reciprocal, trust-based matching between families, built for real-world schedules.",
    images: ["/og-shiftsitter-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/logo-shiftsitter.png",
    apple: "/logo-shiftsitter.png",
  },
  category: "Childcare",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2fc4b6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = headers().get("x-nonce") ?? undefined;

  return (
    <html lang="en">
      <head nonce={nonce}>
        <link
          id="bootstrap-css-scoped"
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
        />
      </head>

      <body>
        <AuthProvider>
          <ClientErrorLogger />
          <Header />
          <main className="ss-main">{children}</main>
          <AppFooter />
          <Toaster />
          <GuidedTour />
        </AuthProvider>
      </body>
    </html>
  );
}

