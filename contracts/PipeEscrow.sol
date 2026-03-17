// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

contract PipeEscrow {
    enum PipelineStatus {
        UNFUNDED,
        FUNDED,
        IN_PROGRESS,
        SETTLED,
        PARTIAL_TIMEOUT
    }

    struct Pipeline {
        PipelineStatus status;
        address payer;
        address plumberWallet;
        uint256 plumberFee;
        uint256 totalLocked;
        uint256 totalReleased;
        uint256 timeoutAt;
        uint256 pendingPayments;
    }

    IERC20 public immutable pipeToken;
    uint256 public immutable timeoutSeconds;

    mapping(string => Pipeline) private pipelines;
    mapping(string => mapping(address => uint256)) private feesByAgent;
    mapping(string => mapping(address => bool)) private paid;

    event PipelineFunded(string pipelineId, uint256 totalAmount, uint256 timestamp);
    event PaymentReleased(string pipelineId, address agent, uint256 amount);
    event PipelineSettled(string pipelineId, uint256 timestamp);
    event TimeoutClaimed(string pipelineId, address payer, uint256 refundAmount);

    constructor(address pipeTokenAddress, uint256 defaultTimeoutSeconds) {
        require(pipeTokenAddress != address(0), "Invalid token");
        require(defaultTimeoutSeconds > 0, "Invalid timeout");
        pipeToken = IERC20(pipeTokenAddress);
        timeoutSeconds = defaultTimeoutSeconds;
    }

    function fund(
        string calldata pipelineId,
        address[] calldata agentWallets,
        uint256[] calldata agentFees,
        address plumberWallet,
        uint256 plumberFee
    ) external {
        require(bytes(pipelineId).length > 0, "Missing pipelineId");
        require(agentWallets.length > 0, "No agents");
        require(agentWallets.length == agentFees.length, "Length mismatch");
        require(plumberWallet != address(0), "Invalid plumber");

        Pipeline storage p = pipelines[pipelineId];
        require(p.status == PipelineStatus.UNFUNDED, "Already funded");

        uint256 total;
        for (uint256 i = 0; i < agentWallets.length; i++) {
            address agent = agentWallets[i];
            uint256 fee = agentFees[i];
            require(agent != address(0), "Invalid agent");
            require(fee > 0, "Invalid fee");
            require(feesByAgent[pipelineId][agent] == 0, "Duplicate agent");

            feesByAgent[pipelineId][agent] = fee;
            total += fee;
        }

        if (plumberFee > 0) {
            total += plumberFee;
        }

        require(total > 0, "No funds");

        p.status = PipelineStatus.FUNDED;
        p.payer = msg.sender;
        p.plumberWallet = plumberWallet;
        p.plumberFee = plumberFee;
        p.totalLocked = total;
        p.timeoutAt = block.timestamp + timeoutSeconds;
        p.pendingPayments = agentWallets.length + (plumberFee > 0 ? 1 : 0);

        bool ok = pipeToken.transferFrom(msg.sender, address(this), total);
        require(ok, "Token transferFrom failed");

        emit PipelineFunded(pipelineId, total, block.timestamp);
    }

    function releasePayment(string calldata pipelineId, address agentWallet) external {
        Pipeline storage p = pipelines[pipelineId];
        require(
            p.status == PipelineStatus.FUNDED || p.status == PipelineStatus.IN_PROGRESS,
            "Not releasable"
        );
        require(agentWallet != address(0), "Invalid wallet");
        require(!paid[pipelineId][agentWallet], "Already paid");

        uint256 amount = feesByAgent[pipelineId][agentWallet];
        if (amount == 0 && agentWallet == p.plumberWallet) {
            amount = p.plumberFee;
        }
        require(amount > 0, "No fee for wallet");

        paid[pipelineId][agentWallet] = true;
        p.totalReleased += amount;
        p.pendingPayments -= 1;
        p.status = PipelineStatus.IN_PROGRESS;

        bool ok = pipeToken.transfer(agentWallet, amount);
        require(ok, "Token transfer failed");
        emit PaymentReleased(pipelineId, agentWallet, amount);

        if (p.pendingPayments == 0) {
            p.status = PipelineStatus.SETTLED;
            emit PipelineSettled(pipelineId, block.timestamp);
        }
    }

    function claimTimeout(string calldata pipelineId) external {
        Pipeline storage p = pipelines[pipelineId];
        require(
            p.status == PipelineStatus.FUNDED || p.status == PipelineStatus.IN_PROGRESS,
            "Not timeout state"
        );
        require(block.timestamp >= p.timeoutAt, "Timeout not reached");

        uint256 refund = p.totalLocked - p.totalReleased;
        p.status = PipelineStatus.PARTIAL_TIMEOUT;
        p.pendingPayments = 0;

        if (refund > 0) {
            bool ok = pipeToken.transfer(p.payer, refund);
            require(ok, "Refund failed");
        }

        emit TimeoutClaimed(pipelineId, p.payer, refund);
    }

    function getPipelineStatus(string calldata pipelineId) external view returns (PipelineStatus) {
        return pipelines[pipelineId].status;
    }

    function getPipelineSummary(
        string calldata pipelineId
    )
        external
        view
        returns (
            PipelineStatus status,
            address payer,
            uint256 totalLocked,
            uint256 totalReleased,
            uint256 timeoutAt,
            uint256 pendingPayments
        )
    {
        Pipeline storage p = pipelines[pipelineId];
        return (p.status, p.payer, p.totalLocked, p.totalReleased, p.timeoutAt, p.pendingPayments);
    }
}