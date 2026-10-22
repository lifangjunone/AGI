/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  turbopack: { root: process.cwd() },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8082"}/api/:path*` }];
  }
};
export default nextConfig;
