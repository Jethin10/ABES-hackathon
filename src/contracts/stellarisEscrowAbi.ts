export const stellarisEscrowAbi = [
  {
    type: 'function',
    name: 'createCampaign',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'string' },
      { name: 'founderWallet', type: 'address' },
      { name: 'allocationBps', type: 'uint16[]' },
      { name: 'targetAmount', type: 'uint256' },
      { name: 'currency', type: 'string' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'recordContribution',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'string' },
      { name: 'contributionId', type: 'string' },
      { name: 'amountUnits', type: 'uint256' },
      { name: 'assetType', type: 'string' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'releaseMilestone',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'string' },
      { name: 'milestoneId', type: 'string' },
      { name: 'milestonePosition', type: 'uint8' },
      { name: 'amountUnits', type: 'uint256' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'pauseCampaign',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'string' },
      { name: 'reason', type: 'string' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'resumeCampaign',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'campaignId', type: 'string' }],
    outputs: []
  },
  {
    type: 'event',
    name: 'CampaignCreated',
    inputs: [
      { name: 'campaignId', type: 'string', indexed: false },
      { name: 'founderWallet', type: 'address', indexed: true },
      { name: 'targetAmount', type: 'uint256', indexed: false },
      { name: 'currency', type: 'string', indexed: false }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'ContributionRecorded',
    inputs: [
      { name: 'campaignId', type: 'string', indexed: false },
      { name: 'contributionId', type: 'string', indexed: false },
      { name: 'amountUnits', type: 'uint256', indexed: false },
      { name: 'assetType', type: 'string', indexed: false }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'MilestoneReleased',
    inputs: [
      { name: 'campaignId', type: 'string', indexed: false },
      { name: 'milestoneId', type: 'string', indexed: false },
      { name: 'amountUnits', type: 'uint256', indexed: false }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'CampaignPaused',
    inputs: [
      { name: 'campaignId', type: 'string', indexed: false },
      { name: 'reason', type: 'string', indexed: false }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'CampaignResumed',
    inputs: [{ name: 'campaignId', type: 'string', indexed: false }],
    anonymous: false
  }
] as const;
