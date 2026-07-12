/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // This repository lives below another lockfile on the developer machine.
  // Pin tracing to Revive so Next never guesses a parent workspace root.
  outputFileTracingRoot: process.cwd(),
  // Keep `next build` from invalidating chunks used by a running dev server.
  // This prevents intermittent MODULE_NOT_FOUND / internal-server errors while
  // validating production builds during local development.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  async rewrites() {
    // Public control-plane surface: /v1/* (SDK contract) → app/api/v1/*.
    return [
      { source: "/v1/:path*", destination: "/api/v1/:path*" },
    ];
  },
  async headers() {
    // Report-only first: this logs violations without breaking Clerk, Stripe,
    // Nango, or framer-motion inline styles. Tighten to an enforcing CSP once
    // the violation reports are clean.
    const cspReportOnly = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://clerk.revivelabs.app https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.clerk.accounts.dev https://clerk.revivelabs.app https://api.stripe.com https://api.nango.dev https://*.nango.dev https://api.clerk.com",
      "frame-src 'self' https://js.stripe.com https://*.clerk.accounts.dev https://connect.nango.dev",
      "worker-src 'self' blob:",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
      ],
    }];
  },
};

export default nextConfig;
