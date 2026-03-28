import type { DatabaseClient } from '../db/database.js';
import { nowIso } from '../core/utils.js';
import type { FundingRail, TreasuryPoolSnapshot, TreasurySnapshot } from '../domain/types.js';

const FUNDING_RAILS: FundingRail[] = ['INDIA_FIAT', 'GLOBAL_CRYPTO'];

export class TreasuryService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly config: {
      defaultLiquidityBufferRatio: number;
      protocolReserveRatio: number;
      indiaLiquidityBufferRatio: number;
      indiaYieldDeploymentRatio: number;
      globalLiquidityBufferRatio: number;
      globalYieldDeploymentRatio: number;
    }
  ) {}

  async init() {
    await this.ensureLegacyState();
    await this.ensurePools();
  }

  async snapshot(): Promise<TreasurySnapshot> {
    const pools = await this.getPools();
    return {
      pools,
      totals: pools.reduce((accumulator, pool) => ({
        bufferBalance: accumulator.bufferBalance + pool.bufferBalance,
        yieldBalance: accumulator.yieldBalance + pool.yieldBalance,
        reserveBalance: accumulator.reserveBalance + pool.reserveBalance,
        totalContributions: accumulator.totalContributions + pool.totalContributions,
        totalPayouts: accumulator.totalPayouts + pool.totalPayouts
      }), {
        bufferBalance: 0,
        yieldBalance: 0,
        reserveBalance: 0,
        totalContributions: 0,
        totalPayouts: 0
      }),
      updatedAt: pools.reduce((latest, pool) => latest > pool.updatedAt ? latest : pool.updatedAt, nowIso())
    };
  }

  async allocateContribution(amount: number, rail: FundingRail) {
    const pool = await this.getPool(rail);
    const railConfig = this.getRailConfig(rail);
    const bufferAllocation = Number((amount * railConfig.liquidityBufferRatio).toFixed(2));
    const reserveAllocation = 0;
    const yieldAllocation = Number((amount - bufferAllocation).toFixed(2));

    await this.savePool({
      ...pool,
      bufferBalance: pool.bufferBalance + bufferAllocation,
      yieldBalance: pool.yieldBalance + yieldAllocation,
      reserveBalance: pool.reserveBalance + reserveAllocation,
      totalContributions: pool.totalContributions + amount
    });

    return this.snapshot();
  }

  async settlePayout(amount: number, rail: FundingRail) {
    const pool = await this.getPool(rail);
    let bufferBalance = pool.bufferBalance;
    let yieldBalance = pool.yieldBalance;
    let lastRebalanceAt = pool.lastRebalanceAt;

    if (bufferBalance < amount) {
      const deficit = Number((amount - bufferBalance).toFixed(2));
      if (yieldBalance < deficit) {
        throw new Error(`Treasury pool ${rail} does not have enough liquidity to settle payout.`);
      }

      yieldBalance = Number((yieldBalance - deficit).toFixed(2));
      bufferBalance = Number((bufferBalance + deficit).toFixed(2));
      lastRebalanceAt = nowIso();
    }

    bufferBalance = Number((bufferBalance - amount).toFixed(2));

    await this.savePool({
      ...pool,
      bufferBalance,
      yieldBalance,
      totalPayouts: Number((pool.totalPayouts + amount).toFixed(2)),
      lastRebalanceAt
    });

    return this.snapshot();
  }

  private async ensureLegacyState() {
    const existing = await this.db.get(`
      SELECT id
      FROM treasury_state
      WHERE id = 'main'
    `);

    if (existing) {
      return;
    }

    await this.db.run(`
      INSERT INTO treasury_state (
        id,
        buffer_balance,
        yield_balance,
        reserve_balance,
        total_contributions,
        total_payouts,
        updated_at
      )
      VALUES ('main', 0, 0, 0, 0, 0, ?)
    `, [nowIso()]);
  }

  private async ensurePools() {
    for (const rail of FUNDING_RAILS) {
      const existing = await this.db.get(`
        SELECT rail
        FROM treasury_pools
        WHERE rail = ?
      `, [rail]);

      if (existing) {
        continue;
      }

      await this.db.run(`
        INSERT INTO treasury_pools (
          rail,
          buffer_balance,
          yield_balance,
          reserve_balance,
          total_contributions,
          total_payouts,
          last_rebalance_at,
          updated_at
        )
        VALUES (?, 0, 0, 0, 0, 0, NULL, ?)
      `, [rail, nowIso()]);
    }
  }

  private async getPools() {
    return this.db.all<TreasuryPoolSnapshot>(`
      SELECT
        rail,
        buffer_balance as bufferBalance,
        yield_balance as yieldBalance,
        reserve_balance as reserveBalance,
        total_contributions as totalContributions,
        total_payouts as totalPayouts,
        last_rebalance_at as lastRebalanceAt,
        updated_at as updatedAt
      FROM treasury_pools
      ORDER BY rail ASC
    `);
  }

  private async getPool(rail: FundingRail) {
    const pool = await this.db.get<TreasuryPoolSnapshot>(`
      SELECT
        rail,
        buffer_balance as bufferBalance,
        yield_balance as yieldBalance,
        reserve_balance as reserveBalance,
        total_contributions as totalContributions,
        total_payouts as totalPayouts,
        last_rebalance_at as lastRebalanceAt,
        updated_at as updatedAt
      FROM treasury_pools
      WHERE rail = ?
    `, [rail]);

    if (!pool) {
      throw new Error(`Treasury pool ${rail} is missing.`);
    }

    return pool;
  }

  private async savePool(pool: Omit<TreasuryPoolSnapshot, 'updatedAt'>) {
    await this.db.run(`
      UPDATE treasury_pools
      SET
        buffer_balance = ?,
        yield_balance = ?,
        reserve_balance = ?,
        total_contributions = ?,
        total_payouts = ?,
        last_rebalance_at = ?,
        updated_at = ?
      WHERE rail = ?
    `, [
      pool.bufferBalance,
      pool.yieldBalance,
      pool.reserveBalance,
      pool.totalContributions,
      pool.totalPayouts,
      pool.lastRebalanceAt,
      nowIso(),
      pool.rail
    ]);
  }

  private getRailConfig(rail: FundingRail) {
    if (rail === 'INDIA_FIAT') {
      return {
        liquidityBufferRatio: this.config.indiaLiquidityBufferRatio,
        yieldDeploymentRatio: this.config.indiaYieldDeploymentRatio
      };
    }

    return {
      liquidityBufferRatio: this.config.globalLiquidityBufferRatio,
      yieldDeploymentRatio: this.config.globalYieldDeploymentRatio
    };
  }
}
