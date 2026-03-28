# What is Crowdfunding?

It is the process of raising capital for projects or startups by collecting funding from people which we will be referring them as to backers.

There are different types of crowdfunding:

1. **Debt based crowdfunding**
    It is as the name suggests basically if you are a founder you take loan from investors instead of banks because it is a pain to deal with banks and they don’t really approve the money often and fast. In this case the owner retains their company and they have full ownership; they just have to repay the loan with interest over a fixed time or term.
    
2. **Equity Based crowdfunding**
    So here if someone funds your company instead of paying them with money and interest you give them some ownership or equity of your company or product.

3. **Reward Based crowdfunding**
    Here you offer them rewards like early access, premium features etc etc instead of paying them or giving them ownership or shares.
    
4. **Donation Based crowdfunding**
    The founder relies on the generosity of the backers and does not really give anything in return basically only works in ngo and non profit org stuff.

5. **Profit / Revenue sharing crowdfunding**
    We share this much amount of profits to the backers but they are only gonna get paid if the project is successful.

## How do these crowdfunding platforms even work? Let’s go in detail

This is a high level view of what is happening:

```text
BACKER ────  money  ────►  PLATFORM  ──── money (minus fee) ────► CREATOR
    ▲                                                                ▲
holds it                                      decides when to release it
```

Understand that crowdfunding is fundamentally a **3-party escrow problem but we need to convert it into a defi lending protocol**.

Let’s say you are a founder and you need investors or backers. The problem here is the founder can’t just directly take the funds from the backers without a contract or something in return and as a backer you need some kind of insurance that it is not a scam so there is a third person which acts as an intermediate between the 2 that’s what all the crowd funding platforms mostly are.

Most people think platforms just "collect money and send it." The reality is vastly more complex. The platform doesn't process payments itself. It plugs into a **Payment Service Provider (PSP)** like Stripe, Razorpay, or PayU.

Here is what actually happens when you click back this project and donate, let’s say 5k rupees / dollars:

```text
Step 1: Your browser sends card details to Stripe (NOT to the platform)
                                                    ↓
Step 2: Stripe sends it to your Card Network (Visa/Mastercard)
                                                    ↓
Step 3: Card Network contacts your Issuing Bank ("Does this person have $50?")
                                                    ↓
Step 4: Bank says Yes/No → Authorization code sent back
                                                    ↓
Step 5: Money moves from your bank → Stripe's escrow account
                                                    ↓
Step 6: Stripe settles to Platform's bank account (T+1 or T+2 days)
                                                    ↓
Step 7: Platform holds it in their own bank account
                                                    ↓
Step 8: Platform eventually sends to Creator (minus fees)
```

Note: At step 7 the platform is holding YOUR money in THEIR bank account. This is called **commingling of funds** and it's a massive regulatory issue and they need a lot of licenses to do this.

Also let’s say you donated 100 dollars, let’s talk in dollars all right and they said platform fees was 5% how much do you expect to get? 

95?
WRONG. You will get like 90 look at this:

```text
Donor gives: $100
    │
    ▼
Stripe fee:   -$3.20  (2.9% + $0.30 — this is non-negotiable, Stripe always charges)
Platform fee: -$5.00  (GoFundMe/ any platform cut)
    │
    ▼
Creator/Founder gets: $91.80
```

Even "zero fee" platforms still charge the Stripe processing fee. They just hide it.

Platforms operate in one of two modes:

**Mode A - Payment Aggregator (what most do):**
- All donor money goes into ONE platform bank account
- Platform is responsible for KYC of creators
- If a creator scams, platform is legally liable
- Requires RBI license in India

And the mode 2 is way more complex but it also exists so here you go:

**Mode B - Payment Facilitator (more complex):**
- Each creator gets a virtual sub-account
- Money goes directly to creators sub-account
- Platform just facilitates less liability
- Much harder to build requires more licenses

Also one more thing to consider we can’t just immediately send the money to the founder as soon as we get it from the backer because according to the prevention of money laundering act there's a mandatory verification process that takes 24 to 72 hours minimum. Platforms that skip this face criminal liability so this is pretty important to keep in mind.

## Really Important things to keep in mind

Also imagine this: someone lost their debit or credit card and someone else uses it to fund a project on our platform. The thing is we get the money and if we give that money to the creator if he finishes the product and then the real owner does a chargeback report... the time of when the transaction can be reverted is 120 days so if the founder completes the project in less than 120 days and we give them all the money and after that the banks demand us to give the money back for filing the report we don’t have that money and we lose money (we have to pay from our own).

This means platforms hold creator payouts for 30–60 days as a buffer. This is why Kickstarter doesn't release funds until the campaign ends - they're waiting to see if chargebacks come in. These are most of the challenges and constraints we face as a platform.

Now let’s move on to the founder’s perspective and constraints.

There is like 2 models that the platform could follow to release the money.

The first one is **ALL or nothing**. As the name suggests you either get everything or nothing.
Note: In all or nothing model the money never actually leaves the backer’s bank account until the goal which was set is hit. This is why Kickstarter can promise full refunds on failed campaigns - there's nothing to refund because nothing was taken yet get it.

### Why this model even exist from an economic stand point

```text
Minimum viable order from factory: 1,000 units at $10/unit = $10,000

If you raise only $7,000:
You can't order 700 units - factory has a minimum order quantity
You can't manufacture anything
The $7,000 is completely useless to you

If you take the $7,000 anyway:
You have donors' money
You cannot deliver the product
You are now legally and morally in debt to 700 people
This is how scams happen unintentionally
```

Let’s just assume we are in the founders head this is probably what he thinks:
```text
Real cost to build your product: $50,000

Option A - Set honest goal of $50,000:
Risk: Campaign might fail, you get nothing
Platform algorithm shows you less (low momentum campaigns get buried)
Backers see a big number and feel less confident
Psychological barrier is higher

Option B - Set low goal of $10,000:
You hit it on Day 1 (looks like momentum)
Algorithm pushes you to front page
Social proof kicks in ("already funded!")
You end up raising $80,000

But now you have $80,000 for a $50,000 project
The extra $30,000 is yours with zero accountability
You never promised anything for that extra money
```

And the other model is called **keep what you raise** model. Examples of this are (GoFundMe, Ketto).
```text
Creator sets a goal: $10,000
Campaign runs indefinitely or with deadline

Every donation is charged IMMEDIATELY when made
Money goes to platform right away
Creator can withdraw at any time (after verification holds)

Day 1: $500 raised → Creator can request withdrawal of $500 now
Day 15: $3,200 raised → Creator withdraws again
Day 30: $7,000 total → Campaign "ends" or continues

Creator has $7,000 regardless of whether goal was hit
Goal was just a target, not a trigger
```

This is the model we are told to do in the problem statement with some caveats of course.

Also one more thing to add is the algorithm of these platforms pushes quantity over quality and velocity over real speed so we need to cover for that as well.
This is the actual root of the problem why like founders lie about their campaigns and progress because they don’t want to get buried if they say the real progress.

This is the reality of the model 2 we are trying to build from a founder’s standpoint:
```text
Campaign raises $50,000 total across 60 days
Creator requests partial payout at Day 30: $20,000
                  ↓
Platform calculates:
Chargeback reserve: 10% of $20,000 = $2,000 held back
Platform fee: 5% = $1,000
Processing fee: 2.9% = $580
                  ↓
Creator actually receives: $16,420 of the $20,000 requested
And the $2,000 reserve might not be released for another 90 days
```
There are so many layers to this problem i love it.

## Tax cut nonsense

Crowdfunding income classification depends on campaign TYPE and it is a massive pain to deal with:

- **Reward-based**: Treated as BUSINESS INCOME
    - Taxable under "Profits and Gains of Business"
    - You must register for GST if > ₹20L/year
    - Rewards given = tax deductible expense
    - But you must prove you gave the rewards
- **Donation-based (for NGOs)**: TAX EXEMPT under 80G
    - But you need to be a registered NGO
    - Individual fundraisers don't qualify
    - "I'm raising for my sick mother" = fully taxable
- **Equity-based**: SEBI regulations apply
    - Must be SEBI registered
    - Cannot raise from more than 200 investors
    - Each investor must be "accredited"

But we don’t really need to solve all the problems but it would be great to have a real world solution and not just a project for the sake of a project and we need to win this hackathon so keep that in mind guys.

Also one more thing let’s say you are in India and you want to back a startup in US your donation amount in that 10-12% is lost between conversions and transactions, maybe we could solve it by using web3 we will see this is just i am laying out all the problems and a clear view of everything so we can start to build the solution which solves everything.

## What are the core requirements (must haves) according to the ps

1. First is to build a smart contract escrow basically the founders have to declare the milestones beforehand and the money will be received partially and it is also received when the majority ie more than 50% of the backers should agree that they are satisfied then the money is released.
2. Second is our platform should take zero fees from the pool donated so what is our business model and how do we run our company and platform.
3. And we should have instant liquidity it shouldn’t take the founders any time to liquify the amount to their banks.

## Now for the initial solution

OK the first requirement is fairly simple just do a milestone based funding system where the funds gets released whenever the certain predetermined milestones are hit and the majority is happy with the product.

Now for the second requirement this is where it gets a bit tricky because we need to find a way to like earn money without cutting it from the donation pool so i do have an initial idea:

### Non polished solution explanation:
- Like the second requirement asks how can we earn money if there is no platform fees and we don't take any money from the backer's pool.
- So the solution i found is a Defi protocol what it basically does is we lend that money and stack interest from the borrowers.
- Ok what makes this protocol like Aave for example safe is that we are given a token currency like aUSDC as a receipt and the value automatically grows to the interest.
- And in Aave for borrower to borrow like 100k you first need a collateral of 150k or something ok in case of the borrower doesn't pay us the interest or money back Aave just automatically liquifies the collateral.
- But the problem here is let's say the collateral is bitcoin and it unexpectedly dropped below your principle value before Aave can automatically act which is rare but can happen we are in a bit of trouble then.
- And the more important problem i thought about is let's say the campaign is only for 3 days and he reaches his milestone then the interest you are gonna earn for 3 days is nothing.
- If you guys don't understand anything or need clarification hit me up.
- Ok I think I found the solution for this I was reading about the system architecture of Aave a bit more deeply and I think this problem is solved that leaves only the second problem I mentioned.
- What if consider every active campaign as the unit so that the yield is larger and we don't have to worry about it and liquidity is also way quicker.

Ok basically what we need to build is a milestone based pool distribution system where the majority should agree that they are satisfied (And we have a limit to the amount of voting power you possess if you are a shark) with the beta or prototype or what is promised and use the stale pool as a defi contract and use aave to receive a virtual token and diversify the pool like a portfolio.

And consider all the active pools as a single liquid fund for higher yield ok we need to convert web2 from the user side to web3 on the backend seamlessly and instant liquidity.

---

# Building the solution

So from the problem statement we have **three core requirements**:
1. **Smart contract escrow with milestone based payouts**
2. **Platform should take zero fees from the donated pool**
3. **Founders should have instant liquidity**

At first glance this sounds simple but when you actually start designing the system **there are a lot of hidden constraints** that appear.
So let's solve them one by one.

---

# First requirement: Smart Contract Escrow with Milestones

The first requirement says founders should **not receive the entire money upfront**.
Instead they must declare milestones beforehand.

Example:
Founder wants to build a product.
They declare something like:
```text
Goal: $100,000

Milestone 1 → Prototype completed (20%)
Milestone 2 → Beta release (30%)
Milestone 3 → Production ready product (50%)
```

So instead of giving them $100k immediately, the money is **locked inside a smart contract escrow**.

What is a smart contract escrow?
Think of it as **a robot middleman**.

Instead of this:
```text
Backer → Platform → Founder
```

We have this:
```text
Backer → Smart Contract Escrow → Founder
```

Meaning:
- The platform **never holds the money**
- The founder **cannot withdraw early**
- The rules are **enforced automatically**

This removes the **trust problem**.

---

# How do we know if a milestone is actually completed?

The founder might say:
`"Trust me bro the prototype is done"`

But backers need proof.
So this is where **milestone verification** comes in.

---

# Milestone Proof Submission

Whenever a founder finishes a milestone they must submit **proof**.

Examples of proof:
- GitHub repository
- Demo video
- Prototype screenshots
- Technical documentation
- Delivery receipts

The founder uploads this proof to decentralized storage like **IPFS** so it cannot be modified later.
Now backers can actually see the progress.

---

# Voting Mechanism

After proof is submitted, backers vote.
But here we ran into an interesting problem earlier.
If voting power is proportional to money invested then whales can manipulate the vote.

Example:
```text
Backer A invested $100
Backer B invested $10,000
```
Backer B would control everything.

So we introduce **quadratic voting**.
Voting power becomes:
`Voting power = √(investment)`

Example:
```text
$100 → 10 votes
$1000 → 31 votes
$10,000 → 100 votes
```
This reduces whale dominance.

But we still add **one more safety rule**.
Maximum voting power per wallet: `5% cap`
So even if someone invests a huge amount, they cannot control the entire vote.

---

# Voting Window

Voting cannot last forever.
So we define a **fixed voting window**.

Example:
`Voting period = 72 hours`

Backers vote during this time.
The milestone passes if:
```text
60% approval
AND
30% quorum
```
Quorum means at least 30% of all backers must participate.

---

# What if the vote gets stuck?

This is actually a very common issue in decentralized systems.

Example:
```text
Approve → 45%
Reject → 30%
No vote → 25%
```
But it also cannot fail. Now the milestone cannot pass.
This situation is called **governance deadlock**.
And if we do nothing, the campaign funds become permanently locked.
That would completely break the system.

---

# Escalation Mechanism

To solve this we introduce **validators**.
Validators are independent reviewers who analyze milestone proofs.
But they must **stake money** to participate.

Example:
`Validator stake = $2000`

If they behave dishonestly, their stake is **slashed**.
Meaning they lose money.
This creates strong incentives for honest reviews.

---

# Validator Arbitration

If the vote fails to reach quorum:
`Milestone enters escalation phase`

Now validators step in.
Example:
`5 validators randomly selected. Majority decides outcome`

If they approve:
`Funds released`

If they reject:
`Milestone rejected. Founder must revise submission`

This ensures the protocol **never gets stuck**.

---

# Second requirement: Platform Takes Zero Fees from Donation Pool

The platform must take **zero fees from the donation pool**.
Normally platforms like Kickstarter or GoFundMe take around **5% platform fee**.
But our requirement explicitly says we cannot do that.
So how do we earn money?

---

# First revenue stream: Creator SaaS tools

We keep crowdfunding itself completely free.
But creators can subscribe to **advanced tools**.

Example:
- Free tier: Create campaign, Milestone escrow, Backer voting, Basic analytics
- Pro tier: Advanced analytics, Campaign conversion insights, Marketing tools, Priority support
- Growth tier: AI campaign optimization, Investor insights, API integrations, Advanced promotion tools

So the platform earns money from **software services**, not from donations.

---

# Second revenue stream: Liquidity Yield

Now remember something we discussed earlier.
Campaign funds often sit idle for some time.

Example:
`Campaign raises $100k. Founder completes milestone after 15 days`

During those 15 days the money is just **sitting idle**.
So instead of leaving it idle we can generate yield using DeFi.
Protocols like Compound and Aave allow stablecoins to earn interest by lending them to borrowers.

When we deposit funds into Aave we receive a token like `aUSDC`.
The value of this token automatically increases with interest.

---

# Yield has a problem

Crowdfunding campaigns might only last a few days.
Example:
```text
$100k pool
5% APY
3 days
```
The yield would be tiny.

So we solve this by **pooling all active campaigns together**.

Instead of:
```text
Campaign A → $10k
Campaign B → $30k
Campaign C → $60k
```

We combine them into:
`Global liquidity pool → $100k`
Now yield generation becomes meaningful.

---

# Liquidity Allocation Strategy

But we cannot deposit **all funds into DeFi** because founders require **instant liquidity**.
So we divide the pool into three parts:
```text
30% liquidity buffer
60% yield strategy
10% protocol reserve
```

- Liquidity buffer ensures we can instantly pay founders.
- Yield strategy generates interest.
- Protocol reserve acts as an emergency safety fund.

---

# Instant Liquidity System

When a milestone passes:
`Founder payout triggered`
Funds come from the **liquidity buffer**.

Example:
`Founder milestone payout → $20k. Liquidity buffer → pays instantly`

Meanwhile the protocol withdraws the same amount from the yield pool to rebalance the buffer.
This ensures **instant payouts while still earning yield**.

---

# Final System Flow

Now the full system works like this:
```text
Founder creates campaign
        ↓
Backers fund campaign
        ↓
Funds locked in smart contract escrow
        ↓
Funds added to global liquidity pool
        ↓
Founder submits milestone proof
        ↓
Backers vote
        ↓
If quorum reached → milestone approved
Else → validator arbitration
        ↓
Funds released instantly from liquidity buffer
```

---

# What we have built conceptually

Our protocol combines four major systems:
```text
Crowdfunding
+
DAO governance
+
Validator arbitration
+
DeFi liquidity pooling
```

This transforms crowdfunding from a **trust-based platform** into a **mechanism-based protocol**.
Backers gain protection.
Founders receive fair funding.
And the platform can operate sustainably **without taking money from donations**.
