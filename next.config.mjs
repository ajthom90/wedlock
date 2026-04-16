/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async redirects() {
    return [
      { source: '/events', destination: '/details', permanent: true },
      { source: '/admin/events', destination: '/admin/details', permanent: true },
    ];
  },
};

export default nextConfig;
