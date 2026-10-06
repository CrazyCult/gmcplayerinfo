import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/players", "/squad"].map((path) => ({
    url: `${process.env.NEXT_SITE_URL || "http://localhost:3000"}${path}`,
  }));
}
