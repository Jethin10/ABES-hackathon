import { randomUUID } from 'node:crypto';

import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, isAddress } from 'viem';

import type { DatabaseClient } from '../db/database.js';
import { nowIso } from '../core/utils.js';
import { stellarisEscrowAbi } from '../contracts/stellarisEscrowAbi.js';

type EscrowMode = 'MOCK' | 'SIMULATED_EVM' | 'EVM';

const createChain = (chainId: number, rpcUrl: string) => ({
  id: chainId,
  name: `stellaris-${chainId}`,
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [rpcUrl]
    }
  }
});

const toUnits = (amount: number) => BigInt(Math.round(amount * 100));

export class EscrowService {
  private readonly publicClient;
  private readonly walletClient;
  private readonly contractAddress;

  constructor(
    private readonly db: DatabaseClient,
    private readonly mode: EscrowMode,
    private readonly config?: {
      rpcUrl?: string;
      contractAddress?: string;
      adminPrivateKey?: string;
      chainId?: number;
    }
  ) {
    if (this.mode === 'EVM' && this.config?.rpcUrl && this.config.contractAddress && this.config.adminPrivateKey) {
      const chain = createChain(this.config.chainId ?? 11155111, this.config.rpcUrl);
      const account = privateKeyToAccount(this.config.adminPrivateKey as `0x${string}`);
      this.publicClient = createPublicClient({
        chain,
        transport: http(this.config.rpcUrl)
      });
      this.walletClient = createWalletClient({
        account,
        chain,
        transport: http(this.config.rpcUrl)
      });
      this.contractAddress = this.config.contractAddress as `0x${string}`;
    }
  }

  createCampaignEscrow(campaignId: string, founderId: string) {
    const reference = `${this.mode.toLowerCase()}:escrow:${campaignId}`;
    return {
      provider: this.mode,
      reference,
      founderId
    };
  }

  async activateCampaignEscrow(input: {
    campaignId: string;
    founderWallet?: string | null;
    goalAmount: number;
    currency: string;
    milestonePercentages: number[];
  }) {
    if (this.mode === 'EVM') {
      const txHash = await this.writeContract('createCampaign', [
        input.campaignId,
        isAddress(input.founderWallet ?? '') ? (input.founderWallet as `0x${string}`) : '0x0000000000000000000000000000000000000000',
        input.milestonePercentages.map((percentage) => Math.round(percentage * 100)),
        toUnits(input.goalAmount),
        input.currency
      ]);

      return {
        reference: txHash,
        provider: this.mode
      };
    }

    const reference = `${this.mode.toLowerCase()}:activate:${input.campaignId}:${Date.now()}`;
    await this.recordEvent(input.campaignId, null, 'CAMPAIGN_REGISTERED', reference, input);
    return {
      reference,
      provider: this.mode
    };
  }

  async recordEscrowCreated(campaignId: string, founderId: string, reference: string) {
    await this.recordEvent(campaignId, null, 'ESCROW_CREATED', reference, { founderId });
  }

  async recordContribution(campaignId: string, contributionId: string, amount: number, assetType: string) {
    if (this.mode === 'EVM') {
      const txHash = await this.writeContract('recordContribution', [
        campaignId,
        contributionId,
        toUnits(amount),
        assetType
      ]);

      return {
        reference: txHash
      };
    }

    const reference = `${this.mode.toLowerCase()}:contribution:${contributionId}`;
    await this.recordEvent(campaignId, null, 'CONTRIBUTION_LOCKED', reference, {
      contributionId,
      amount,
      assetType
    });

    return {
      reference
    };
  }

  async releaseMilestone(campaignId: string, milestoneId: string, amount: number, milestonePosition = 1) {
    if (this.mode === 'EVM') {
      const txHash = await this.writeContract('releaseMilestone', [
        campaignId,
        milestoneId,
        milestonePosition,
        toUnits(amount)
      ]);

      return {
        reference: txHash
      };
    }

    const reference = `${this.mode.toLowerCase()}:release:${milestoneId}:${Date.now()}`;
    await this.recordEvent(campaignId, milestoneId, 'MILESTONE_RELEASED', reference, { amount });

    return {
      reference
    };
  }

  async pauseCampaign(campaignId: string, reason: string) {
    if (this.mode === 'EVM') {
      const txHash = await this.writeContract('pauseCampaign', [campaignId, reason]);
      return { reference: txHash };
    }

    const reference = `${this.mode.toLowerCase()}:pause:${campaignId}:${Date.now()}`;
    await this.recordEvent(campaignId, null, 'CAMPAIGN_PAUSED', reference, { reason });
    return { reference };
  }

  async resumeCampaign(campaignId: string) {
    if (this.mode === 'EVM') {
      const txHash = await this.writeContract('resumeCampaign', [campaignId]);
      return { reference: txHash };
    }

    const reference = `${this.mode.toLowerCase()}:resume:${campaignId}:${Date.now()}`;
    await this.recordEvent(campaignId, null, 'CAMPAIGN_RESUMED', reference, {});
    return { reference };
  }

  async listEvents(campaignId: string): Promise<Array<{
    id: string;
    milestoneId: string | null;
    provider: string;
    action: string;
    reference: string;
    payload: string;
    createdAt: string;
  }>> {
    return this.db.all(`
      SELECT
        id,
        milestone_id as "milestoneId",
        provider,
        action,
        reference,
        payload,
        created_at as "createdAt"
      FROM escrow_events
      WHERE campaign_id = ?
      ORDER BY created_at DESC
    `, [campaignId]);
  }

  async upsertSyncedEvent(input: {
    campaignId: string;
    milestoneId?: string | null;
    action: string;
    reference: string;
    payload: unknown;
  }) {
    const existing = await this.db.get(`
      SELECT id
      FROM escrow_events
      WHERE reference = ?
    `, [input.reference]);

    if (existing) {
      return;
    }

    await this.recordEvent(input.campaignId, input.milestoneId ?? null, input.action, input.reference, input.payload);
  }

  private async writeContract(functionName: string, args: unknown[]) {
    if (!this.publicClient || !this.walletClient || !this.contractAddress) {
      throw new Error('EVM escrow is enabled but RPC, contract address, or signer configuration is missing.');
    }

    const hash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: stellarisEscrowAbi,
      functionName: functionName as never,
      args: args as never
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  private async recordEvent(
    campaignId: string,
    milestoneId: string | null,
    action: string,
    reference: string,
    payload: unknown
  ) {
    await this.db.run(`
      INSERT INTO escrow_events (id, campaign_id, milestone_id, provider, action, reference, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      randomUUID(),
      campaignId,
      milestoneId,
      this.mode,
      action,
      reference,
      JSON.stringify(payload),
      nowIso()
    ]);
  }
}
