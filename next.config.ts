import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone/server.js — a self-contained server this app
  // can spawn as a subprocess, the same way scoring-build is run.
  output: "standalone",
};

export default nextConfig;
