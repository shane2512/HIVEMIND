# HIVE MIND — Smart Contracts

## Overview

HIVE MIND deploys two contracts to Hedera EVM testnet:

| Contract | Purpose |
|---|---|
| `PipeEscrow.sol` | Locks PIPE tokens before pipeline runs. Verifies HCS attestations. Releases payments per agent. |
| Pipeline NFT | Minted via HTS — not a separate contract. See `docs/HTS.md`. |

---

## PipeEscrow.sol

### Purpose

The escrow contract is the trust enforcer between agents who have never met. It solves the classic "who pays first?" problem in a multi-agent system by holding payment until work is provably completed on-chain.

### Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPipeEscrow {
    
    // Goal Agent calls this to lock PIPE for a pipeline
    function fund(
        string calldata pipelineId,
        address[] calldata agentWallets,
        uint256[] calldata agentFees,
        address plumberWallet,
        uint256 plumberFee,
        string calldata attestationTopicId
    ) external;
    
    // Called by contract verifier after HCS attestation confirmed
    // In practice: called by a trusted verifier service watching HCS
    function releasePayment(
        string calldata pipelineId,
        address agentWallet
    ) external;
    
    // Handles timeout — returns unclaimed fees to Goal Agent
    function claimTimeout(
        string calldata pipelineId
    ) external;
    
    // View functions
    function getPipelineStatus(string calldata pipelineId) 
        external view returns (PipelineStatus);
    
    function getAgentBalance(address agentWallet) 
        external view returns (uint256);
}
```

### State Machine

```
UNFUNDED → FUNDED → IN_PROGRESS → SETTLED
                         │
                         └────────→ PARTIAL_TIMEOUT
```

### Events

```solidity
event PipelineFunded(string pipelineId, uint256 totalAmount, uint256 timestamp);
event PaymentReleased(string pipelineId, address agent, uint256 amount);
event PipelineSettled(string pipelineId, uint256 timestamp);
event TimeoutClaimed(string pipelineId, address agent, uint256 refundAmount);
```

---

## Deployment

### Prerequisites

```bash
cd contracts
npm install
cp ../.env contracts/.env  # Uses same env file
```

### Deploy to Hedera Testnet

```bash
# Deploy PIPE Token (HTS — not a contract)
node deploy-pipe-token.js

# Deploy PipeEscrow contract
npx hardhat run scripts/deploy-escrow.js --network hedera_testnet

# Deploy Pipeline NFT collection (HTS)
node deploy-pipeline-nft.js

# Verify all deployments
node verify-deployment.js
```

### Hardhat Config for Hedera EVM

```javascript
// hardhat.config.js
module.exports = {
  solidity: "0.8.19",
  networks: {
    hedera_testnet: {
      url: "https://testnet.hashio.io/api",
      chainId: 296,
      accounts: [process.env.HEDERA_EVM_PRIVATE_KEY]
    }
  }
};
```

Note: Hedera EVM uses a separate private key format from the Hedera SDK. Generate an EVM-compatible key from your Hedera account using the [Hedera Portal](https://portal.hedera.com).

---

## Verifying Contracts

After deployment, verify the contract on HashScan:

```bash
npx hardhat verify --network hedera_testnet {PIPE_ESCROW_ADDRESS}
```

Verified contract URL: `https://hashscan.io/testnet/contract/{PIPE_ESCROW_ADDRESS}`

---

## HCS Attestation Verification

The escrow contract cannot directly read HCS state — Hedera EVM is not natively aware of HCS. HIVE MIND uses a lightweight verifier pattern:

```
1. Worker Agent posts attestation to HCS ATTESTATION_TOPIC
2. Verifier service (part of agents/shared) watches ATTESTATION_TOPIC
3. Verifier queries Mirror Node to confirm message exists + timestamp
4. Verifier calls PipeEscrow.releasePayment() on behalf of the verified agent
5. Escrow releases payment
```

The verifier is a trusted component — in production this would be replaced by a Hedera native integration. For the hackathon, the verifier is a simple Node.js service that runs as part of the Plumber Agent.

---

## Official Resources

- [Hedera EVM Docs](https://docs.hedera.com/hedera/core-concepts/smart-contracts)
- [Hedera JSON-RPC Relay](https://docs.hedera.com/hedera/core-concepts/smart-contracts/json-rpc-relay)
- [HashScan Testnet](https://hashscan.io/testnet)
- [Hardhat Docs](https://hardhat.org/docs)
- [Hedera EVM Chain ID](https://docs.hedera.com/hedera/core-concepts/smart-contracts/deploying-smart-contracts)
