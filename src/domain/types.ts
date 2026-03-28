export type UserRole = 'ADMIN' | 'FOUNDER' | 'BACKER' | 'VALIDATOR';
export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type FundingMode = 'KEEP_IT_ALL';
export type FundingRail = 'INDIA_FIAT' | 'GLOBAL_CRYPTO';
export type YieldStrategy = 'INDIA_TREASURY' | 'DEFI_LENDING';
export type MilestoneStatus = 'PENDING' | 'IN_REVIEW' | 'ESCALATED' | 'APPROVED' | 'REJECTED' | 'PAID';
export type ContributionStatus = 'CONFIRMED';
export type VoteDecision = 'APPROVE' | 'REJECT';
export type PayoutStatus = 'SETTLED' | 'FAILED';
export type KycStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
}

export interface MilestoneInput {
  title: string;
  description: string;
  percentage: number;
}

export interface CampaignFinanceProfile {
  campaignId: string;
  fundingRail: FundingRail;
  complianceRegion: 'INDIA' | 'GLOBAL';
  paymentProvider: string;
  escrowModel: 'BANK_ESCROW' | 'SMART_CONTRACT_ESCROW';
  yieldStrategy: YieldStrategy;
  liquidityBufferRatio: number;
  yieldDeploymentRatio: number;
  tokenModel: 'INTERNAL_LEDGER_TOKENS' | 'REAL_USDC';
  bankPartner: string | null;
  defiProtocols: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TreasuryPoolSnapshot {
  rail: FundingRail;
  bufferBalance: number;
  yieldBalance: number;
  reserveBalance: number;
  totalContributions: number;
  totalPayouts: number;
  lastRebalanceAt: string | null;
  updatedAt: string;
}

export interface TreasurySnapshot {
  pools: TreasuryPoolSnapshot[];
  totals: {
    bufferBalance: number;
    yieldBalance: number;
    reserveBalance: number;
    totalContributions: number;
    totalPayouts: number;
  };
  updatedAt: string;
}

export interface UserVerification {
  userId: string;
  kycStatus: KycStatus;
  walletAddress: string | null;
  payoutAddress: string | null;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
