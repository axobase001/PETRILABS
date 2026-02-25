/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  images: {
    domains: ['arweave.net'],
  },
  env: {
    NEXT_PUBLIC_ORCHESTRATOR_URL: process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000',
    NEXT_PUBLIC_GENOME_REGISTRY_ADDRESS: process.env.NEXT_PUBLIC_GENOME_REGISTRY_ADDRESS,
    NEXT_PUBLIC_PETRI_FACTORY_V2_ADDRESS: process.env.NEXT_PUBLIC_PETRI_FACTORY_V2_ADDRESS,
    NEXT_PUBLIC_USDC_ADDRESS: process.env.NEXT_PUBLIC_USDC_ADDRESS,
  },
};

module.exports = nextConfig;
