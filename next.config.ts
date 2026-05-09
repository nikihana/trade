import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Old admin/config route — preserved as a redirect for any bookmarks.
      { source: "/config", destination: "/admin", permanent: true },
      { source: "/config/:path*", destination: "/admin", permanent: true },
    ];
  },
};

export default nextConfig;
