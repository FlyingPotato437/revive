import type { Metadata } from "next";
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
  title: "Revive | Credential recovery for durable workflows",
  description:
    "Revive correlates credential failures to durable runs, reauthorizes the correct account, and resumes failed actions with idempotency protection.",
};

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
      className={`${inter.variable} ${jetbrains.variable} ${spaceGrotesk.variable}`}
    >
      <body className="min-h-screen antialiased">{content}</body>
    </html>
  );
}
