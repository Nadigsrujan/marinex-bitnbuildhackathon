import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile mapbox-gl and cesium for Next.js compatibility
  transpilePackages: ["mapbox-gl", "cesium"],
  // Turbopack config required for Next.js 16+
  turbopack: {},
};

export default nextConfig;
