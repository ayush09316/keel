import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_KEEL_API:
      process.env.NEXT_PUBLIC_KEEL_API ?? "http://localhost:8000/api",
  },
};

export default config;
