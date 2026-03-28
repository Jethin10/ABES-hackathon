import type { FastifyInstance } from 'fastify';

import { demoLoginSchema, facebookAuthSchema, googleAuthSchema, loginSchema, registerSchema, socialLoginSchema } from '../domain/schemas.js';

export const authRoutes = async (app: FastifyInstance) => {
  app.post('/auth/register', {
    schema: {
      tags: ['auth'],
      summary: 'Register a user'
    }
  }, async (request, reply) => {
    const payload = registerSchema.parse(request.body);
    const user = await app.services.userService.register(payload);
    const token = await reply.jwtSign(user);

    reply.code(201);
    return {
      data: {
        user,
        token
      }
    };
  });

  app.post('/auth/login', {
    schema: {
      tags: ['auth'],
      summary: 'Login and receive a JWT'
    }
  }, async (request, reply) => {
    const payload = loginSchema.parse(request.body);
    const user = await app.services.userService.login(payload.email, payload.password);
    const token = await reply.jwtSign(user);

    return {
      data: {
        user,
        token
      }
    };
  });

  app.post('/auth/social', {
    schema: {
      tags: ['auth'],
      summary: 'Login or register with a social provider'
    }
  }, async (request, reply) => {
    const payload = socialLoginSchema.parse(request.body);
    const user = await app.services.userService.socialLogin(payload);
    const token = await reply.jwtSign(user);

    return {
      data: {
        user,
        token
      }
    };
  });

  app.post('/auth/google', {
    schema: {
      tags: ['auth'],
      summary: 'Login or register with Google'
    }
  }, async (request, reply) => {
    const payload = googleAuthSchema.parse(request.body);
    const verifiedProfile = await app.services.integrationService.authenticateGoogle(payload);
    const user = await app.services.userService.socialLogin(verifiedProfile);
    const token = await reply.jwtSign(user);

    return {
      data: {
        user,
        token
      }
    };
  });

  app.post('/auth/facebook', {
    schema: {
      tags: ['auth'],
      summary: 'Login or register with Facebook'
    }
  }, async (request, reply) => {
    const payload = facebookAuthSchema.parse(request.body);
    const verifiedProfile = await app.services.integrationService.authenticateFacebook(payload);
    const user = await app.services.userService.socialLogin(verifiedProfile);
    const token = await reply.jwtSign(user);

    return {
      data: {
        user,
        token
      }
    };
  });

  app.post('/auth/demo-login', {
    schema: {
      tags: ['auth'],
      summary: 'Create or login with a judge demo account'
    }
  }, async (request, reply) => {
    const payload = demoLoginSchema.parse(request.body);

    const ensureUser = async (input: {
      fullName: string;
      email: string;
      password: string;
      role: 'ADMIN' | 'FOUNDER' | 'BACKER' | 'VALIDATOR';
    }) => {
      const existing = await app.db.get<{ id: string }>(`
        SELECT id
        FROM users
        WHERE email = ?
      `, [input.email.toLowerCase()]);

      if (existing?.id) {
        return app.services.userService.getPublicUserById(existing.id);
      }

      return app.services.userService.register(input);
    };

    const admin = await ensureUser({
      fullName: 'Admin Demo',
      email: 'admin@stellaris.dev',
      password: 'secret-pass-admin',
      role: 'ADMIN'
    });

    const founder = await ensureUser({
      fullName: 'Founder Demo',
      email: 'founder@stellaris.dev',
      password: 'secret-pass-founder',
      role: 'FOUNDER'
    });

    const investor = await ensureUser({
      fullName: 'Backer Demo One',
      email: 'backer1@stellaris.dev',
      password: 'secret-pass-backer1',
      role: 'BACKER'
    });

    const founderVerification = await app.services.userService.getUserVerification(founder.id);
    if (founderVerification.kycStatus !== 'APPROVED') {
      await app.services.userService.reviewVerification(admin, founder.id, {
        kycStatus: 'APPROVED',
        walletAddress: '0xfounderwalletdemo',
        payoutAddress: 'founder-bank-demo',
        notes: 'Demo founder approved for launch.'
      });
    }

    const existingCampaign = await app.db.get<{ id: string; status: string }>(`
      SELECT id, status
      FROM campaigns
      WHERE founder_id = ? AND title = ?
    `, [founder.id, 'Stellaris Demo Campaign']);

    let campaignId = existingCampaign?.id;
    let campaignStatus = existingCampaign?.status;

    if (!campaignId) {
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
      campaignId = campaign.id;
      campaignStatus = campaign.status;
    }

    if (campaignId && campaignStatus === 'DRAFT') {
      const published = await app.services.campaignService.publishCampaign(founder, campaignId);
      campaignStatus = published.status;
    }

    if (campaignId) {
      const contributionCount = await app.db.get<{ count: number }>(`
        SELECT COUNT(*) as count
        FROM contributions
        WHERE campaign_id = ? AND backer_id = ?
      `, [campaignId, investor.id]);

      if ((contributionCount?.count ?? 0) === 0) {
        await app.services.campaignService.contribute(investor, campaignId, {
          amount: 5000,
          assetType: 'FIAT',
          paymentSource: 'CARD'
        });
      }
    }

    const user = payload.mode === 'FOUNDER' ? founder : investor;
    const token = await reply.jwtSign(user);

    return {
      data: {
        user,
        token
      }
    };
  });

  app.get('/auth/me', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['auth'],
      summary: 'Get current user'
    }
  }, async (request) => ({
    data: {
      user: request.currentUser,
      verification: await app.services.userService.getUserVerification(request.currentUser.id)
    }
  }));
};
