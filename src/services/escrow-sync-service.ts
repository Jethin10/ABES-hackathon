import { createPublicClient, decodeEventLog, http } from 'viem';

import type { DatabaseClient } from '../db/database.js';
import { nowIso } from '../core/utils.js';
import { stellarisEscrowAbi } from '../contracts/stellarisEscrowAbi.js';
import { EscrowService } from './escrow-service.js';

export class EscrowSyncService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly escrowService: EscrowService,
    private readonly config: {
      mode: 'MOCK' | 'SIMULATED_EVM' | 'EVM';
      rpcUrl?: string;
      contractAddress?: string;
      chainId: number;
      startBlock: number;
    }
  ) {}

  async sync() {
    if (this.config.mode !== 'EVM') {
      return {
        synced: false,
        reason: 'Escrow sync is only required in EVM mode.'
      };
    }

    if (!this.config.rpcUrl || !this.config.contractAddress) {
      throw new Error('Escrow sync requires ESCROW_RPC_URL and ESCROW_CONTRACT_ADDRESS.');
    }

    const cursor = await this.db.get<{ cursorValue: string }>(`
      SELECT cursor_value as "cursorValue"
      FROM integration_cursors
      WHERE key = 'escrow:last_block'
    `);

    const fromBlock = BigInt(cursor?.cursorValue ?? `${this.config.startBlock}`);
    const client = createPublicClient({
      chain: {
        id: this.config.chainId,
        name: `stellaris-${this.config.chainId}`,
        nativeCurrency: {
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18
        },
        rpcUrls: {
          default: {
            http: [this.config.rpcUrl]
          }
        }
      },
      transport: http(this.config.rpcUrl)
    });

    const logs = await client.getLogs({
      address: this.config.contractAddress as `0x${string}`,
      fromBlock
    });

    for (const log of logs) {
      const decoded = decodeEventLog({
        abi: stellarisEscrowAbi,
        data: log.data,
        topics: log.topics
      });

      const reference = `${log.transactionHash}:${log.logIndex}`;
      if (decoded.eventName === 'CampaignCreated') {
        await this.escrowService.upsertSyncedEvent({
          campaignId: decoded.args.campaignId,
          action: 'CAMPAIGN_REGISTERED',
          reference,
          payload: decoded.args
        });
      }

      if (decoded.eventName === 'ContributionRecorded') {
        await this.escrowService.upsertSyncedEvent({
          campaignId: decoded.args.campaignId,
          action: 'CONTRIBUTION_LOCKED',
          reference,
          payload: decoded.args
        });
      }

      if (decoded.eventName === 'MilestoneReleased') {
        await this.escrowService.upsertSyncedEvent({
          campaignId: decoded.args.campaignId,
          milestoneId: decoded.args.milestoneId,
          action: 'MILESTONE_RELEASED',
          reference,
          payload: decoded.args
        });
      }

      if (decoded.eventName === 'CampaignPaused') {
        await this.escrowService.upsertSyncedEvent({
          campaignId: decoded.args.campaignId,
          action: 'CAMPAIGN_PAUSED',
          reference,
          payload: decoded.args
        });
      }

      if (decoded.eventName === 'CampaignResumed') {
        await this.escrowService.upsertSyncedEvent({
          campaignId: decoded.args.campaignId,
          action: 'CAMPAIGN_RESUMED',
          reference,
          payload: decoded.args
        });
      }
    }

    const lastBlock = logs.length > 0 ? logs[logs.length - 1]?.blockNumber ?? fromBlock : fromBlock;

    const existingCursor = await this.db.get(`
      SELECT key
      FROM integration_cursors
      WHERE key = 'escrow:last_block'
    `);

    if (existingCursor) {
      await this.db.run(`
        UPDATE integration_cursors
        SET cursor_value = ?, updated_at = ?
        WHERE key = 'escrow:last_block'
      `, [lastBlock.toString(), nowIso()]);
    } else {
      await this.db.run(`
        INSERT INTO integration_cursors (key, cursor_value, updated_at)
        VALUES ('escrow:last_block', ?, ?)
      `, [lastBlock.toString(), nowIso()]);
    }

    return {
      synced: true,
      processedLogs: logs.length,
      fromBlock: fromBlock.toString(),
      lastBlock: lastBlock.toString()
    };
  }
}
