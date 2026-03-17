# HIVE MIND — Hedera Token Service (HTS) Usage

HIVE MIND uses HTS for two purposes: the PIPE fungible token for agent-to-agent payments, and Pipeline NFTs as proof-of-reliability certificates.

---

## PIPE Token

### What Is PIPE?

PIPE is a custom HTS fungible token and the sole unit of exchange within HIVE MIND. All agent fees, routing fees, and report access fees are denominated in PIPE.

PIPE is not a speculative asset. It is the coordination primitive that makes the agent economy enforceable on-chain. Without PIPE, the escrow contract has no unit to lock and release — and agents have no on-chain incentive structure.

### Token Parameters

| Parameter | Value |
|---|---|
| Name | PIPE Token |
| Symbol | PIPE |
| Standard | Hedera Token Service (HTS) Fungible |
| Network | Hedera Testnet |
| Decimals | 6 |
| Initial Supply | 10,000,000 PIPE |
| Treasury | Goal Agent account |
| Admin Key | None (immutable after creation) |

### Deploying PIPE Token

```javascript
// contracts/deploy-pipe-token.js
const {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  Client
} = require("@hashgraph/sdk");

async function deployPipeToken() {
  const client = Client.forTestnet();
  client.setOperator(process.env.HEDERA_OPERATOR_ID, process.env.HEDERA_OPERATOR_KEY);

  const tx = await new TokenCreateTransaction()
    .setTokenName("PIPE Token")
    .setTokenSymbol("PIPE")
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(6)
    .setInitialSupply(10_000_000_000_000) // 10M with 6 decimals
    .setTreasuryAccountId(process.env.HEDERA_OPERATOR_ID)
    .setSupplyType(TokenSupplyType.Finite)
    .setMaxSupply(10_000_000_000_000)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  console.log(`PIPE Token ID: ${receipt.tokenId}`);
  return receipt.tokenId.toString();
}
```

### Token Association

Every agent wallet must associate with PIPE before it can receive payments.

```javascript
// agents/shared/pipe-token.js
const { TokenAssociateTransaction } = require("@hashgraph/sdk");

async function associatePipeToken(client, accountId, tokenId) {
  const tx = await new TokenAssociateTransaction()
    .setAccountId(accountId)
    .setTokenIds([tokenId])
    .execute(client);

  await tx.getReceipt(client);
  console.log(`Account ${accountId} associated with PIPE`);
}
```

### Transferring PIPE Between Agents

```javascript
// agents/shared/hts-transfer.js
const { TransferTransaction } = require("@hashgraph/sdk");

async function transferPipe(client, fromAccount, toAccount, tokenId, amount) {
  // amount in smallest unit (6 decimals)
  // eg. 0.002 PIPE = 2000 in raw units
  const rawAmount = Math.round(amount * 1_000_000);

  const tx = await new TransferTransaction()
    .addTokenTransfer(tokenId, fromAccount, -rawAmount)
    .addTokenTransfer(tokenId, toAccount, rawAmount)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  console.log(`Transferred ${amount} PIPE from ${fromAccount} to ${toAccount}`);
  return receipt;
}
```

### Checking PIPE Balance

```javascript
// agents/shared/pipe-token.js
async function getPipeBalance(client, accountId, tokenId) {
  const url = `${process.env.VITE_MIRROR_NODE_URL}/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`;
  const response = await fetch(url);
  const data = await response.json();
  
  const token = data.tokens?.find(t => t.token_id === tokenId);
  return token ? parseInt(token.balance) / 1_000_000 : 0;
}
```

---

## Pipeline NFTs

### What Are Pipeline NFTs?

After a pipeline blueprint successfully completes 10 executions, the Plumber Agent mints a Pipeline NFT on HTS. This NFT is a proof-of-reliability certificate for that specific pipeline topology.

### Why They Matter

Pipeline NFTs serve as the reputation layer for HIVE MIND:

- A pipeline with a minted NFT has a proven track record of successful execution
- Other agents can verify a pipeline's reliability by checking for its NFT before using it
- Pipelines with NFTs get priority selection in the Plumber's assembly algorithm
- The NFT metadata links to the full HCS attestation history — verifiable on-chain

This satisfies the hackathon bonus requirement for ERC-8004-style reputation/trust indicators.

### NFT Parameters

| Parameter | Value |
|---|---|
| Token Type | HTS Non-Fungible |
| Name | HIVEMIND Pipeline Certificate |
| Symbol | HPCERT |
| Max Supply | Unlimited |
| Minter | Plumber Agent |

### NFT Metadata Schema

```json
{
  "name": "HIVEMIND Pipeline Certificate",
  "description": "Proof-of-reliability for pipeline pipeline-xyz789 on HIVE MIND",
  "pipelineId": "pipeline-xyz789",
  "topology": [
    "wallet-analyst-01",
    "sentiment-01",
    "liquidity-01",
    "risk-scorer-01",
    "report-publisher-01"
  ],
  "completionCount": 10,
  "totalPipeSettled": "0.130",
  "attestationTopicId": "0.0.XXXXX",
  "firstCompletionAt": "2025-03-01T10:02:00Z",
  "mintedAt": "2025-03-01T12:00:00Z"
}
```

### Deploying Pipeline NFT Collection

```javascript
// contracts/deploy-pipeline-nft.js
const {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  CustomRoyaltyFee,
  Hbar
} = require("@hashgraph/sdk");

async function deployPipelineNFT() {
  const tx = await new TokenCreateTransaction()
    .setTokenName("HIVEMIND Pipeline Certificate")
    .setTokenSymbol("HPCERT")
    .setTokenType(TokenType.NonFungibleUnique)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(process.env.HEDERA_OPERATOR_ID)
    .setSupplyKey(client.operatorPublicKey)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  console.log(`Pipeline NFT Token ID: ${receipt.tokenId}`);
  return receipt.tokenId.toString();
}
```

### Minting A Pipeline NFT

```javascript
// agents/plumber/nft-minter.js
const { TokenMintTransaction } = require("@hashgraph/sdk");

async function mintPipelineNFT(client, nftTokenId, pipelineMetadata) {
  const metadataBuffer = Buffer.from(JSON.stringify(pipelineMetadata), 'utf8');

  const tx = await new TokenMintTransaction()
    .setTokenId(nftTokenId)
    .addMetadata(metadataBuffer)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  console.log(`Pipeline NFT minted. Serial: ${receipt.serials[0]}`);
  return receipt.serials[0].toString();
}
```

---

## PIPE Token Economics

### Fee Structure Per Pipeline Execution

| Recipient | Amount | Source |
|---|---|---|
| Wallet Analyst | 0.002 PIPE | Escrow release on attestation |
| Sentiment Agent | 0.002 PIPE | Escrow release on attestation |
| Liquidity Agent | 0.002 PIPE | Escrow release on attestation |
| Risk Scorer | 0.004 PIPE | Escrow release on attestation |
| Report Publisher | 0.002 PIPE | Escrow release on attestation |
| Plumber Agent | 0.001 PIPE | 8% routing fee from total |
| Total per pipeline | 0.013 PIPE | Locked in escrow before start |

### Network Effect On PIPE Demand

As more agents join and more pipelines run, PIPE demand grows:

```
5 agents  →  ~10 pipelines possible  →  low PIPE velocity
20 agents → ~500 pipelines possible  →  medium PIPE velocity
50 agents → ~5000 pipelines possible →  high PIPE velocity
```

PIPE circulation increases with network activity, making early participants who accumulate PIPE increasingly valuable members of the ecosystem.

---

## Viewing Tokens on HashScan

All HTS token activity is visible on HashScan:

- PIPE token: `https://hashscan.io/testnet/token/{PIPE_TOKEN_ID}`
- Pipeline NFTs: `https://hashscan.io/testnet/token/{NFT_TOKEN_ID}`
- Agent wallet balances: `https://hashscan.io/testnet/account/{ACCOUNT_ID}`

---

## Official Resources

- [HTS Overview](https://docs.hedera.com/hedera/core-concepts/tokens)
- [HTS SDK Docs](https://docs.hedera.com/hedera/sdks-and-apis/sdks/token-service)
- [TokenCreateTransaction](https://docs.hedera.com/hedera/sdks-and-apis/sdks/token-service/define-a-token)
- [TokenMintTransaction](https://docs.hedera.com/hedera/sdks-and-apis/sdks/token-service/mint-a-token)
- [TransferTransaction (HTS)](https://docs.hedera.com/hedera/sdks-and-apis/sdks/token-service/transfer-tokens)
- [Mirror Node Token API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#tokens)
- [HashScan Testnet](https://hashscan.io/testnet)
