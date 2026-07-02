/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Keep `next build` from invalidating chunks used by a running dev server.
  // This prevents intermittent MODULE_NOT_FOUND / internal-server errors while
  // validating production builds during local development.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  async rewrites() {
    // Public control-plane surface: /v1/* (SDK contract) → app/api/v1/*.
    return [{ source: "/v1/:path*", destination: "/api/v1/:path*" }];
  },
};

export default nextConfig;
