import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile mapbox-gl for Next.js compatibility
  transpilePackages: ["mapbox-gl"],
};

export default nextConfig;
