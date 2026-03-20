require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { publishToHCS } = require('./hcs-publish');
const { askLocalJson } = require('../utils/llm');

function normalizeConfidence(value, fallback = 70) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  const scaled = raw <= 1 ? raw * 100 : raw;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTimestampToMs(ts) {
  if (!ts) {
    return 0;
  }
  const s = String(ts);
  const parts = s.split('.');
  const sec = Number(parts[0] || '0');
  const nanos = Number(parts[1] || '0');
  return sec * 1000 + Math.floor(nanos / 1_000_000);
}

function timestampToIso(ts) {
  const ms = parseTimestampToMs(ts);
  if (!ms) {
    return new Date().toISOString();
  }
  return new Date(ms).toISOString();
}

function readState(stateFile) {
  try {
    if (!fs.existsSync(stateFile)) {
      return { seenTokenIds: [], initializedAt: null };
    }
    const raw = fs.readFileSync(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.seenTokenIds)) {
      return { seenTokenIds: [], initializedAt: null };
    }
    return {
      seenTokenIds: parsed.seenTokenIds,
      initializedAt: parsed.initializedAt || null
    };
  } catch (err) {
    console.warn(`[WATCHER] State read failed, starting fresh: ${err.message}`);
    return { seenTokenIds: [], initializedAt: null };
  }
}

function writeState(stateFile, state) {
  const dir = path.dirname(stateFile);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function fetchLatestTokenSummaries(mirrorBase, limit) {
  const data = await fetchJson(`${mirrorBase}/api/v1/tokens?limit=${limit}&order=desc`);
  return data.tokens || [];
}

async function fetchTokenDetail(mirrorBase, tokenId) {
  return fetchJson(`${mirrorBase}/api/v1/tokens/${tokenId}`);
}

async function fetchAccount(mirrorBase, accountId) {
  return fetchJson(`${mirrorBase}/api/v1/accounts/${accountId}`);
}

function buildTaskBundle(token) {
  const taskId = `task-${crypto.randomUUID()}`;
  return {
    ucpVersion: '1.0',
    messageType: 'TASK_BUNDLE',
    senderId: 'watcher-01',
    timestamp: new Date().toISOString(),
    payload: {
      taskId,
      triggerType: 'HTS_TOKEN_CREATED',
      triggerData: {
        tokenId: token.token_id,
        tokenName: token.name || '',
        tokenSymbol: token.symbol || '',
        creatorWallet: token.treasury_account_id,
        createdAt: timestampToIso(token.created_timestamp)
      },
      requiredOutputType: 'HCSPublication',
      maxBudget: '0.020'
    }
  };
}

async function evaluateToken(token, options) {
  const {
    mirrorBase,
    operatorId,
    excludeOperatorCreator,
    minAgeHours,
    minLiquidityHbar
  } = options;

  const creatorWallet = token.treasury_account_id;
  if (!creatorWallet) {
    return { qualifies: false, reason: 'missing creator wallet' };
  }
  if (excludeOperatorCreator && creatorWallet === operatorId) {
    return { qualifies: false, reason: 'creator is operator account' };
  }

  const account = await fetchAccount(mirrorBase, creatorWallet);
  const tokenCreatedMs = parseTimestampToMs(token.created_timestamp);
  const accountCreatedMs = parseTimestampToMs(account.created_timestamp);
  const ageHours = (tokenCreatedMs - accountCreatedMs) / (1000 * 60 * 60);

  if (!Number.isFinite(ageHours) || ageHours < minAgeHours) {
    return {
      qualifies: false,
      reason: `creator age ${ageHours.toFixed(2)}h below minimum ${minAgeHours}h`
    };
  }

  const tinybars = Number(account.balance && account.balance.balance ? account.balance.balance : 0);
  const hbar = tinybars / 100000000;
  if (hbar < minLiquidityHbar) {
    return {
      qualifies: false,
      reason: `creator liquidity ${hbar.toFixed(4)} HBAR below minimum ${minLiquidityHbar}`
    };
  }

  return {
    qualifies: true,
    creatorWallet,
    creatorAgeHours: ageHours,
    creatorLiquidityHbar: hbar
  };
}

async function evaluateTokenWithLlm(token, deterministicResult) {
  if (!deterministicResult.qualifies) {
    return deterministicResult;
  }

  const llm = await askLocalJson({
    systemPrompt: [
      'You are a blockchain event triage agent.',
      'Given a newly-created token and creator profile, decide whether it should trigger deeper risk analysis.',
      'Return only JSON with keys: qualifies, reason, confidence.',
      'qualifies must be boolean.'
    ].join(' '),
    userPrompt: JSON.stringify({
      tokenId: token.token_id,
      tokenName: token.name || '',
      tokenSymbol: token.symbol || '',
      createdTimestamp: token.created_timestamp,
      creatorWallet: deterministicResult.creatorWallet,
      creatorAgeHours: deterministicResult.creatorAgeHours,
      creatorLiquidityHbar: deterministicResult.creatorLiquidityHbar
    }),
    validator: (value) => value && typeof value.qualifies === 'boolean'
  });

  if (!llm.ok) {
    return {
      ...deterministicResult,
      llm: {
        source: 'deterministic-fallback',
        model: llm.meta && llm.meta.model ? llm.meta.model : null,
        confidence: 55,
        reason: 'Watcher used deterministic thresholds because LLM inference failed.',
        error: llm.error
      }
    };
  }

  return {
    ...deterministicResult,
    qualifies: Boolean(llm.output.qualifies),
    reason: String(llm.output.reason || '').slice(0, 220) || (llm.output.qualifies ? 'llm-qualified' : 'llm-filtered'),
    llm: {
      source: 'llm',
      model: llm.meta && llm.meta.model ? llm.meta.model : null,
      confidence: normalizeConfidence(llm.output.confidence, 70),
      reason: String(llm.output.reason || '').slice(0, 220),
      error: null
    }
  };
}

async function startWatcherLoop(custom = {}) {
  const mirrorBase = String(process.env.MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com').replace(/\/$/, '');
  const pollIntervalMs = Number(process.env.WATCHER_POLL_INTERVAL_MS || 5000);
  const reconnectDelayMs = Number(process.env.WATCHER_RECONNECT_DELAY_MS || 15000);
  const minAgeHours = Number(process.env.WATCHER_CREATOR_WALLET_MIN_AGE_HOURS || 24);
  const minLiquidityHbar = Number(process.env.WATCHER_MIN_LIQUIDITY_HBAR || 100);
  const excludeOperatorCreator = String(process.env.WATCHER_EXCLUDE_OPERATOR_CREATOR || 'false').toLowerCase() === 'true';
  const taskTopic = process.env.HCS_TASK_TOPIC;
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const stateFile = custom.stateFile || path.join(process.cwd(), '.state', 'watcher-state.json');
  const baselineLimit = Number(process.env.WATCHER_BASELINE_LIMIT || 25);

  if (!taskTopic) {
    throw new Error('HCS_TASK_TOPIC is not set in .env');
  }
  if (!operatorId) {
    throw new Error('HEDERA_OPERATOR_ID is not set in .env');
  }

  const state = readState(stateFile);
  const seen = new Set(state.seenTokenIds);

  if (!state.initializedAt) {
    const baseline = await fetchLatestTokenSummaries(mirrorBase, baselineLimit);
    for (const token of baseline) {
      if (token.token_id) {
        seen.add(token.token_id);
      }
    }
    state.initializedAt = new Date().toISOString();
    state.seenTokenIds = Array.from(seen).slice(-5000);
    writeState(stateFile, state);
    console.log(`[WATCHER] Baseline initialised with ${baseline.length} existing tokens`);
  }

  console.log('[WATCHER] Running watcher loop');
  console.log(`[WATCHER] Mirror Node: ${mirrorBase}`);
  console.log(`[WATCHER] Task topic: ${taskTopic}`);
  console.log(`[WATCHER] Min age: ${minAgeHours}h | Min liquidity: ${minLiquidityHbar} HBAR`);
  console.log(`[WATCHER] Exclude operator creator: ${excludeOperatorCreator}`);

  while (true) {
    try {
      const latest = await fetchLatestTokenSummaries(mirrorBase, baselineLimit);
      const unseen = latest
        .map((t) => t.token_id)
        .filter((tokenId) => tokenId && !seen.has(tokenId));

      if (unseen.length > 0) {
        for (const tokenId of unseen.reverse()) {
          const token = await fetchTokenDetail(mirrorBase, tokenId);
          const result = await evaluateToken(token, {
            mirrorBase,
            operatorId,
            excludeOperatorCreator,
            minAgeHours,
            minLiquidityHbar
          });

          const finalResult = await evaluateTokenWithLlm(token, result);

          if (finalResult.qualifies) {
            console.log(`[WATCHER] Qualifying token detected: ${token.token_id}`);
            console.log(`[WATCHER] Creator ${finalResult.creatorWallet} | age ${finalResult.creatorAgeHours.toFixed(2)}h | liquidity ${finalResult.creatorLiquidityHbar.toFixed(4)} HBAR`);
            if (finalResult.llm) {
              console.log(`[WATCHER] LLM triage ${finalResult.llm.source} confidence=${finalResult.llm.confidence}`);
            }
            const message = buildTaskBundle(token);
            if (finalResult.llm) {
              message.payload.triggerData.watcherReasoning = {
                source: finalResult.llm.source,
                confidence: finalResult.llm.confidence,
                reason: finalResult.llm.reason,
                model: finalResult.llm.model
              };
            }
            await publishToHCS(taskTopic, message);
          } else {
            console.log(`[WATCHER] Skipped ${token.token_id}: ${finalResult.reason}`);
          }

          seen.add(tokenId);
        }

        state.seenTokenIds = Array.from(seen).slice(-5000);
        writeState(stateFile, state);
      }

      await sleep(pollIntervalMs);
    } catch (err) {
      console.error(`[WATCHER] Mirror node error: ${err.message}`);
      console.error(`[WATCHER] Reconnecting in ${reconnectDelayMs}ms`);
      await sleep(reconnectDelayMs);
    }
  }
}

if (require.main === module) {
  startWatcherLoop().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  startWatcherLoop,
  parseTimestampToMs,
  buildTaskBundle
};
