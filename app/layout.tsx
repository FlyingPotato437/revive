import type { Metadata } from "next";
import Script from "next/script";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Revive | Recover dead AI agent runs",
  description:
    "Detect agent runs lost to human-dependent blockers, get the right person to resolve them, and safely resume the exact suspended run.",
};

const dashboardThemeScript = `
  try {
    if (location.pathname === "/app" || location.pathname.startsWith("/app/")) {
      var preference = localStorage.getItem("revive-theme") || "system";
      var resolved = preference === "system"
        ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : preference;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.themePreference = preference;
      document.documentElement.style.colorScheme = resolved;
    }
  } catch (error) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerkEnabled = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
  const content = clerkEnabled ? (
    <ClerkProvider
      signInUrl="/sso"
      signUpUrl="/sign-up"
      signInForceRedirectUrl="/api/auth/clerk/bridge"
      signUpForceRedirectUrl="/api/auth/clerk/bridge"
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  ) : children;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${jetbrains.variable} ${spaceGrotesk.variable}`}
    >
      <head suppressHydrationWarning>
        <Script id="revive-dashboard-theme" strategy="beforeInteractive">
          {dashboardThemeScript}
        </Script>
      </head>
      <body className="min-h-screen antialiased">{content}</body>
    </html>
  );
}
