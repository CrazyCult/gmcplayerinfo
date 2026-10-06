import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/player/local:"],
    },
    sitemap: `${process.env.NEXT_SITE_URL || "http://localhost:3000"}/sitemap.xml`,
  };
}
