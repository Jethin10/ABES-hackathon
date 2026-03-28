import { AppError } from '../core/errors.js';

export class IntegrationService {
  constructor(
    private readonly config: {
      indiaFiatProvider: string;
      indiaEscrowBankName: string;
      indiaEscrowBankAccount: string;
      indiaEscrowBankIfsc: string;
      razorpayKeyId: string;
      razorpayKeySecret: string;
      phonepeMerchantId: string;
      phonepeSaltKey: string;
      phonepeSaltIndex: string;
      aavePoolAddress: string;
      morphoMarketId: string;
      usdcTokenAddress: string;
      googleClientId: string;
      googleClientSecret: string;
      appleClientId: string;
      appleTeamId: string;
      appleKeyId: string;
      applePrivateKey: string;
      facebookAppId: string;
      facebookAppSecret: string;
    }
  ) {}

  describeArchitecture() {
    return {
      name: 'Hybrid Crowdfunding Protocol',
      rails: {
        INDIA_FIAT: {
          funding: ['Razorpay', 'UPI', 'PhonePe'],
          escrow: 'regulated escrow bank account',
          tokenization: 'internal non-transferable ledger tokens',
          yield: ['treasury-backed instruments', 'liquid mutual funds', 'sweep fixed deposits', 'overnight debt funds'],
          payout: 'instant founder release from liquidity buffer with post-release rebalancing'
        },
        GLOBAL_CRYPTO: {
          funding: ['wallet', 'USDC'],
          escrow: 'smart contract escrow',
          tokenization: 'real USDC on-chain balances',
          yield: ['Aave', 'Morpho'],
          payout: 'instant on-chain milestone release'
        }
      },
      commonLayer: {
        governance: ['quadratic voting', 'whale cap', 'quorum threshold', 'validator arbitration'],
        campaign: ['milestones', 'proof submission', 'release orchestration'],
        revenue: ['yield spread', 'DeFi yield', 'SaaS analytics']
      }
    };
  }

  listIntegrations() {
    return {
      india: {
        fiatProvider: {
          name: this.config.indiaFiatProvider,
          enabled: Boolean(this.config.razorpayKeyId || this.config.phonepeMerchantId)
        },
        escrowBank: {
          name: this.config.indiaEscrowBankName,
          account: this.config.indiaEscrowBankAccount,
          ifsc: this.config.indiaEscrowBankIfsc
        },
        yieldVenues: ['treasury-backed instruments', 'liquid mutual funds', 'sweep fixed deposits', 'overnight debt funds']
      },
      global: {
        stablecoin: this.config.usdcTokenAddress || 'USDC',
        defiYield: [
          { name: 'Aave', address: this.config.aavePoolAddress, enabled: Boolean(this.config.aavePoolAddress) },
          { name: 'Morpho', marketId: this.config.morphoMarketId, enabled: Boolean(this.config.morphoMarketId) }
        ]
      },
      auth: {
        email: true,
        google: Boolean(this.config.googleClientId),
        apple: Boolean(this.config.appleClientId),
        facebook: Boolean(this.config.facebookAppId)
      }
    };
  }

  listCredentialTemplates() {
    return {
      INDIA_FIAT_PROVIDER: this.config.indiaFiatProvider,
      RAZORPAY_KEY_ID: this.mask(this.config.razorpayKeyId),
      RAZORPAY_KEY_SECRET: this.mask(this.config.razorpayKeySecret),
      PHONEPE_MERCHANT_ID: this.mask(this.config.phonepeMerchantId),
      PHONEPE_SALT_KEY: this.mask(this.config.phonepeSaltKey),
      PHONEPE_SALT_INDEX: this.mask(this.config.phonepeSaltIndex),
      INDIA_ESCROW_BANK_NAME: this.config.indiaEscrowBankName,
      INDIA_ESCROW_BANK_ACCOUNT: this.mask(this.config.indiaEscrowBankAccount),
      INDIA_ESCROW_BANK_IFSC: this.mask(this.config.indiaEscrowBankIfsc),
      AAVE_POOL_ADDRESS: this.mask(this.config.aavePoolAddress),
      MORPHO_MARKET_ID: this.mask(this.config.morphoMarketId),
      USDC_TOKEN_ADDRESS: this.mask(this.config.usdcTokenAddress),
      GOOGLE_CLIENT_ID: this.mask(this.config.googleClientId),
      GOOGLE_CLIENT_SECRET: this.mask(this.config.googleClientSecret),
      APPLE_CLIENT_ID: this.mask(this.config.appleClientId),
      APPLE_TEAM_ID: this.mask(this.config.appleTeamId),
      APPLE_KEY_ID: this.mask(this.config.appleKeyId),
      APPLE_PRIVATE_KEY: this.mask(this.config.applePrivateKey),
      FACEBOOK_APP_ID: this.mask(this.config.facebookAppId),
      FACEBOOK_APP_SECRET: this.mask(this.config.facebookAppSecret)
    };
  }

  async authenticateGoogle(input: {
    accessToken: string;
    role: 'ADMIN' | 'FOUNDER' | 'BACKER' | 'VALIDATOR';
  }): Promise<{
    provider: 'GOOGLE';
    providerUserId: string;
    email: string;
    fullName: string;
    role: 'ADMIN' | 'FOUNDER' | 'BACKER' | 'VALIDATOR';
  }> {
    if (!this.config.googleClientId) {
      throw new AppError('Google login is not configured on the backend.', 503, 'PROVIDER_NOT_CONFIGURED');
    }

    const tokenInfoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(input.accessToken)}`);
    if (!tokenInfoResponse.ok) {
      throw new AppError('Google access token verification failed.', 401, 'PROVIDER_TOKEN_INVALID');
    }

    const tokenInfo = await tokenInfoResponse.json() as {
      aud?: string;
      email?: string;
      scope?: string;
      expires_in?: string;
    };

    if (tokenInfo.aud !== this.config.googleClientId) {
      throw new AppError('Google token audience mismatch.', 401, 'PROVIDER_TOKEN_INVALID');
    }

    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${input.accessToken}`
      }
    });

    if (!profileResponse.ok) {
      throw new AppError('Unable to read Google user profile.', 401, 'PROVIDER_PROFILE_UNAVAILABLE');
    }

    const profile = await profileResponse.json() as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      given_name?: string;
    };

    if (!profile.email || !profile.sub) {
      throw new AppError('Google profile is missing required identity fields.', 400, 'PROVIDER_PROFILE_INVALID');
    }

    if (profile.email_verified === false) {
      throw new AppError('Google account email is not verified.', 401, 'PROVIDER_EMAIL_NOT_VERIFIED');
    }

    const googleEmail: string = profile.email;
    const googleUserId: string = profile.sub;

    return {
      provider: 'GOOGLE' as const,
      providerUserId: googleUserId,
      email: googleEmail,
      fullName: profile.name?.trim() || profile.given_name?.trim() || googleEmail.split('@')[0] || googleEmail,
      role: input.role
    };
  }

  async authenticateFacebook(input: {
    accessToken: string;
    role: 'ADMIN' | 'FOUNDER' | 'BACKER' | 'VALIDATOR';
  }): Promise<{
    provider: 'FACEBOOK';
    providerUserId: string;
    email: string;
    fullName: string;
    role: 'ADMIN' | 'FOUNDER' | 'BACKER' | 'VALIDATOR';
  }> {
    if (!this.config.facebookAppId) {
      throw new AppError('Facebook login is not configured on the backend.', 503, 'PROVIDER_NOT_CONFIGURED');
    }

    const response = await fetch(`https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(input.accessToken)}`);
    if (!response.ok) {
      throw new AppError('Facebook access token verification failed.', 401, 'PROVIDER_TOKEN_INVALID');
    }

    const profile = await response.json() as {
      id?: string;
      name?: string;
      email?: string;
      error?: {
        message?: string;
      };
    };

    if (profile.error?.message) {
      throw new AppError(profile.error.message, 401, 'PROVIDER_TOKEN_INVALID');
    }

    if (!profile.id || !profile.email) {
      throw new AppError('Facebook profile is missing required identity fields. Ensure email permission is granted.', 400, 'PROVIDER_PROFILE_INVALID');
    }

    const facebookEmail: string = profile.email;
    const facebookUserId: string = profile.id;

    return {
      provider: 'FACEBOOK' as const,
      providerUserId: facebookUserId,
      email: facebookEmail,
      fullName: profile.name?.trim() || facebookEmail.split('@')[0] || facebookEmail,
      role: input.role
    };
  }

  async createCheckoutSession(input: {
    campaignId: string;
    campaignTitle: string;
    amount: number;
    currency: string;
    fundingRail: 'INDIA_FIAT' | 'GLOBAL_CRYPTO';
    user: {
      fullName: string;
      email: string;
    };
    detectedRegion: 'INDIA' | 'GLOBAL';
  }) {
    if (input.fundingRail === 'INDIA_FIAT') {
      return this.createRazorpayCheckout({
        ...input,
        fundingRail: 'INDIA_FIAT'
      });
    }

    return {
      provider: 'WALLET',
      mode: 'wallet',
      fundingRail: 'GLOBAL_CRYPTO',
      detectedRegion: input.detectedRegion,
      wallet: {
        asset: 'USDC',
        suggestedProtocols: ['Aave', 'Morpho'],
        chain: 'EVM'
      }
    };
  }

  private async createRazorpayCheckout(input: {
    campaignId: string;
    campaignTitle: string;
    amount: number;
    currency: string;
    fundingRail: 'INDIA_FIAT';
    user: {
      fullName: string;
      email: string;
    };
    detectedRegion: 'INDIA' | 'GLOBAL';
  }) {
    const amountInPaise = Math.round(input.amount * 100);
    const receipt = `cmp_${input.campaignId.slice(0, 8)}_${Date.now()}`;

    if (!this.config.razorpayKeyId || !this.config.razorpayKeySecret) {
      return {
        provider: 'RAZORPAY',
        mode: 'mock',
        fundingRail: 'INDIA_FIAT',
        detectedRegion: input.detectedRegion,
        razorpay: {
          keyId: 'rzp_test_mock',
          orderId: `order_mock_${Date.now()}`,
          amount: amountInPaise,
          currency: 'INR',
          name: 'Stellaris',
          description: input.campaignTitle,
          prefill: {
            name: input.user.fullName,
            email: input.user.email
          }
        },
        message: 'Razorpay credentials are not configured, so the app is using local mock checkout mode.'
      };
    }

    const authorization = Buffer.from(`${this.config.razorpayKeyId}:${this.config.razorpayKeySecret}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        payment_capture: 1,
        notes: {
          campaignId: input.campaignId,
          fundingRail: input.fundingRail
        }
      })
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Unable to create Razorpay order. ${details}`);
    }

    const order = await response.json() as {
      id: string;
      amount: number;
      currency: string;
    };

    return {
      provider: 'RAZORPAY',
      mode: 'live',
      fundingRail: 'INDIA_FIAT',
      detectedRegion: input.detectedRegion,
      razorpay: {
        keyId: this.config.razorpayKeyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        name: 'Stellaris',
        description: input.campaignTitle,
        prefill: {
          name: input.user.fullName,
          email: input.user.email
        }
      }
    };
  }

  private mask(value: string) {
    if (!value) {
      return '';
    }

    if (value.length <= 6) {
      return '***';
    }

    return `${value.slice(0, 3)}***${value.slice(-3)}`;
  }
}
