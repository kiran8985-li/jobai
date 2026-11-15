import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // CV uploads are up to 5 MB; the default limit for form posts is 1 MB.
    serverActions: { bodySizeLimit: "6mb" },
  },
  // These read files and load workers at run time, so they must not be bundled.
  serverExternalPackages: ["unpdf", "mammoth"],
  // The PDF fonts are read from disk at run time, so they must ship with the server code.
  outputFileTracingIncludes: { "/**": ["./assets/fonts/*.ttf"] },
};

export default nextConfig;
