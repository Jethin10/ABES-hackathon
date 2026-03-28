import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(100),
  role: z.enum(['ADMIN', 'FOUNDER', 'BACKER', 'VALIDATOR']).default('BACKER')
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(100)
});

export const socialLoginSchema = z.object({
  provider: z.enum(['GOOGLE', 'APPLE', 'FACEBOOK']),
  providerUserId: z.string().trim().min(3).max(255).optional(),
  email: z.string().trim().email().max(200),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(['ADMIN', 'FOUNDER', 'BACKER', 'VALIDATOR']).default('BACKER')
});

export const googleAuthSchema = z.object({
  accessToken: z.string().trim().min(20).max(4096),
  role: z.enum(['ADMIN', 'FOUNDER', 'BACKER', 'VALIDATOR']).default('BACKER')
});

export const facebookAuthSchema = z.object({
  accessToken: z.string().trim().min(20).max(4096),
  role: z.enum(['ADMIN', 'FOUNDER', 'BACKER', 'VALIDATOR']).default('BACKER')
});

export const demoLoginSchema = z.object({
  mode: z.enum(['FOUNDER', 'INVESTOR'])
});

export const createCampaignSchema = z.object({
  title: z.string().trim().min(5).max(140),
  summary: z.string().trim().min(10).max(280),
  description: z.string().trim().min(50).max(8000),
  category: z.string().trim().min(2).max(80),
  goalAmount: z.number().positive(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  fundingDeadline: z.string().datetime(),
  financeProfile: z.object({
    fundingRail: z.enum(['INDIA_FIAT', 'GLOBAL_CRYPTO']).optional(),
    complianceRegion: z.enum(['INDIA', 'GLOBAL']).optional(),
    paymentProvider: z.string().trim().min(2).max(80).optional(),
    escrowModel: z.enum(['BANK_ESCROW', 'SMART_CONTRACT_ESCROW']).optional(),
    yieldStrategy: z.enum(['INDIA_TREASURY', 'DEFI_LENDING']).optional(),
    liquidityBufferRatio: z.number().min(0.1).max(0.9).optional(),
    yieldDeploymentRatio: z.number().min(0.1).max(0.9).optional(),
    tokenModel: z.enum(['INTERNAL_LEDGER_TOKENS', 'REAL_USDC']).optional(),
    bankPartner: z.string().trim().min(2).max(120).nullable().optional(),
    defiProtocols: z.array(z.string().trim().min(2).max(80)).max(5).optional()
  }).optional(),
  milestones: z.array(
    z.object({
      title: z.string().trim().min(3).max(120),
      description: z.string().trim().min(10).max(1000),
      percentage: z.number().positive().max(100)
    })
  ).min(1).max(3)
});

export const submitProofSchema = z.object({
  proofManifestCid: z.string().trim().min(3).max(255),
  proofNotes: z.string().trim().min(10).max(3000)
});

export const contributeSchema = z.object({
  amount: z.number().positive(),
  assetType: z.enum(['FIAT', 'USDC', 'USDT']).default('FIAT'),
  paymentSource: z.enum(['CARD', 'BANK_TRANSFER', 'WALLET']).default('CARD')
});

export const voteSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT'])
});

export const arbitrationVoteSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  rationale: z.string().trim().min(10).max(2000)
});

export const reviewUserSchema = z.object({
  kycStatus: z.enum(['APPROVED', 'REJECTED']),
  walletAddress: z.string().trim().min(6).max(128).optional(),
  payoutAddress: z.string().trim().min(6).max(128).optional(),
  notes: z.string().trim().min(5).max(1000).optional()
});
