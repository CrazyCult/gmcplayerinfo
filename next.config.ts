import type { NextConfig } from "next";

const config: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "oqax3ftrhi4czkta.public.blob.vercel-storage.com",
        pathname: "/gamechase/**",
      },
    ],
    minimumCacheTTL: 2592000,
  },
  logging: { fetches: { fullUrl: true } },
};
export default config;
