import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen in this console renders live database state, so we opt out of
  // component-level caching and render at request time instead.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
