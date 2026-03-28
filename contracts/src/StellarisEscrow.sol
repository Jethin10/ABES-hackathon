// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract StellarisEscrow {
    address public owner;

    struct Campaign {
        bool exists;
        bool paused;
        address founderWallet;
        uint256 targetAmount;
        uint256 totalRaised;
        uint256 totalReleased;
        string currency;
    }

    struct Milestone {
        uint16 allocationBps;
        bool released;
    }

    mapping(bytes32 => Campaign) public campaigns;
    mapping(bytes32 => mapping(uint8 => Milestone)) public milestones;

    event CampaignCreated(
        string campaignId,
        address indexed founderWallet,
        uint256 targetAmount,
        string currency
    );
    event ContributionRecorded(
        string campaignId,
        string contributionId,
        uint256 amountUnits,
        string assetType
    );
    event MilestoneReleased(
        string campaignId,
        string milestoneId,
        uint256 amountUnits
    );
    event CampaignPaused(string campaignId, string reason);
    event CampaignResumed(string campaignId);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function createCampaign(
        string calldata campaignId,
        address founderWallet,
        uint16[] calldata allocationBps,
        uint256 targetAmount,
        string calldata currency
    ) external onlyOwner {
        bytes32 key = keccak256(bytes(campaignId));
        require(!campaigns[key].exists, "campaign exists");
        require(allocationBps.length > 0 && allocationBps.length <= 10, "invalid milestones");

        uint256 totalBps = 0;
        for (uint256 i = 0; i < allocationBps.length; i++) {
            totalBps += allocationBps[i];
            milestones[key][uint8(i + 1)] = Milestone({
                allocationBps: allocationBps[i],
                released: false
            });
        }

        require(totalBps == 10000, "invalid allocation");

        campaigns[key] = Campaign({
            exists: true,
            paused: false,
            founderWallet: founderWallet,
            targetAmount: targetAmount,
            totalRaised: 0,
            totalReleased: 0,
            currency: currency
        });

        emit CampaignCreated(campaignId, founderWallet, targetAmount, currency);
    }

    function recordContribution(
        string calldata campaignId,
        string calldata contributionId,
        uint256 amountUnits,
        string calldata assetType
    ) external onlyOwner {
        bytes32 key = keccak256(bytes(campaignId));
        Campaign storage campaign = campaigns[key];
        require(campaign.exists, "campaign missing");
        require(!campaign.paused, "campaign paused");

        campaign.totalRaised += amountUnits;
        emit ContributionRecorded(campaignId, contributionId, amountUnits, assetType);
    }

    function releaseMilestone(
        string calldata campaignId,
        string calldata milestoneId,
        uint8 milestonePosition,
        uint256 amountUnits
    ) external onlyOwner {
        bytes32 key = keccak256(bytes(campaignId));
        Campaign storage campaign = campaigns[key];
        require(campaign.exists, "campaign missing");
        require(!campaign.paused, "campaign paused");

        Milestone storage milestone = milestones[key][milestonePosition];
        require(!milestone.released, "milestone already released");

        milestone.released = true;
        campaign.totalReleased += amountUnits;

        emit MilestoneReleased(campaignId, milestoneId, amountUnits);
    }

    function pauseCampaign(string calldata campaignId, string calldata reason) external onlyOwner {
        bytes32 key = keccak256(bytes(campaignId));
        Campaign storage campaign = campaigns[key];
        require(campaign.exists, "campaign missing");
        campaign.paused = true;
        emit CampaignPaused(campaignId, reason);
    }

    function resumeCampaign(string calldata campaignId) external onlyOwner {
        bytes32 key = keccak256(bytes(campaignId));
        Campaign storage campaign = campaigns[key];
        require(campaign.exists, "campaign missing");
        campaign.paused = false;
        emit CampaignResumed(campaignId);
    }
}
