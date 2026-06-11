import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; connect-src 'self' *; frame-src 'self' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
