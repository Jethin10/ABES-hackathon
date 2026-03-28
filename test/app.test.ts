import { rmSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

describe('stellaris backend', () => {
  const databasePath = `./data/test-${Date.now()}.db`;
  const app = buildApp({ databasePath });

  let adminToken = '';
  let founderToken = '';
  let founderId = '';
  let backerToken = '';
  let validatorToken = '';
  let campaignId = '';
  let milestoneId = '';
  let milestoneTwoId = '';

  beforeAll(async () => {
    await app.ready();

    const adminRegistration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        fullName: 'Admin One',
        email: 'admin@example.com',
        password: 'secret-pass-0',
        role: 'ADMIN'
      }
    });

    adminToken = adminRegistration.json().data.token;

    const founderRegistration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        fullName: 'Founder One',
        email: 'founder@example.com',
        password: 'secret-pass-1',
        role: 'FOUNDER'
      }
    });

    const founderResponse = founderRegistration.json();
    founderToken = founderResponse.data.token;
    founderId = founderResponse.data.user.id;

    const backerRegistration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        fullName: 'Backer One',
        email: 'backer@example.com',
        password: 'secret-pass-2',
        role: 'BACKER'
      }
    });

    backerToken = backerRegistration.json().data.token;

    const validatorRegistration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        fullName: 'Validator One',
        email: 'validator@example.com',
        password: 'secret-pass-3',
        role: 'VALIDATOR'
      }
    });

    validatorToken = validatorRegistration.json().data.token;

    const verifyFounder = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${founderId}/verify`,
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        kycStatus: 'APPROVED',
        walletAddress: '0xfounderwallet',
        payoutAddress: 'founder-bank-001',
        notes: 'Founder cleared for launch.'
      }
    });

    expect(verifyFounder.statusCode).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    rmSync(databasePath, { force: true });
  });

  it('creates and publishes a campaign', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: {
        authorization: `Bearer ${founderToken}`
      },
      payload: {
        title: 'Stellaris Build',
        summary: 'A milestone-based campaign for a SaaS prototype.',
        description: 'This campaign funds a production-grade SaaS prototype with transparent milestone releases and backer governance.',
        category: 'SaaS',
        goalAmount: 10000,
        currency: 'inr',
        fundingDeadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        milestones: [
          {
            title: 'Prototype',
            description: 'Ship the working prototype and architecture docs.',
            percentage: 40
          },
          {
            title: 'Beta',
            description: 'Launch private beta for early adopters.',
            percentage: 60
          }
        ]
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const createdCampaign = createResponse.json().data.campaign;
    campaignId = createdCampaign.id;
    milestoneId = createdCampaign.milestones[0].id;
    milestoneTwoId = createdCampaign.milestones[1].id;
    expect(createdCampaign.founderId).toBe(founderId);
    expect(createdCampaign.status).toBe('DRAFT');

    const publishResponse = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/publish`,
      headers: {
        authorization: `Bearer ${founderToken}`
      }
    });

    expect(publishResponse.statusCode).toBe(200);
    expect(publishResponse.json().data.campaign.status).toBe('ACTIVE');
  });

  it('accepts contributions and submits proof', async () => {
    const contributionResponse = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/contributions`,
      headers: {
        authorization: `Bearer ${backerToken}`
      },
      payload: {
        amount: 5000,
        assetType: 'USDC',
        paymentSource: 'WALLET'
      }
    });

    expect(contributionResponse.statusCode).toBe(201);
    expect(contributionResponse.json().data.campaign.totalRaised).toBe(5000);

    const proofResponse = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/milestones/${milestoneId}/proof`,
      headers: {
        authorization: `Bearer ${founderToken}`
      },
      payload: {
        proofManifestCid: 'bafy-proof-manifest',
        proofNotes: 'Prototype shipped with repository, deployment URL, and documentation package.'
      }
    });

    expect(proofResponse.statusCode).toBe(200);
    expect(proofResponse.json().data.campaign.milestones[0].status).toBe('IN_REVIEW');
  });

  it('records votes and finalizes payout', async () => {
    const voteResponse = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/milestones/${milestoneId}/votes`,
      headers: {
        authorization: `Bearer ${backerToken}`
      },
      payload: {
        decision: 'APPROVE'
      }
    });

    expect(voteResponse.statusCode).toBe(201);
    expect(voteResponse.json().data.totalVotes).toBe(1);

    await app.db.run(`
      UPDATE milestones
      SET vote_closes_at = ?
      WHERE id = ?
    `, [new Date(Date.now() - 1000).toISOString(), milestoneId]);

    const finalizeResponse = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/milestones/${milestoneId}/finalize`,
      headers: {
        authorization: `Bearer ${founderToken}`
      }
    });

    expect(finalizeResponse.statusCode).toBe(200);
    expect(finalizeResponse.json().data.status).toBe('PAID');

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/campaigns'
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data.campaigns).toHaveLength(1);
  });

  it('escalates low-quorum milestones into validator arbitration', async () => {
    const proofResponse = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/milestones/${milestoneTwoId}/proof`,
      headers: {
        authorization: `Bearer ${founderToken}`
      },
      payload: {
        proofManifestCid: 'bafy-beta-manifest',
        proofNotes: 'Private beta shipped with release notes and usage metrics.'
      }
    });

    expect(proofResponse.statusCode).toBe(200);

    await app.db.run(`
      UPDATE milestones
      SET vote_closes_at = ?
      WHERE id = ?
    `, [new Date(Date.now() - 1000).toISOString(), milestoneTwoId]);

    const finalizeVote = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/milestones/${milestoneTwoId}/finalize`,
      headers: {
        authorization: `Bearer ${founderToken}`
      }
    });

    expect(finalizeVote.statusCode).toBe(200);
    expect(finalizeVote.json().data.status).toBe('ESCALATED');

    const arbitrationVote = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/milestones/${milestoneTwoId}/arbitration-votes`,
      headers: {
        authorization: `Bearer ${validatorToken}`
      },
      payload: {
        decision: 'APPROVE',
        rationale: 'The beta milestone clearly meets the documented deliverables.'
      }
    });

    expect(arbitrationVote.statusCode).toBe(201);

    const extraValidators = [
      { fullName: 'Validator Two', email: 'validator2@example.com', password: 'secret-pass-4' },
      { fullName: 'Validator Three', email: 'validator3@example.com', password: 'secret-pass-5' }
    ];

    for (const validator of extraValidators) {
      const registration = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          ...validator,
          role: 'VALIDATOR'
        }
      });

      const token = registration.json().data.token;
      const vote = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/milestones/${milestoneTwoId}/arbitration-votes`,
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          decision: 'APPROVE',
          rationale: 'Independent validator review confirms milestone completion.'
        }
      });

      expect(vote.statusCode).toBe(201);
    }

    const finalizeArbitration = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/milestones/${milestoneTwoId}/arbitration/finalize`,
      headers: {
        authorization: `Bearer ${founderToken}`
      }
    });

    expect(finalizeArbitration.statusCode).toBe(200);
    expect(finalizeArbitration.json().data.status).toBe('PAID');
  });
});
