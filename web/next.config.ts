import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep Next rooted in web/ when the monorepo has multiple lockfiles.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
