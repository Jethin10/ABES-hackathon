import type { FastifyInstance } from 'fastify';

import { reviewUserSchema } from '../domain/schemas.js';

export const adminRoutes = async (app: FastifyInstance) => {
  app.get('/admin/treasury', {
    preHandler: [app.authenticate, app.requireRoles(['ADMIN'])],
    schema: {
      tags: ['admin'],
      summary: 'Get treasury overview'
    }
  }, async () => ({
    data: {
      treasury: await app.services.campaignService.getTreasuryOverview()
    }
  }));

  app.get('/admin/verifications', {
    preHandler: [app.authenticate, app.requireRoles(['ADMIN'])],
    schema: {
      tags: ['admin'],
      summary: 'List pending verification reviews'
    }
  }, async () => ({
    data: {
      verifications: await app.services.userService.listPendingVerifications()
    }
  }));

  app.post('/admin/users/:userId/verify', {
    preHandler: [app.authenticate, app.requireRoles(['ADMIN'])],
    schema: {
      tags: ['admin'],
      summary: 'Approve or reject user verification'
    }
  }, async (request) => {
    const { userId } = request.params as { userId: string };
    const payload = reviewUserSchema.parse(request.body);

    return {
      data: {
        verification: await app.services.userService.reviewVerification(request.currentUser, userId, payload)
      }
    };
  });

  app.post('/admin/campaigns/:campaignId/pause', {
    preHandler: [app.authenticate, app.requireRoles(['ADMIN'])],
    schema: {
      tags: ['admin'],
      summary: 'Pause an active campaign'
    }
  }, async (request) => {
    const { campaignId } = request.params as { campaignId: string };
    const payload = request.body as { reason?: string } | undefined;

    return {
      data: {
        campaign: await app.services.campaignService.pauseCampaign(
          request.currentUser,
          campaignId,
          payload?.reason?.trim() || 'Administrative review'
        )
      }
    };
  });

  app.post('/admin/campaigns/:campaignId/resume', {
    preHandler: [app.authenticate, app.requireRoles(['ADMIN'])],
    schema: {
      tags: ['admin'],
      summary: 'Resume a paused campaign'
    }
  }, async (request) => {
    const { campaignId } = request.params as { campaignId: string };

    return {
      data: {
        campaign: await app.services.campaignService.resumeCampaign(request.currentUser, campaignId)
      }
    };
  });

  app.post('/admin/escrow/sync', {
    preHandler: [app.authenticate, app.requireRoles(['ADMIN'])],
    schema: {
      tags: ['admin'],
      summary: 'Sync on-chain escrow events into the backend audit store'
    }
  }, async () => ({
    data: {
      sync: await app.services.escrowSyncService.sync()
    }
  }));
};
