/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  turbopack: { root: process.cwd() },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8083"}/api/:path*` },
      { source: "/v1/:path*", destination: `${process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8083"}/v1/:path*` }
    ];
  }
};
export default nextConfig;
