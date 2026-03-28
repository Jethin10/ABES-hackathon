import fp from 'fastify-plugin';

import type { FastifyInstance } from 'fastify';

import { AuditService } from '../services/audit-service.js';
import { CampaignService } from '../services/campaign-service.js';
import { EscrowService } from '../services/escrow-service.js';
import { EscrowSyncService } from '../services/escrow-sync-service.js';
import { IntegrationService } from '../services/integration-service.js';
import { TreasuryService } from '../services/treasury-service.js';
import { UserService } from '../services/user-service.js';

export const servicesPlugin = fp(async (app: FastifyInstance) => {
  const auditService = new AuditService(app.db);
  const escrowConfig = {
    ...(app.config.ESCROW_RPC_URL ? { rpcUrl: app.config.ESCROW_RPC_URL } : {}),
    ...(app.config.ESCROW_CONTRACT_ADDRESS ? { contractAddress: app.config.ESCROW_CONTRACT_ADDRESS } : {}),
    ...(app.config.ESCROW_ADMIN_PRIVATE_KEY ? { adminPrivateKey: app.config.ESCROW_ADMIN_PRIVATE_KEY } : {}),
    chainId: app.config.ESCROW_CHAIN_ID
  };
  const escrowService = new EscrowService(
    app.db,
    app.config.ESCROW_MODE,
    Object.keys(escrowConfig).length > 1 ? escrowConfig : undefined
  );
  const treasuryService = new TreasuryService(app.db, {
    defaultLiquidityBufferRatio: app.config.LIQUIDITY_BUFFER_RATIO,
    protocolReserveRatio: app.config.PROTOCOL_RESERVE_RATIO,
    indiaLiquidityBufferRatio: app.config.INDIA_LIQUIDITY_BUFFER_RATIO,
    indiaYieldDeploymentRatio: app.config.INDIA_YIELD_DEPLOYMENT_RATIO,
    globalLiquidityBufferRatio: app.config.GLOBAL_LIQUIDITY_BUFFER_RATIO,
    globalYieldDeploymentRatio: app.config.GLOBAL_YIELD_DEPLOYMENT_RATIO
  });
  const integrationService = new IntegrationService({
    indiaFiatProvider: app.config.INDIA_FIAT_PROVIDER,
    indiaEscrowBankName: app.config.INDIA_ESCROW_BANK_NAME,
    indiaEscrowBankAccount: app.config.INDIA_ESCROW_BANK_ACCOUNT,
    indiaEscrowBankIfsc: app.config.INDIA_ESCROW_BANK_IFSC,
    razorpayKeyId: app.config.RAZORPAY_KEY_ID,
    razorpayKeySecret: app.config.RAZORPAY_KEY_SECRET,
    phonepeMerchantId: app.config.PHONEPE_MERCHANT_ID,
    phonepeSaltKey: app.config.PHONEPE_SALT_KEY,
    phonepeSaltIndex: app.config.PHONEPE_SALT_INDEX,
    aavePoolAddress: app.config.AAVE_POOL_ADDRESS,
    morphoMarketId: app.config.MORPHO_MARKET_ID,
    usdcTokenAddress: app.config.USDC_TOKEN_ADDRESS,
    googleClientId: app.config.GOOGLE_CLIENT_ID,
    googleClientSecret: app.config.GOOGLE_CLIENT_SECRET,
    appleClientId: app.config.APPLE_CLIENT_ID,
    appleTeamId: app.config.APPLE_TEAM_ID,
    appleKeyId: app.config.APPLE_KEY_ID,
    applePrivateKey: app.config.APPLE_PRIVATE_KEY,
    facebookAppId: app.config.FACEBOOK_APP_ID,
    facebookAppSecret: app.config.FACEBOOK_APP_SECRET
  });

  const campaignService = new CampaignService(app.db, auditService, treasuryService, escrowService, {
    votingWindowHours: app.config.VOTING_WINDOW_HOURS,
    milestoneApprovalThreshold: app.config.MILESTONE_APPROVAL_THRESHOLD,
    milestoneQuorumThreshold: app.config.MILESTONE_QUORUM_THRESHOLD,
    arbitrationMinVotes: app.config.ARBITRATION_MIN_VOTES
  });

  app.decorate('services', {
    auditService,
    campaignService,
    escrowService,
    escrowSyncService: new EscrowSyncService(app.db, escrowService, {
      mode: app.config.ESCROW_MODE,
      ...(app.config.ESCROW_RPC_URL ? { rpcUrl: app.config.ESCROW_RPC_URL } : {}),
      ...(app.config.ESCROW_CONTRACT_ADDRESS ? { contractAddress: app.config.ESCROW_CONTRACT_ADDRESS } : {}),
      chainId: app.config.ESCROW_CHAIN_ID,
      startBlock: app.config.ESCROW_SYNC_START_BLOCK
    }),
    integrationService,
    treasuryService,
    userService: new UserService(app.db)
  });

  app.addHook('onReady', async () => {
    await treasuryService.init();
  });
});
