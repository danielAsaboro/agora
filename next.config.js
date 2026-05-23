/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  experimental: { typedRoutes: false },
  webpack: (config) => {
    config.externals = [...(config.externals ?? []), "pino-pretty"];
    return config;
  },
};
