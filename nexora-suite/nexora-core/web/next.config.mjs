/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  turbopack: { root: process.cwd() },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8080"}/api/:path*` },
      { source: "/.well-known/:path*", destination: `${process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8080"}/.well-known/:path*` }
    ];
  }
};
export default nextConfig;
