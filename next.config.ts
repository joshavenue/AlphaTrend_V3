import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 blocks cross-origin dev resources by default. The Hetzner dev
  // server is opened from the tailnet IP, so keep that host explicitly allowed.
  allowedDevOrigins: ["100.79.23.21"],
};

export default nextConfig;
