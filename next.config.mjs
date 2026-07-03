/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Keep `next build` from invalidating chunks used by a running dev server.
  // This prevents intermittent MODULE_NOT_FOUND / internal-server errors while
  // validating production builds during local development.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  async rewrites() {
    // Public control-plane surface: /v1/* (SDK contract) → app/api/v1/*.
    return [
      { source: "/v1/:path*", destination: "/api/v1/:path*" },
      // Gateway surface: agents point their tool base URL at /proxy/*.
      { source: "/proxy/:path*", destination: "/api/proxy/:path*" },
    ];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      ],
    }];
  },
};

export default nextConfig;
