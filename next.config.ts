import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Allow LAN access in dev (for mobile camera testing over local network)
  allowedDevOrigins: ["192.168.1.112", "*.local"],
};

export default nextConfig;
