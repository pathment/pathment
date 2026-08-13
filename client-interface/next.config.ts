import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: './',
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
};

export default nextConfig;
