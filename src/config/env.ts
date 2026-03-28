import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  DATABASE_ENGINE: z.enum(['sqlite', 'postgres']).default('sqlite'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().min(1).default('0.0.0.0'),
  JWT_SECRET: z.string().min(12).default('change-me-now'),
  DATABASE_PATH: z.string().min(1).default('./data/stellaris.db'),
  DATABASE_URL: z.string().optional(),
  CORS_ORIGIN: z.string().min(1).default('*'),
  INDIA_LIQUIDITY_BUFFER_RATIO: z.coerce.number().min(0.1).max(0.9).default(0.3),
  INDIA_YIELD_DEPLOYMENT_RATIO: z.coerce.number().min(0.1).max(0.9).default(0.7),
  GLOBAL_LIQUIDITY_BUFFER_RATIO: z.coerce.number().min(0.1).max(0.9).default(0.3),
  GLOBAL_YIELD_DEPLOYMENT_RATIO: z.coerce.number().min(0.1).max(0.9).default(0.7),
  VOTING_WINDOW_HOURS: z.coerce.number().int().min(1).max(168).default(72),
  MILESTONE_APPROVAL_THRESHOLD: z.coerce.number().min(0.5).max(1).default(0.6),
  MILESTONE_QUORUM_THRESHOLD: z.coerce.number().min(0.1).max(1).default(0.3),
  LIQUIDITY_BUFFER_RATIO: z.coerce.number().min(0.1).max(1).default(0.3),
  PROTOCOL_RESERVE_RATIO: z.coerce.number().min(0.01).max(0.5).default(0.1),
  INDIA_ESCROW_BANK_NAME: z.string().default('Escrow Banking Partner'),
  INDIA_ESCROW_BANK_ACCOUNT: z.string().default(''),
  INDIA_ESCROW_BANK_IFSC: z.string().default(''),
  INDIA_FIAT_PROVIDER: z.string().default('Razorpay'),
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  PHONEPE_MERCHANT_ID: z.string().default(''),
  PHONEPE_SALT_KEY: z.string().default(''),
  PHONEPE_SALT_INDEX: z.string().default(''),
  AAVE_POOL_ADDRESS: z.string().default(''),
  MORPHO_MARKET_ID: z.string().default(''),
  USDC_TOKEN_ADDRESS: z.string().default(''),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  APPLE_CLIENT_ID: z.string().default(''),
  APPLE_TEAM_ID: z.string().default(''),
  APPLE_KEY_ID: z.string().default(''),
  APPLE_PRIVATE_KEY: z.string().default(''),
  FACEBOOK_APP_ID: z.string().default(''),
  FACEBOOK_APP_SECRET: z.string().default(''),
  ESCROW_MODE: z.enum(['MOCK', 'SIMULATED_EVM', 'EVM']).default('MOCK'),
  ESCROW_RPC_URL: z.string().optional(),
  ESCROW_CONTRACT_ADDRESS: z.string().optional(),
  ESCROW_ADMIN_PRIVATE_KEY: z.string().optional(),
  ESCROW_SYNC_START_BLOCK: z.coerce.number().int().min(0).default(0),
  ESCROW_CHAIN_ID: z.coerce.number().int().positive().default(11155111),
  ARBITRATION_MIN_VOTES: z.coerce.number().int().min(1).max(10).default(3)
});

export const env = envSchema.parse(process.env);
