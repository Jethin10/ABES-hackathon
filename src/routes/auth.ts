import type { FastifyInstance } from 'fastify';

import { facebookAuthSchema, googleAuthSchema, loginSchema, registerSchema, socialLoginSchema } from '../domain/schemas.js';

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
