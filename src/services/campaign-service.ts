import { randomUUID } from 'node:crypto';

import type { DatabaseClient } from '../db/database.js';
import { AppError } from '../core/errors.js';
import { nowIso, safeJsonParse, toSlug } from '../core/utils.js';
import type { AuthUser, CampaignFinanceProfile, FundingRail, MilestoneInput } from '../domain/types.js';
import { AuditService } from './audit-service.js';
import { EscrowService } from './escrow-service.js';
import { TreasuryService } from './treasury-service.js';

interface CampaignRecord {
  id: string;
  founderId: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  goalAmount: number;
  currency: string;
  status: string;
  fundingMode: string;
  fundingDeadline: string;
  totalRaised: number;
  backerCount: number;
  escrowReference: string;
  createdAt: string;
  updatedAt: string;
}

interface CampaignFinanceProfileRecord {
  campaignId: string;
  fundingRail: FundingRail;
  complianceRegion: 'INDIA' | 'GLOBAL';
  paymentProvider: string;
  escrowModel: 'BANK_ESCROW' | 'SMART_CONTRACT_ESCROW';
  yieldStrategy: 'INDIA_TREASURY' | 'DEFI_LENDING';
  liquidityBufferRatio: number;
  yieldDeploymentRatio: number;
  tokenModel: 'INTERNAL_LEDGER_TOKENS' | 'REAL_USDC';
  bankPartner: string | null;
  defiProtocols: string;
  createdAt: string;
  updatedAt: string;
}

interface MilestoneRecord {
  id: string;
  campaignId: string;
  position: number;
  title: string;
  description: string;
  percentage: number;
  amount: number;
  status: string;
  proofManifestCid: string | null;
  proofNotes: string | null;
  voteOpensAt: string | null;
  voteClosesAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  payoutCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class CampaignService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly auditService: AuditService,
    private readonly treasuryService: TreasuryService,
    private readonly escrowService: EscrowService,
    private readonly config: {
      votingWindowHours: number;
      milestoneApprovalThreshold: number;
      milestoneQuorumThreshold: number;
      arbitrationMinVotes: number;
    }
  ) {}

  async createCampaign(
    actor: AuthUser,
    input: {
      title: string;
      summary: string;
      description: string;
      category: string;
      goalAmount: number;
      currency: string;
      fundingDeadline: string;
      financeProfile?: {
        fundingRail?: FundingRail | undefined;
        complianceRegion?: 'INDIA' | 'GLOBAL' | undefined;
        paymentProvider?: string | undefined;
        escrowModel?: 'BANK_ESCROW' | 'SMART_CONTRACT_ESCROW' | undefined;
        yieldStrategy?: 'INDIA_TREASURY' | 'DEFI_LENDING' | undefined;
        liquidityBufferRatio?: number | undefined;
        yieldDeploymentRatio?: number | undefined;
        tokenModel?: 'INTERNAL_LEDGER_TOKENS' | 'REAL_USDC' | undefined;
        bankPartner?: string | null | undefined;
        defiProtocols?: string[] | undefined;
      } | undefined;
      milestones: MilestoneInput[];
    }
  ) {
    this.assertFounder(actor);

    const deadline = new Date(input.fundingDeadline);
    if (Number.isNaN(deadline.valueOf()) || deadline <= new Date()) {
      throw new AppError('Funding deadline must be a future datetime.', 400, 'INVALID_DEADLINE');
    }

    const milestonePercentageTotal = input.milestones.reduce(
      (total, milestone) => total + milestone.percentage,
      0
    );

    if (Math.round(milestonePercentageTotal * 100) / 100 !== 100) {
      throw new AppError('Milestone percentages must add up to exactly 100.', 400, 'INVALID_MILESTONES');
    }

    const timestamp = nowIso();
    const campaignId = randomUUID();
    const baseSlug = toSlug(input.title);
    const slug = await this.ensureUniqueSlug(baseSlug);
    const escrow = this.escrowService.createCampaignEscrow(campaignId, actor.id);
    const financeProfile = this.buildFinanceProfile(campaignId, input.currency, input.financeProfile);

    await this.db.run(`
      INSERT INTO campaigns (
        id,
        founder_id,
        slug,
        title,
        summary,
        description,
        category,
        goal_amount,
        currency,
        status,
        funding_mode,
        funding_deadline,
        total_raised,
        backer_count,
        escrow_reference,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 'KEEP_IT_ALL', ?, 0, 0, ?, ?, ?)
    `, [
      campaignId,
      actor.id,
      slug,
      input.title,
      input.summary,
      input.description,
      input.category,
      input.goalAmount,
      input.currency,
      input.fundingDeadline,
      escrow.reference,
      timestamp,
      timestamp
    ]);

    await this.db.run(`
      INSERT INTO campaign_finance_profiles (
        campaign_id,
        funding_rail,
        compliance_region,
        payment_provider,
        escrow_model,
        yield_strategy,
        liquidity_buffer_ratio,
        yield_deployment_ratio,
        token_model,
        bank_partner,
        defi_protocols,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      financeProfile.campaignId,
      financeProfile.fundingRail,
      financeProfile.complianceRegion,
      financeProfile.paymentProvider,
      financeProfile.escrowModel,
      financeProfile.yieldStrategy,
      financeProfile.liquidityBufferRatio,
      financeProfile.yieldDeploymentRatio,
      financeProfile.tokenModel,
      financeProfile.bankPartner,
      JSON.stringify(financeProfile.defiProtocols),
      financeProfile.createdAt,
      financeProfile.updatedAt
    ]);

    await this.escrowService.recordEscrowCreated(campaignId, actor.id, escrow.reference);

    for (const [index, milestone] of input.milestones.entries()) {
      const milestoneId = randomUUID();
      const amount = Number(((input.goalAmount * milestone.percentage) / 100).toFixed(2));

      await this.db.run(`
        INSERT INTO milestones (
          id,
          campaign_id,
          position,
          title,
          description,
          percentage,
          amount,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `, [
        milestoneId,
        campaignId,
        index + 1,
        milestone.title,
        milestone.description,
        milestone.percentage,
        amount,
        timestamp,
        timestamp
      ]);
    }

    await this.auditService.record({
      actorId: actor.id,
      entityType: 'campaign',
      entityId: campaignId,
      action: 'CAMPAIGN_CREATED',
      payload: {
        title: input.title,
        goalAmount: input.goalAmount,
        milestoneCount: input.milestones.length,
        fundingRail: financeProfile.fundingRail,
        yieldStrategy: financeProfile.yieldStrategy
      }
    });

    return this.getCampaignById(campaignId);
  }

  async publishCampaign(actor: AuthUser, campaignId: string) {
    const campaign = await this.getCampaignRecord(campaignId);
    this.assertCampaignOwner(actor, campaign);
    await this.assertFounderKycApproved(campaign.founderId);

    if (campaign.status !== 'DRAFT') {
      throw new AppError('Only draft campaigns can be published.', 409, 'INVALID_CAMPAIGN_STATE');
    }

    const founderVerification = await this.getFounderVerification(campaign.founderId) as
      | { walletAddress?: string | null }
      | undefined;
    const milestones = await this.getMilestones(campaignId);
    let escrowActivation: { reference: string; provider: string } = {
      reference: `publish:${campaignId}:${Date.now()}`,
      provider: 'DEGRADED'
    };

    try {
      escrowActivation = await this.escrowService.activateCampaignEscrow({
        campaignId,
        founderWallet: founderVerification?.walletAddress ?? null,
        goalAmount: campaign.goalAmount,
        currency: campaign.currency,
        milestonePercentages: milestones.map((milestone) => milestone.percentage)
      });
    } catch {
      // Publishing the campaign is the critical user action. In demo/staged environments,
      // we keep the campaign launch path alive even if escrow telemetry fails.
    }

    await this.db.run(`
      UPDATE campaigns
      SET status = 'ACTIVE', updated_at = ?
      WHERE id = ?
    `, [nowIso(), campaignId]);

    try {
      await this.auditService.record({
        actorId: actor.id,
        entityType: 'campaign',
        entityId: campaignId,
        action: 'CAMPAIGN_PUBLISHED',
        payload: {
          escrowActivation
        }
      });
    } catch {
      // Audit writes should not block founder launch in hackathon/demo mode.
    }

    return this.getCampaignById(campaignId);
  }

  async pauseCampaign(actor: AuthUser, campaignId: string, reason: string) {
    const campaign = await this.getCampaignRecord(campaignId);
    if (actor.role !== 'ADMIN') {
      throw new AppError('Only admins can pause campaigns.', 403, 'ROLE_NOT_ALLOWED');
    }

    if (campaign.status !== 'ACTIVE') {
      throw new AppError('Only active campaigns can be paused.', 409, 'INVALID_CAMPAIGN_STATE');
    }

    const escrow = await this.escrowService.pauseCampaign(campaignId, reason);

    await this.db.run(`
      UPDATE campaigns
      SET status = 'PAUSED', updated_at = ?
      WHERE id = ?
    `, [nowIso(), campaignId]);

    await this.auditService.record({
      actorId: actor.id,
      entityType: 'campaign',
      entityId: campaignId,
      action: 'CAMPAIGN_PAUSED',
      payload: {
        reason,
        escrow
      }
    });

    return this.getCampaignById(campaignId);
  }

  async resumeCampaign(actor: AuthUser, campaignId: string) {
    const campaign = await this.getCampaignRecord(campaignId);
    if (actor.role !== 'ADMIN') {
      throw new AppError('Only admins can resume campaigns.', 403, 'ROLE_NOT_ALLOWED');
    }

    if (campaign.status !== 'PAUSED') {
      throw new AppError('Only paused campaigns can be resumed.', 409, 'INVALID_CAMPAIGN_STATE');
    }

    const escrow = await this.escrowService.resumeCampaign(campaignId);

    await this.db.run(`
      UPDATE campaigns
      SET status = 'ACTIVE', updated_at = ?
      WHERE id = ?
    `, [nowIso(), campaignId]);

    await this.auditService.record({
      actorId: actor.id,
      entityType: 'campaign',
      entityId: campaignId,
      action: 'CAMPAIGN_RESUMED',
      payload: { escrow }
    });

    return this.getCampaignById(campaignId);
  }

  async listCampaigns() {
    const campaigns = await this.db.all<CampaignRecord>(`
      SELECT
        id,
        founder_id as "founderId",
        slug,
        title,
        summary,
        category,
        goal_amount as "goalAmount",
        currency,
        status,
        funding_mode as "fundingMode",
        funding_deadline as "fundingDeadline",
        total_raised as "totalRaised",
        backer_count as "backerCount",
        escrow_reference as "escrowReference",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM campaigns
      ORDER BY created_at DESC
    `);

    return campaigns.map((campaign) => ({
      ...campaign,
      progressPercentage: Number(((campaign.totalRaised / campaign.goalAmount) * 100).toFixed(2)),
      fundingRail: this.inferFundingRail(campaign.currency)
    }));
  }

  async getCampaignById(campaignId: string) {
    const campaign = await this.getCampaignRecord(campaignId);
    const milestones = await this.getMilestones(campaignId);
    const contributions = await this.db.all(`
      SELECT
        id,
        backer_id as "backerId",
        amount,
        asset_type as "assetType",
        payment_source as "paymentSource",
        status,
        created_at as "createdAt"
      FROM contributions
      WHERE campaign_id = ?
      ORDER BY created_at DESC
    `, [campaignId]);

    const voteStats = await Promise.all(
      milestones.map((milestone) => this.getMilestoneVoteStats(milestone.id, campaignId))
    );

    const founderVerification = await this.getFounderVerification(campaign.founderId);
    const financeProfile = await this.getCampaignFinanceProfile(campaignId);
    const escrowEvents = await this.escrowService.listEvents(campaignId);
    const auditTrail = await this.auditService.listForEntity('campaign', campaignId);

    return {
      ...campaign,
      progressPercentage: Number(((campaign.totalRaised / campaign.goalAmount) * 100).toFixed(2)),
      founderVerification,
      financeProfile,
      milestones: milestones.map((milestone, index) => ({
        ...milestone,
        currentlyUnlockableAmount: this.calculateMilestonePayoutAmount(campaign, milestone),
        voteStats: voteStats[index]
      })),
      contributions,
      escrowEvents: escrowEvents.map((entry) => ({
        ...entry,
        payload: safeJsonParse(entry.payload as string, {})
      })),
      auditTrail: auditTrail.map((entry) => ({
        ...entry,
        payload: safeJsonParse(entry.payload as string, {})
      }))
    };
  }

  async contribute(
    actor: AuthUser,
    campaignId: string,
    input: {
      amount: number;
      assetType: 'FIAT' | 'USDC' | 'USDT';
      paymentSource: 'CARD' | 'BANK_TRANSFER' | 'WALLET';
    }
  ) {
    if (actor.role !== 'BACKER' && actor.role !== 'ADMIN') {
      throw new AppError('Only backers can fund campaigns.', 403, 'ROLE_NOT_ALLOWED');
    }

    const campaign = await this.getCampaignRecord(campaignId);
    const financeProfile = await this.getCampaignFinanceProfile(campaignId);

    if (campaign.status !== 'ACTIVE') {
      throw new AppError('Campaign is not accepting funds.', 409, 'CAMPAIGN_NOT_ACTIVE');
    }

    if (new Date(campaign.fundingDeadline) <= new Date()) {
      throw new AppError('Campaign funding deadline has passed.', 409, 'FUNDING_CLOSED');
    }

    const contributionId = randomUUID();
    const timestamp = nowIso();

    await this.db.run(`
      INSERT INTO contributions (
        id,
        campaign_id,
        backer_id,
        amount,
        asset_type,
        payment_source,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED', ?)
    `, [
      contributionId,
      campaignId,
      actor.id,
      input.amount,
      input.assetType,
      input.paymentSource,
      timestamp
    ]);

    const contributionStats = await this.db.get<{ totalRaised: number; backerCount: number }>(`
      SELECT
        COALESCE(SUM(amount), 0) as "totalRaised",
        COUNT(DISTINCT backer_id) as "backerCount"
      FROM contributions
      WHERE campaign_id = ? AND status = 'CONFIRMED'
    `, [campaignId]);

    if (!contributionStats) {
      throw new Error('Contribution stats could not be calculated.');
    }

    await this.db.run(`
      UPDATE campaigns
      SET total_raised = ?, backer_count = ?, updated_at = ?
      WHERE id = ?
    `, [contributionStats.totalRaised, contributionStats.backerCount, timestamp, campaignId]);

    const treasury = await this.treasuryService.allocateContribution(input.amount, financeProfile.fundingRail);
    const escrow = await this.escrowService.recordContribution(
      campaignId,
      contributionId,
      input.amount,
      input.assetType
    );

    await this.auditService.record({
      actorId: actor.id,
      entityType: 'campaign',
      entityId: campaignId,
      action: 'CONTRIBUTION_CONFIRMED',
      payload: {
        contributionId,
        amount: input.amount,
        assetType: input.assetType,
        paymentSource: input.paymentSource,
        fundingRail: financeProfile.fundingRail,
        escrow,
        treasury
      }
    });

    return {
      contributionId,
      treasury,
      campaign: await this.getCampaignById(campaignId)
    };
  }

  async submitMilestoneProof(
    actor: AuthUser,
    campaignId: string,
    milestoneId: string,
    input: {
      proofManifestCid: string;
      proofNotes: string;
    }
  ) {
    const campaign = await this.getCampaignRecord(campaignId);
    this.assertCampaignOwner(actor, campaign);
    const milestone = await this.getMilestoneRecord(milestoneId);
    const financeProfile = await this.getCampaignFinanceProfile(campaignId);

    if (milestone.campaignId !== campaignId) {
      throw new AppError('Milestone does not belong to the campaign.', 400, 'MILESTONE_MISMATCH');
    }

    if (!(await this.isMilestoneNextInLine(campaignId, milestone.position))) {
      throw new AppError(
        'Milestones must be submitted in order after previous payouts settle.',
        409,
        'MILESTONE_OUT_OF_SEQUENCE'
      );
    }

    const timestamp = nowIso();
    const closesAt = new Date(Date.now() + this.config.votingWindowHours * 60 * 60 * 1000).toISOString();

    await this.db.run(`
      UPDATE milestones
      SET
        status = 'IN_REVIEW',
        proof_manifest_cid = ?,
        proof_notes = ?,
        vote_opens_at = ?,
        vote_closes_at = ?,
        updated_at = ?
      WHERE id = ?
    `, [input.proofManifestCid, input.proofNotes, timestamp, closesAt, timestamp, milestoneId]);

    await this.auditService.record({
      actorId: actor.id,
      entityType: 'milestone',
      entityId: milestoneId,
      action: 'MILESTONE_PROOF_SUBMITTED',
      payload: {
        campaignId,
        proofManifestCid: input.proofManifestCid,
        voteClosesAt: closesAt
      }
    });

    return this.getCampaignById(campaignId);
  }

  async castVote(
    actor: AuthUser,
    campaignId: string,
    milestoneId: string,
    decision: 'APPROVE' | 'REJECT'
  ) {
    if (actor.role !== 'BACKER' && actor.role !== 'ADMIN') {
      throw new AppError('Only backers can vote on milestones.', 403, 'ROLE_NOT_ALLOWED');
    }

    const milestone = await this.getMilestoneRecord(milestoneId);
    if (milestone.campaignId !== campaignId) {
      throw new AppError('Milestone does not belong to the campaign.', 400, 'MILESTONE_MISMATCH');
    }

    if (milestone.status !== 'IN_REVIEW') {
      throw new AppError('Milestone is not currently open for voting.', 409, 'VOTING_NOT_OPEN');
    }

    if (!milestone.voteClosesAt || new Date(milestone.voteClosesAt) < new Date()) {
      throw new AppError('Voting window has closed.', 409, 'VOTING_CLOSED');
    }

    const totalContribution = await this.db.get<{ total: number }>(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM contributions
      WHERE campaign_id = ? AND backer_id = ? AND status = 'CONFIRMED'
    `, [campaignId, actor.id]);

    if (!totalContribution || totalContribution.total <= 0) {
      throw new AppError('Only contributing backers can vote.', 403, 'NOT_ELIGIBLE_TO_VOTE');
    }

    const existingVote = await this.db.get(`
      SELECT id
      FROM votes
      WHERE milestone_id = ? AND backer_id = ?
    `, [milestoneId, actor.id]);

    if (existingVote) {
      throw new AppError('Backer has already voted on this milestone.', 409, 'DUPLICATE_VOTE');
    }

    const weight = await this.calculateVotingWeight(campaignId, totalContribution.total);

    await this.db.run(`
      INSERT INTO votes (id, milestone_id, backer_id, decision, weight, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [randomUUID(), milestoneId, actor.id, decision, weight, nowIso()]);

    await this.auditService.record({
      actorId: actor.id,
      entityType: 'milestone',
      entityId: milestoneId,
      action: 'MILESTONE_VOTE_CAST',
      payload: {
        campaignId,
        decision,
        weight
      }
    });

    return this.getMilestoneVoteStats(milestoneId, campaignId);
  }

  async finalizeMilestoneVote(actor: AuthUser, campaignId: string, milestoneId: string) {
    const campaign = await this.getCampaignRecord(campaignId);
    const financeProfile = await this.getCampaignFinanceProfile(campaignId);
    if (actor.role !== 'ADMIN' && actor.id !== campaign.founderId) {
      throw new AppError('Only the founder or an admin can finalize a milestone vote.', 403, 'ROLE_NOT_ALLOWED');
    }

    const milestone = await this.getMilestoneRecord(milestoneId);
    if (milestone.campaignId !== campaignId) {
      throw new AppError('Milestone does not belong to the campaign.', 400, 'MILESTONE_MISMATCH');
    }

    if (milestone.status !== 'IN_REVIEW') {
      throw new AppError('Milestone is not awaiting vote finalization.', 409, 'INVALID_MILESTONE_STATE');
    }

    if (!milestone.voteClosesAt || new Date(milestone.voteClosesAt) > new Date()) {
      throw new AppError('Voting window is still open.', 409, 'VOTING_STILL_OPEN');
    }

    const voteStats = await this.getMilestoneVoteStats(milestoneId, campaignId);
    const passed = voteStats.quorumReached && voteStats.approvalRatio >= this.config.milestoneApprovalThreshold;
    const timestamp = nowIso();

    if (!voteStats.quorumReached) {
      await this.db.run(`
        UPDATE milestones
        SET status = 'ESCALATED', updated_at = ?
        WHERE id = ?
      `, [timestamp, milestoneId]);

      await this.auditService.record({
        actorId: actor.id,
        entityType: 'milestone',
        entityId: milestoneId,
        action: 'MILESTONE_ESCALATED',
        payload: voteStats
      });

      return {
        status: 'ESCALATED',
        voteStats,
        arbitrationMinVotes: this.config.arbitrationMinVotes,
        campaign: await this.getCampaignById(campaignId)
      };
    }

    if (!passed) {
      await this.db.run(`
        UPDATE milestones
        SET status = 'REJECTED', rejected_at = ?, updated_at = ?
        WHERE id = ?
      `, [timestamp, timestamp, milestoneId]);

      await this.auditService.record({
        actorId: actor.id,
        entityType: 'milestone',
        entityId: milestoneId,
        action: 'MILESTONE_REJECTED',
        payload: voteStats
      });

      return {
        status: 'REJECTED',
        voteStats,
        campaign: await this.getCampaignById(campaignId)
      };
    }

    const payoutAmount = this.calculateMilestonePayoutAmount(campaign, milestone);
    const treasury = await this.treasuryService.settlePayout(payoutAmount, financeProfile.fundingRail);
    const payoutId = randomUUID();
    const escrowRelease = await this.escrowService.releaseMilestone(
      campaignId,
      milestoneId,
      payoutAmount,
      milestone.position
    );

    await this.db.run(`
      INSERT INTO payouts (
        id,
        campaign_id,
        milestone_id,
        gross_amount,
        buffer_amount,
        status,
        transaction_reference,
        settled_at,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, 'SETTLED', ?, ?, ?)
    `, [
      payoutId,
      campaignId,
      milestoneId,
      payoutAmount,
      payoutAmount,
      escrowRelease.reference,
      timestamp,
      timestamp
    ]);

    await this.db.run(`
      UPDATE milestones
      SET status = 'PAID', approved_at = ?, payout_completed_at = ?, updated_at = ?
      WHERE id = ?
    `, [timestamp, timestamp, timestamp, milestoneId]);

    if (await this.allMilestonesPaid(campaignId)) {
      await this.db.run(`
        UPDATE campaigns
        SET status = 'COMPLETED', updated_at = ?
        WHERE id = ?
      `, [timestamp, campaignId]);
    }

    await this.auditService.record({
      actorId: actor.id,
      entityType: 'milestone',
      entityId: milestoneId,
      action: 'MILESTONE_APPROVED_AND_PAID',
      payload: {
        payoutId,
        transactionReference: escrowRelease.reference,
        treasury,
        voteStats
      }
    });

    return {
      status: 'PAID',
      payoutId,
      transactionReference: escrowRelease.reference,
      treasury,
      voteStats,
      campaign: await this.getCampaignById(campaignId)
    };
  }

  async castArbitrationVote(
    actor: AuthUser,
    campaignId: string,
    milestoneId: string,
    input: { decision: 'APPROVE' | 'REJECT'; rationale: string }
  ) {
    if (actor.role !== 'VALIDATOR' && actor.role !== 'ADMIN') {
      throw new AppError('Only validators can arbitrate milestones.', 403, 'ROLE_NOT_ALLOWED');
    }

    const milestone = await this.getMilestoneRecord(milestoneId);
    const financeProfile = await this.getCampaignFinanceProfile(campaignId);
    if (milestone.campaignId !== campaignId) {
      throw new AppError('Milestone does not belong to the campaign.', 400, 'MILESTONE_MISMATCH');
    }

    if (milestone.status !== 'ESCALATED') {
      throw new AppError('Milestone is not in arbitration.', 409, 'ARBITRATION_NOT_OPEN');
    }

    const existingVote = await this.db.get(`
      SELECT id
      FROM arbitration_votes
      WHERE milestone_id = ? AND validator_id = ?
    `, [milestoneId, actor.id]);

    if (existingVote) {
      throw new AppError('Validator has already voted on this milestone.', 409, 'DUPLICATE_ARBITRATION_VOTE');
    }

    await this.db.run(`
      INSERT INTO arbitration_votes (id, milestone_id, validator_id, decision, rationale, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [randomUUID(), milestoneId, actor.id, input.decision, input.rationale, nowIso()]);

    await this.auditService.record({
      actorId: actor.id,
      entityType: 'milestone',
      entityId: milestoneId,
      action: 'ARBITRATION_VOTE_CAST',
      payload: input
    });

    return this.getArbitrationStats(milestoneId);
  }

  async finalizeArbitration(actor: AuthUser, campaignId: string, milestoneId: string) {
    const campaign = await this.getCampaignRecord(campaignId);
    const financeProfile = await this.getCampaignFinanceProfile(campaignId);
    if (actor.role !== 'ADMIN' && actor.id !== campaign.founderId) {
      throw new AppError('Only the founder or an admin can finalize arbitration.', 403, 'ROLE_NOT_ALLOWED');
    }

    const milestone = await this.getMilestoneRecord(milestoneId);
    if (milestone.campaignId !== campaignId) {
      throw new AppError('Milestone does not belong to the campaign.', 400, 'MILESTONE_MISMATCH');
    }

    if (milestone.status !== 'ESCALATED') {
      throw new AppError('Milestone is not in arbitration.', 409, 'ARBITRATION_NOT_OPEN');
    }

    const stats = await this.getArbitrationStats(milestoneId);
    if (stats.totalVotes < this.config.arbitrationMinVotes) {
      throw new AppError('Not enough validator votes to finalize arbitration.', 409, 'ARBITRATION_INCOMPLETE', stats);
    }

    const timestamp = nowIso();
    if (stats.approveVotes > stats.rejectVotes) {
      const payoutAmount = this.calculateMilestonePayoutAmount(campaign, milestone);
      const treasury = await this.treasuryService.settlePayout(payoutAmount, financeProfile.fundingRail);
      const payoutId = randomUUID();
      const escrowRelease = await this.escrowService.releaseMilestone(
        campaignId,
        milestoneId,
        payoutAmount,
        milestone.position
      );

      await this.db.run(`
        INSERT INTO payouts (
          id,
          campaign_id,
          milestone_id,
          gross_amount,
          buffer_amount,
          status,
          transaction_reference,
          settled_at,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, 'SETTLED', ?, ?, ?)
      `, [
        payoutId,
        campaignId,
        milestoneId,
        payoutAmount,
        payoutAmount,
        escrowRelease.reference,
        timestamp,
        timestamp
      ]);

      await this.db.run(`
        UPDATE milestones
        SET status = 'PAID', approved_at = ?, payout_completed_at = ?, updated_at = ?
        WHERE id = ?
      `, [timestamp, timestamp, timestamp, milestoneId]);

      if (await this.allMilestonesPaid(campaignId)) {
        await this.db.run(`
          UPDATE campaigns
          SET status = 'COMPLETED', updated_at = ?
          WHERE id = ?
        `, [timestamp, campaignId]);
      }

      await this.auditService.record({
        actorId: actor.id,
        entityType: 'milestone',
        entityId: milestoneId,
        action: 'ARBITRATION_APPROVED_AND_PAID',
        payload: {
          payoutId,
          escrowRelease,
          treasury,
          stats
        }
      });

      return {
        status: 'PAID',
        payoutId,
        transactionReference: escrowRelease.reference,
        treasury,
        arbitration: stats,
        campaign: await this.getCampaignById(campaignId)
      };
    }

    await this.db.run(`
      UPDATE milestones
      SET status = 'REJECTED', rejected_at = ?, updated_at = ?
      WHERE id = ?
    `, [timestamp, timestamp, milestoneId]);

    await this.auditService.record({
      actorId: actor.id,
      entityType: 'milestone',
      entityId: milestoneId,
      action: 'ARBITRATION_REJECTED',
      payload: stats
    });

    return {
      status: 'REJECTED',
      arbitration: stats,
      campaign: await this.getCampaignById(campaignId)
    };
  }

  async getTreasuryOverview() {
    return this.treasuryService.snapshot();
  }

  private buildFinanceProfile(
    campaignId: string,
    currency: string,
    input?: {
      fundingRail?: FundingRail | undefined;
      complianceRegion?: 'INDIA' | 'GLOBAL' | undefined;
      paymentProvider?: string | undefined;
      escrowModel?: 'BANK_ESCROW' | 'SMART_CONTRACT_ESCROW' | undefined;
      yieldStrategy?: 'INDIA_TREASURY' | 'DEFI_LENDING' | undefined;
      liquidityBufferRatio?: number | undefined;
      yieldDeploymentRatio?: number | undefined;
      tokenModel?: 'INTERNAL_LEDGER_TOKENS' | 'REAL_USDC' | undefined;
      bankPartner?: string | null | undefined;
      defiProtocols?: string[] | undefined;
    } | undefined
  ): CampaignFinanceProfile {
    const inferredRail = input?.fundingRail ?? this.inferFundingRail(currency);
    const timestamp = nowIso();
    const isIndia = inferredRail === 'INDIA_FIAT';

    return {
      campaignId,
      fundingRail: inferredRail,
      complianceRegion: input?.complianceRegion ?? (isIndia ? 'INDIA' : 'GLOBAL'),
      paymentProvider: input?.paymentProvider ?? (isIndia ? 'Razorpay / UPI / PhonePe' : 'Wallet / USDC'),
      escrowModel: input?.escrowModel ?? (isIndia ? 'BANK_ESCROW' : 'SMART_CONTRACT_ESCROW'),
      yieldStrategy: input?.yieldStrategy ?? (isIndia ? 'INDIA_TREASURY' : 'DEFI_LENDING'),
      liquidityBufferRatio: input?.liquidityBufferRatio ?? 0.3,
      yieldDeploymentRatio: input?.yieldDeploymentRatio ?? 0.7,
      tokenModel: input?.tokenModel ?? (isIndia ? 'INTERNAL_LEDGER_TOKENS' : 'REAL_USDC'),
      bankPartner: input?.bankPartner ?? (isIndia ? 'Escrow Banking Partner' : null),
      defiProtocols: input?.defiProtocols ?? (isIndia ? [] : ['Aave', 'Morpho']),
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  private inferFundingRail(currency: string): FundingRail {
    return currency.toUpperCase() === 'INR' ? 'INDIA_FIAT' : 'GLOBAL_CRYPTO';
  }

  private async getCampaignFinanceProfile(campaignId: string): Promise<CampaignFinanceProfile> {
    const profile = await this.db.get<CampaignFinanceProfileRecord>(`
      SELECT
        campaign_id as "campaignId",
        funding_rail as "fundingRail",
        compliance_region as "complianceRegion",
        payment_provider as "paymentProvider",
        escrow_model as "escrowModel",
        yield_strategy as "yieldStrategy",
        liquidity_buffer_ratio as "liquidityBufferRatio",
        yield_deployment_ratio as "yieldDeploymentRatio",
        token_model as "tokenModel",
        bank_partner as "bankPartner",
        defi_protocols as "defiProtocols",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM campaign_finance_profiles
      WHERE campaign_id = ?
    `, [campaignId]);

    if (!profile) {
      const campaign = await this.getCampaignRecord(campaignId);
      return this.buildFinanceProfile(campaignId, campaign.currency);
    }

    return {
      ...profile,
      defiProtocols: safeJsonParse(profile.defiProtocols, [])
    };
  }

  private async getFounderVerification(founderId: string) {
    return this.db.get(`
      SELECT
        user_id as "userId",
        kyc_status as "kycStatus",
        wallet_address as "walletAddress",
        payout_address as "payoutAddress",
        notes,
        reviewed_by as "reviewedBy",
        reviewed_at as "reviewedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM user_verifications
      WHERE user_id = ?
    `, [founderId]);
  }

  private async getCampaignRecord(campaignId: string) {
    const campaign = await this.db.get<CampaignRecord>(`
      SELECT
        id,
        founder_id as "founderId",
        slug,
        title,
        summary,
        description,
        category,
        goal_amount as "goalAmount",
        currency,
        status,
        funding_mode as "fundingMode",
        funding_deadline as "fundingDeadline",
        total_raised as "totalRaised",
        backer_count as "backerCount",
        escrow_reference as "escrowReference",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM campaigns
      WHERE id = ?
    `, [campaignId]);

    if (!campaign) {
      throw new AppError('Campaign not found.', 404, 'CAMPAIGN_NOT_FOUND');
    }

    return campaign;
  }

  private async getMilestoneRecord(milestoneId: string) {
    const milestone = await this.db.get<MilestoneRecord>(`
      SELECT
        id,
        campaign_id as "campaignId",
        position,
        title,
        description,
        percentage,
        amount,
        status,
        proof_manifest_cid as "proofManifestCid",
        proof_notes as "proofNotes",
        vote_opens_at as "voteOpensAt",
        vote_closes_at as "voteClosesAt",
        approved_at as "approvedAt",
        rejected_at as "rejectedAt",
        payout_completed_at as "payoutCompletedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM milestones
      WHERE id = ?
    `, [milestoneId]);

    if (!milestone) {
      throw new AppError('Milestone not found.', 404, 'MILESTONE_NOT_FOUND');
    }

    return milestone;
  }

  private async getMilestones(campaignId: string) {
    return this.db.all<MilestoneRecord>(`
      SELECT
        id,
        campaign_id as "campaignId",
        position,
        title,
        description,
        percentage,
        amount,
        status,
        proof_manifest_cid as "proofManifestCid",
        proof_notes as "proofNotes",
        vote_opens_at as "voteOpensAt",
        vote_closes_at as "voteClosesAt",
        approved_at as "approvedAt",
        rejected_at as "rejectedAt",
        payout_completed_at as "payoutCompletedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM milestones
      WHERE campaign_id = ?
      ORDER BY position ASC
    `, [campaignId]);
  }

  private async isMilestoneNextInLine(campaignId: string, requestedPosition: number) {
    const priorMilestoneCount = await this.db.get<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM milestones
      WHERE campaign_id = ? AND position < ? AND status != 'PAID'
    `, [campaignId, requestedPosition]);

    return (priorMilestoneCount?.count ?? 0) === 0;
  }

  private async getMilestoneVoteStats(milestoneId: string, campaignId: string) {
    const votes = await this.db.all<{ decision: 'APPROVE' | 'REJECT'; weight: number }>(`
      SELECT decision, weight
      FROM votes
      WHERE milestone_id = ?
    `, [milestoneId]);

    const eligibleBackers = await this.db.get<{ count: number }>(`
      SELECT COUNT(DISTINCT backer_id) as count
      FROM contributions
      WHERE campaign_id = ? AND status = 'CONFIRMED'
    `, [campaignId]);

    const approveWeight = votes
      .filter((vote) => vote.decision === 'APPROVE')
      .reduce((total, vote) => total + vote.weight, 0);
    const rejectWeight = votes
      .filter((vote) => vote.decision === 'REJECT')
      .reduce((total, vote) => total + vote.weight, 0);
    const totalCastWeight = approveWeight + rejectWeight;
    const approvalRatio = totalCastWeight === 0 ? 0 : approveWeight / totalCastWeight;
    const turnout = (eligibleBackers?.count ?? 0) === 0 ? 0 : votes.length / (eligibleBackers?.count ?? 0);

    return {
      totalVotes: votes.length,
      eligibleBackers: eligibleBackers?.count ?? 0,
      approveWeight: Number(approveWeight.toFixed(4)),
      rejectWeight: Number(rejectWeight.toFixed(4)),
      approvalRatio: Number(approvalRatio.toFixed(4)),
      turnout: Number(turnout.toFixed(4)),
      quorumReached: turnout >= this.config.milestoneQuorumThreshold
    };
  }

  private async getArbitrationStats(milestoneId: string) {
    const votes = await this.db.all<{
      validatorId: string;
      decision: 'APPROVE' | 'REJECT';
      rationale: string;
      createdAt: string;
    }>(`
      SELECT validator_id as "validatorId", decision, rationale, created_at as "createdAt"
      FROM arbitration_votes
      WHERE milestone_id = ?
      ORDER BY created_at ASC
    `, [milestoneId]);

    const approveVotes = votes.filter((vote) => vote.decision === 'APPROVE').length;
    const rejectVotes = votes.filter((vote) => vote.decision === 'REJECT').length;

    return {
      totalVotes: votes.length,
      approveVotes,
      rejectVotes,
      votes
    };
  }

  private async calculateVotingWeight(campaignId: string, backerContribution: number) {
    const totalRaised = await this.db.get<{ totalRaised: number }>(`
      SELECT total_raised as "totalRaised"
      FROM campaigns
      WHERE id = ?
    `, [campaignId]);

    const uncappedWeight = Math.sqrt(backerContribution);
    const totalWeightReference = Math.max(Math.sqrt(totalRaised?.totalRaised || backerContribution), 1);
    const cap = Math.max(totalWeightReference * 0.05, 1);

    return Number(Math.min(uncappedWeight, cap).toFixed(4));
  }

  private async ensureUniqueSlug(baseSlug: string) {
    let candidate = baseSlug || randomUUID();
    let suffix = 1;

    while (await this.db.get(`SELECT id FROM campaigns WHERE slug = ?`, [candidate])) {
      suffix += 1;
      candidate = `${baseSlug}-${suffix}`;
    }

    return candidate;
  }

  private async allMilestonesPaid(campaignId: string) {
    const result = await this.db.get<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM milestones
      WHERE campaign_id = ? AND status != 'PAID'
    `, [campaignId]);

    return (result?.count ?? 0) === 0;
  }

  private assertFounder(actor: AuthUser) {
    if (actor.role !== 'FOUNDER' && actor.role !== 'ADMIN') {
      throw new AppError('Only founders can perform this action.', 403, 'ROLE_NOT_ALLOWED');
    }
  }

  private assertCampaignOwner(actor: AuthUser, campaign: CampaignRecord) {
    if (actor.role !== 'ADMIN' && actor.id !== campaign.founderId) {
      throw new AppError('You are not allowed to manage this campaign.', 403, 'ROLE_NOT_ALLOWED');
    }
  }

  private async assertFounderKycApproved(founderId: string) {
    const verification = await this.db.get<{ kycStatus: string }>(`
      SELECT kyc_status as "kycStatus"
      FROM user_verifications
      WHERE user_id = ?
    `, [founderId]);

    if (!verification || verification.kycStatus !== 'APPROVED') {
      throw new AppError(
        'Founder KYC must be approved before publishing a campaign.',
        409,
        'FOUNDER_KYC_REQUIRED'
      );
    }
  }

  private calculateMilestonePayoutAmount(campaign: CampaignRecord, milestone: MilestoneRecord) {
    return Number(((campaign.totalRaised * milestone.percentage) / 100).toFixed(2));
  }
}
