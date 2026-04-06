import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: './',
  },
    typescript: {
    ignoreBuildErrors: true,   // ← add this
  },
};

export default nextConfig;
