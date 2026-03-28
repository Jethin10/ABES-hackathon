export type UserRole = 'ADMIN' | 'FOUNDER' | 'BACKER' | 'VALIDATOR';
export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type MilestoneStatus = 'PENDING' | 'IN_REVIEW' | 'ESCALATED' | 'APPROVED' | 'REJECTED' | 'PAID';
export type VoteDecision = 'APPROVE' | 'REJECT';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface UserVerification {
  userId: string;
  kycStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  walletAddress: string | null;
  payoutAddress: string | null;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignSummary {
  id: string;
  founderId: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  goalAmount: number;
  currency: string;
  status: CampaignStatus;
  fundingMode: string;
  fundingDeadline: string;
  totalRaised: number;
  backerCount: number;
  escrowReference: string;
  createdAt: string;
  updatedAt: string;
  progressPercentage: number;
}

export interface VoteStats {
  totalVotes: number;
  eligibleBackers: number;
  approveWeight: number;
  rejectWeight: number;
  approvalRatio: number;
  turnout: number;
  quorumReached: boolean;
}

export interface CampaignMilestone {
  id: string;
  campaignId: string;
  position: number;
  title: string;
  description: string;
  percentage: number;
  amount: number;
  status: MilestoneStatus;
  proofManifestCid: string | null;
  proofNotes: string | null;
  voteOpensAt: string | null;
  voteClosesAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  payoutCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentlyUnlockableAmount: number;
  voteStats: VoteStats;
}

export interface Contribution {
  id: string;
  backerId: string;
  amount: number;
  assetType: 'FIAT' | 'USDC' | 'USDT';
  paymentSource: 'CARD' | 'BANK_TRANSFER' | 'WALLET';
  status: 'CONFIRMED';
  createdAt: string;
}

export interface CampaignDetail extends CampaignSummary {
  description: string;
  founderVerification: UserVerification | null;
  milestones: CampaignMilestone[];
  contributions: Contribution[];
  escrowEvents: Array<Record<string, unknown>>;
  auditTrail: Array<Record<string, unknown>>;
}

export interface AuthMeResponse {
  user: AuthUser;
  verification: UserVerification;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
}

interface ApiEnvelope<T> {
  data: T;
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  code?: string;
  status: number;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const DEFAULT_API_BASE_URL = 'http://localhost:4000/api';
export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || DEFAULT_API_BASE_URL;

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = (isJson ? await response.json() : null) as ApiEnvelope<T> | ApiErrorEnvelope | null;

  if (!response.ok) {
    const error = (payload as ApiErrorEnvelope | null)?.error;
    throw new ApiError(
      error?.message || `Request failed with status ${response.status}.`,
      response.status,
      error?.code,
      error?.details
    );
  }

  return (payload as ApiEnvelope<T>).data;
}

export const api = {
  login(email: string, password: string) {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },

  me(token: string) {
    return request<AuthMeResponse>('/auth/me', undefined, token);
  },

  listCampaigns() {
    return request<{ campaigns: CampaignSummary[] }>('/campaigns');
  },

  getCampaign(campaignId: string) {
    return request<{ campaign: CampaignDetail }>(`/campaigns/${campaignId}`);
  },

  createCampaign(
    payload: {
      title: string;
      summary: string;
      description: string;
      category: string;
      goalAmount: number;
      currency: string;
      fundingDeadline: string;
      milestones: Array<{
        title: string;
        description: string;
        percentage: number;
      }>;
    },
    token: string
  ) {
    return request<{ campaign: CampaignDetail }>(
      '/campaigns',
      {
        method: 'POST',
        body: JSON.stringify(payload)
      },
      token
    );
  },

  publishCampaign(campaignId: string, token: string) {
    return request<{ campaign: CampaignDetail }>(
      `/campaigns/${campaignId}/publish`,
      { method: 'POST' },
      token
    );
  },

  contribute(
    campaignId: string,
    payload: {
      amount: number;
      assetType: 'FIAT' | 'USDC' | 'USDT';
      paymentSource: 'CARD' | 'BANK_TRANSFER' | 'WALLET';
    },
    token: string
  ) {
    return request<{ contributionId: string; campaign: CampaignDetail }>(
      `/campaigns/${campaignId}/contributions`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      },
      token
    );
  }
};
