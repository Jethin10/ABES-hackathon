# Stellaris Hybrid Crowdfunding Protocol

Stellaris now models a hybrid crowdfunding architecture with two funding rails:

- `INDIA_FIAT`: compliant Web2 funding through regulated banking and payment providers
- `GLOBAL_CRYPTO`: crypto-native funding through wallet + smart-contract escrow

Both rails share the same milestone, voting, arbitration, and campaign logic.

## Architecture

### India rail

- Backers pay through `Razorpay / UPI / PhonePe`
- Funds are represented as internal, non-transferable ledger tokens
- Capital is split into:
  - `70%` yield deployment
  - `30%` liquidity buffer
- Yield sources are modeled as treasury-backed / liquid debt instruments
- Founder payouts are served instantly from the liquidity buffer, then rebalanced

### Global rail

- Backers fund campaigns with `USDC`
- Escrow is handled through a smart-contract path
- Yield deployment is modeled through `Aave / Morpho`
- Milestone releases happen through the same governance engine but on a crypto-native rail

### Common layer

- milestone engine
- founder proof submission
- quadratic voting
- whale cap / quorum enforcement
- validator arbitration
- yield-funded zero-fee economics

## What Changed In Code

- added campaign finance profiles for per-campaign rail/yield metadata
- added rail-specific treasury pools instead of one generic pooled balance
- added public architecture + integration endpoints
- added credential placeholders for India payment rails, escrow banking, DeFi venues, and OAuth providers

## Key Endpoints

- `GET /api/system/architecture`
- `GET /api/system/integrations`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/social`
- `GET /api/auth/me`
- `GET /api/campaigns`
- `GET /api/campaigns/:campaignId`
- `POST /api/campaigns`
- `POST /api/campaigns/:campaignId/publish`
- `POST /api/campaigns/:campaignId/contributions`
- `POST /api/campaigns/:campaignId/milestones/:milestoneId/proof`
- `POST /api/campaigns/:campaignId/milestones/:milestoneId/votes`
- `POST /api/campaigns/:campaignId/milestones/:milestoneId/finalize`
- `POST /api/campaigns/:campaignId/milestones/:milestoneId/arbitration-votes`
- `POST /api/campaigns/:campaignId/milestones/:milestoneId/arbitration/finalize`
- `GET /api/admin/treasury`

## Environment

```env
DATABASE_ENGINE=sqlite
PORT=4000
HOST=0.0.0.0
JWT_SECRET=change-me-now
DATABASE_PATH=./data/stellaris.db
DATABASE_URL=
CORS_ORIGIN=*

LIQUIDITY_BUFFER_RATIO=0.3
PROTOCOL_RESERVE_RATIO=0.1
INDIA_LIQUIDITY_BUFFER_RATIO=0.3
INDIA_YIELD_DEPLOYMENT_RATIO=0.7
GLOBAL_LIQUIDITY_BUFFER_RATIO=0.3
GLOBAL_YIELD_DEPLOYMENT_RATIO=0.7

INDIA_FIAT_PROVIDER=Razorpay
INDIA_ESCROW_BANK_NAME=Escrow Banking Partner
INDIA_ESCROW_BANK_ACCOUNT=
INDIA_ESCROW_BANK_IFSC=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
PHONEPE_MERCHANT_ID=
PHONEPE_SALT_KEY=
PHONEPE_SALT_INDEX=

AAVE_POOL_ADDRESS=
MORPHO_MARKET_ID=
USDC_TOKEN_ADDRESS=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=

ESCROW_MODE=MOCK
ESCROW_RPC_URL=
ESCROW_CONTRACT_ADDRESS=
ESCROW_ADMIN_PRIVATE_KEY=
ESCROW_SYNC_START_BLOCK=0
ESCROW_CHAIN_ID=11155111

VOTING_WINDOW_HOURS=72
MILESTONE_APPROVAL_THRESHOLD=0.6
MILESTONE_QUORUM_THRESHOLD=0.3
ARBITRATION_MIN_VOTES=3
```

## Local Run

```bash
npm install
Copy-Item .env.example .env
npm run seed -- --reset
npm run dev
```

## Verification

```bash
npm run check
npm run build
npm test
```

## Render Deploy

This repo now includes a root [render.yaml](C:\ABES stellaris\render.yaml) Blueprint that creates:

- a Render Postgres database
- a Node backend web service
- a static frontend service for `Frontend/original from gemini`

### One-time setup

1. Push the latest repo changes to GitHub.
2. In Render, choose `New` -> `Blueprint`.
3. Select this repository.
4. Confirm the generated resources from [render.yaml](C:\ABES stellaris\render.yaml).
5. Fill in any prompted secret values you actually want enabled:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `FACEBOOK_APP_ID`
   - `FACEBOOK_APP_SECRET`
   - `APPLE_CLIENT_ID`
   - `APPLE_TEAM_ID`
   - `APPLE_KEY_ID`
   - `APPLE_PRIVATE_KEY`
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_FACEBOOK_APP_ID`

### After the first backend deploy

Open a shell for the backend service and run:

```bash
npm run seed
```

The seed script is idempotent, so running it again will not duplicate demo users or campaigns.

### Default Render URLs

The Blueprint is preconfigured to use these service URLs:

- Backend: `https://jethin10-abes-hackathon-api.onrender.com`
- Frontend: `https://jethin10-abes-hackathon-web.onrender.com`

If Render assigns different hostnames because those names are already taken, update:

- backend `CORS_ORIGIN`
- frontend `VITE_API_BASE_URL`
