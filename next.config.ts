import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Autorise l'accès dev depuis les appareils du réseau local (écoute partagée)
  allowedDevOrigins: ["192.168.1.25"],
};

export default nextConfig;
