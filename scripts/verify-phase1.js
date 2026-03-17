require('dotenv').config();

function decodeMessage(base64) {
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

async function verifyPhase1() {
  const base = process.env.MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com';
  const topic = process.env.HCS_REGISTRY_TOPIC;
  if (!topic) {
    throw new Error('HCS_REGISTRY_TOPIC is not set');
  }

  const expected = new Map([
    ['watcher-01', { inputType: 'HTSEventStream', outputType: 'TaskBundle', pricePerTask: '0.001' }],
    ['plumber-01', { inputType: 'AgentManifest+TaskBundle', outputType: 'PipelineBlueprint', pricePerTask: '0' }],
    ['wallet-analyst-01', { inputType: 'WalletAddress', outputType: 'WalletHistory', pricePerTask: '0.002' }],
    ['sentiment-01', { inputType: 'TokenId', outputType: 'SentimentScore', pricePerTask: '0.002' }],
    ['liquidity-01', { inputType: 'TokenId', outputType: 'LiquidityReport', pricePerTask: '0.002' }],
    ['risk-scorer-01', { inputType: 'WalletHistory+SentimentScore+LiquidityReport', outputType: 'RiskScore', pricePerTask: '0.004' }],
    ['report-publisher-01', { inputType: 'RiskScore+AllInputs', outputType: 'HCSPublication', pricePerTask: '0.002' }]
  ]);

  const url = `${base}/api/v1/topics/${topic}/messages?limit=20&order=desc`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Mirror node error ${res.status}`);
  }

  const data = await res.json();
  const messages = (data.messages || []).map((m) => decodeMessage(m.message));
  const manifests = messages.filter((m) => m.messageType === 'AGENT_MANIFEST');

  console.log(`REGISTRY_TOPIC=${topic}`);
  console.log(`AGENT_MANIFEST_COUNT=${manifests.length}`);

  let ok = manifests.length === 7;
  for (const [agentId, rule] of expected.entries()) {
    const found = manifests.find((m) => m.payload && m.payload.agentId === agentId);
    if (!found) {
      ok = false;
      console.log(`MISSING=${agentId}`);
      continue;
    }

    const pass =
      found.payload.inputType === rule.inputType &&
      found.payload.outputType === rule.outputType &&
      String(found.payload.pricePerTask) === rule.pricePerTask;
    if (!pass) {
      ok = false;
    }

    console.log(
      `CHECK=${agentId} RESULT=${pass ? 'OK' : 'FAIL'} inputType=${found.payload.inputType} outputType=${found.payload.outputType} pricePerTask=${found.payload.pricePerTask}`
    );
  }

  console.log(`PHASE1_MANIFEST_VALID=${ok ? 'YES' : 'NO'}`);
  if (!ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  verifyPhase1().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  verifyPhase1
};