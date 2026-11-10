import path from "node:path";
import type { NextConfig } from "next";

const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.app.github.dev"],
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  reactStrictMode: true,
  images: { unoptimized: true }, // Private signed photos must not be cached by the public optimizer.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
