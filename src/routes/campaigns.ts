import type { FastifyInstance } from 'fastify';

import {
  arbitrationVoteSchema,
  contributeSchema,
  createCampaignSchema,
  submitProofSchema,
  voteSchema
} from '../domain/schemas.js';

export const campaignRoutes = async (app: FastifyInstance) => {
  app.get('/campaigns', {
    schema: {
      tags: ['campaigns'],
      summary: 'List campaigns'
    }
  }, async () => ({
    data: {
      campaigns: await app.services.campaignService.listCampaigns()
    }
  }));

  app.get('/campaigns/:campaignId', {
    schema: {
      tags: ['campaigns'],
      summary: 'Get campaign details'
    }
  }, async (request) => {
    const { campaignId } = request.params as { campaignId: string };

    return {
      data: {
        campaign: await app.services.campaignService.getCampaignById(campaignId)
      }
    };
  });

  app.post('/campaigns', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['campaigns'],
      summary: 'Create a campaign'
    }
  }, async (request, reply) => {
    const payload = createCampaignSchema.parse(request.body);
    const campaign = await app.services.campaignService.createCampaign(request.currentUser, payload);

    reply.code(201);
    return {
      data: {
        campaign
      }
    };
  });

  app.post('/campaigns/:campaignId/publish', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['campaigns'],
      summary: 'Publish a draft campaign'
    }
  }, async (request) => {
    const { campaignId } = request.params as { campaignId: string };

    return {
      data: {
        campaign: await app.services.campaignService.publishCampaign(request.currentUser, campaignId)
      }
    };
  });

  app.post('/campaigns/:campaignId/contributions', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['campaigns'],
      summary: 'Contribute to a campaign'
    }
  }, async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const payload = contributeSchema.parse(request.body);
    const result = await app.services.campaignService.contribute(request.currentUser, campaignId, payload);

    reply.code(201);
    return {
      data: result
    };
  });

  app.post('/campaigns/:campaignId/checkout-session', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['campaigns'],
      summary: 'Create a payment checkout session for a campaign contribution'
    }
  }, async (request) => {
    const { campaignId } = request.params as { campaignId: string };
    const payload = request.body as { amount: number; detectedRegion?: 'INDIA' | 'GLOBAL' };
    const campaign = await app.services.campaignService.getCampaignById(campaignId) as {
      id: string;
      title: string;
      currency: string;
      financeProfile?: {
        fundingRail: 'INDIA_FIAT' | 'GLOBAL_CRYPTO';
      };
    };

    return {
      data: {
        checkout: await app.services.integrationService.createCheckoutSession({
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          amount: payload.amount,
          currency: campaign.currency,
          fundingRail: campaign.financeProfile?.fundingRail ?? (campaign.currency === 'INR' ? 'INDIA_FIAT' : 'GLOBAL_CRYPTO'),
          user: {
            fullName: request.currentUser.fullName,
            email: request.currentUser.email
          },
          detectedRegion: payload.detectedRegion ?? 'GLOBAL'
        })
      }
    };
  });

  app.post('/campaigns/:campaignId/milestones/:milestoneId/proof', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['milestones'],
      summary: 'Submit milestone proof'
    }
  }, async (request) => {
    const { campaignId, milestoneId } = request.params as { campaignId: string; milestoneId: string };
    const payload = submitProofSchema.parse(request.body);

    return {
      data: {
        campaign: await app.services.campaignService.submitMilestoneProof(
          request.currentUser,
          campaignId,
          milestoneId,
          payload
        )
      }
    };
  });

  app.post('/campaigns/:campaignId/milestones/:milestoneId/votes', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['milestones'],
      summary: 'Vote on a milestone'
    }
  }, async (request, reply) => {
    const { campaignId, milestoneId } = request.params as { campaignId: string; milestoneId: string };
    const payload = voteSchema.parse(request.body);
    const result = await app.services.campaignService.castVote(
      request.currentUser,
      campaignId,
      milestoneId,
      payload.decision
    );

    reply.code(201);
    return {
      data: result
    };
  });

  app.post('/campaigns/:campaignId/milestones/:milestoneId/finalize', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['milestones'],
      summary: 'Finalize milestone voting and settle payout'
    }
  }, async (request) => {
    const { campaignId, milestoneId } = request.params as { campaignId: string; milestoneId: string };

    return {
      data: await app.services.campaignService.finalizeMilestoneVote(
        request.currentUser,
        campaignId,
        milestoneId
      )
    };
  });

  app.post('/campaigns/:campaignId/milestones/:milestoneId/arbitration-votes', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['milestones'],
      summary: 'Cast validator arbitration vote'
    }
  }, async (request, reply) => {
    const { campaignId, milestoneId } = request.params as { campaignId: string; milestoneId: string };
    const payload = arbitrationVoteSchema.parse(request.body);

    reply.code(201);
    return {
      data: await app.services.campaignService.castArbitrationVote(
        request.currentUser,
        campaignId,
        milestoneId,
        payload
      )
    };
  });

  app.post('/campaigns/:campaignId/milestones/:milestoneId/arbitration/finalize', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['milestones'],
      summary: 'Finalize validator arbitration'
    }
  }, async (request) => {
    const { campaignId, milestoneId } = request.params as { campaignId: string; milestoneId: string };

    return {
      data: await app.services.campaignService.finalizeArbitration(
        request.currentUser,
        campaignId,
        milestoneId
      )
    };
  });
};
