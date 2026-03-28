import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildApp } from '../app.js';

const shouldReset = process.argv.includes('--reset');
const databasePath = process.env.DATABASE_PATH ?? './data/stellaris.db';
const resolvedPath = resolve(databasePath);

if (shouldReset && existsSync(resolvedPath)) {
  rmSync(resolvedPath, { force: true });
}

const app = buildApp({ databasePath });

const seed = async () => {
  await app.ready();

  const admin = await app.services.userService.register({
    fullName: 'Admin Demo',
    email: 'admin@stellaris.dev',
    password: 'secret-pass-admin',
    role: 'ADMIN'
  });

  const founder = await app.services.userService.register({
    fullName: 'Founder Demo',
    email: 'founder@stellaris.dev',
    password: 'secret-pass-founder',
    role: 'FOUNDER'
  });

  const backerOne = await app.services.userService.register({
    fullName: 'Backer Demo One',
    email: 'backer1@stellaris.dev',
    password: 'secret-pass-backer1',
    role: 'BACKER'
  });

  const backerTwo = await app.services.userService.register({
    fullName: 'Backer Demo Two',
    email: 'backer2@stellaris.dev',
    password: 'secret-pass-backer2',
    role: 'BACKER'
  });

  const validatorOne = await app.services.userService.register({
    fullName: 'Validator Demo One',
    email: 'validator1@stellaris.dev',
    password: 'secret-pass-validator1',
    role: 'VALIDATOR'
  });

  await app.services.userService.reviewVerification(admin, founder.id, {
    kycStatus: 'APPROVED',
    walletAddress: '0xfounderwalletdemo',
    payoutAddress: 'founder-bank-demo',
    notes: 'Demo founder approved for launch.'
  });

  const campaign = await app.services.campaignService.createCampaign(founder, {
    title: 'Stellaris Demo Campaign',
    summary: 'Milestone-based crowdfunding for a production-grade product launch.',
    description:
      'This seeded campaign demonstrates the complete backend flow from verified founder onboarding to contributions, milestone voting, and payout orchestration.',
    category: 'SaaS',
    goalAmount: 15000,
    currency: 'INR',
    fundingDeadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
    milestones: [
      {
        title: 'Prototype Release',
        description: 'Deploy the initial prototype with technical documentation and demo assets.',
        percentage: 40
      },
      {
        title: 'Beta Launch',
        description: 'Ship the private beta with analytics, onboarding, and pilot users.',
        percentage: 60
      }
    ]
  });

  await app.services.campaignService.createCampaign(founder, {
    title: 'Stellaris Global USDC Campaign',
    summary: 'Hybrid architecture seed for the global crypto-native funding rail.',
    description:
      'This seeded campaign demonstrates the global USDC rail with smart-contract escrow assumptions, DeFi yield routing, and the same milestone governance engine shared with the India compliance rail.',
    category: 'Infrastructure',
    goalAmount: 50000,
    currency: 'USDC',
    fundingDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    financeProfile: {
      fundingRail: 'GLOBAL_CRYPTO',
      paymentProvider: 'Wallet / USDC',
      escrowModel: 'SMART_CONTRACT_ESCROW',
      yieldStrategy: 'DEFI_LENDING',
      tokenModel: 'REAL_USDC',
      defiProtocols: ['Aave', 'Morpho']
    },
    milestones: [
      {
        title: 'Protocol Audit',
        description: 'Complete the smart-contract review package and external audit handoff.',
        percentage: 50
      },
      {
        title: 'Mainnet Expansion',
        description: 'Ship production integrations and expand liquidity routing for global backers.',
        percentage: 50
      }
    ]
  });

  await app.services.campaignService.publishCampaign(founder, campaign.id);
  await app.services.campaignService.contribute(backerOne, campaign.id, {
    amount: 5000,
    assetType: 'USDC',
    paymentSource: 'WALLET'
  });
  await app.services.campaignService.contribute(backerTwo, campaign.id, {
    amount: 3500,
    assetType: 'FIAT',
    paymentSource: 'CARD'
  });

  console.log(JSON.stringify({
    seeded: true,
    databasePath: resolvedPath,
    admin,
    founder,
    backerOne,
    backerTwo,
    validatorOne,
    campaignId: campaign.id
  }, null, 2));
};

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app.close();
  });
