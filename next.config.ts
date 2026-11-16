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
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The app is never shown inside another site's frame (stops click-jacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
