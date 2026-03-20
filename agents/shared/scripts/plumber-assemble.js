require('dotenv').config();
const crypto = require('crypto');
const { askLocalJson } = require('../utils/llm');

function parseFee(fee) {
  const value = Number(fee || '0');
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function splitTypes(typeString) {
  return String(typeString || '')
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean);
}

function deriveInitialTypes(taskBundle) {
  const payload = taskBundle && taskBundle.payload ? taskBundle.payload : {};
  const initial = new Set();

  if (payload.requiredInputType) {
    for (const t of splitTypes(payload.requiredInputType)) {
      initial.add(t);
    }
  }

  const triggerData = payload.triggerData || {};
  if (triggerData.creatorWallet) {
    initial.add('WalletAddress');
  }
  if (triggerData.tokenId) {
    initial.add('TokenId');
  }

  return initial;
}

function getTaskConstraints(taskBundle) {
  const payload = taskBundle && taskBundle.payload ? taskBundle.payload : {};
  const requiredOutputType = String(payload.requiredOutputType || '').trim();
  if (!requiredOutputType) {
    throw new Error('TASK_BUNDLE missing payload.requiredOutputType');
  }

  return {
    requiredOutputType,
    maxBudget: parseFee(payload.maxBudget || '0'),
    initialTypes: deriveInitialTypes(taskBundle)
  };
}

function canSatisfyType(typeName, typeSet, initialTypes) {
  if (typeName === 'AllInputs') {
    return Array.from(initialTypes).every((t) => typeSet.has(t));
  }
  return typeSet.has(typeName);
}

function canRunAgent(agent, typeSet, initialTypes) {
  const required = splitTypes(agent.inputType);
  if (required.length === 0) {
    return false;
  }
  return required.every((typeName) => canSatisfyType(typeName, typeSet, initialTypes));
}

function signatureFor(used, typeSet) {
  return `${used.slice().sort().join(',')}|${Array.from(typeSet).sort().join(',')}`;
}

function validateAgentOrder(agentIds, candidates, constraints) {
  const byId = new Map(candidates.map((c) => [c.agentId, c]));
  const seen = new Set();
  const selected = [];
  const typeSet = new Set(constraints.initialTypes);
  let totalFee = 0;

  for (const id of agentIds) {
    if (seen.has(id)) {
      return null;
    }

    const agent = byId.get(id);
    if (!agent) {
      return null;
    }

    if (!canRunAgent(agent, typeSet, constraints.initialTypes)) {
      return null;
    }

    totalFee += parseFee(agent.pricePerTask);
    if (constraints.maxBudget > 0 && totalFee > constraints.maxBudget) {
      return null;
    }

    typeSet.add(agent.outputType);
    selected.push(agent);
    seen.add(id);
  }

  if (!typeSet.has(constraints.requiredOutputType)) {
    return null;
  }

  return {
    selectedAgents: selected,
    totalAgentFees: totalFee,
    initialTypes: constraints.initialTypes
  };
}

async function findLlmPlan(manifests, taskBundle) {
  const constraints = getTaskConstraints(taskBundle);
  const candidates = manifests
    .filter((m) => m.agentType === 'WORKER')
    .map((m) => ({
      agentId: m.agentId,
      inputType: m.inputType,
      outputType: m.outputType,
      pricePerTask: m.pricePerTask,
      description: m.description || ''
    }));

  const llm = await askLocalJson({
    systemPrompt: [
      'You are a pipeline planner for autonomous worker agents.',
      'Return only JSON with keys: selectedAgentIds, reason.',
      'selectedAgentIds must be an ordered array of unique worker agent IDs.',
      'The plan must satisfy required output type and remain within maxBudget.'
    ].join(' '),
    userPrompt: JSON.stringify({
      requiredOutputType: constraints.requiredOutputType,
      maxBudget: constraints.maxBudget,
      initialInputTypes: Array.from(constraints.initialTypes),
      candidates
    }),
    validator: (value) => {
      if (!value || typeof value !== 'object') return false;
      if (!Array.isArray(value.selectedAgentIds)) return false;
      return value.selectedAgentIds.every((id) => typeof id === 'string' && id.trim().length > 0);
    }
  });

  if (!llm.ok) {
    return {
      ok: false,
      error: llm.error,
      meta: llm.meta
    };
  }

  const normalizedIds = llm.output.selectedAgentIds.map((id) => String(id).trim());
  const validated = validateAgentOrder(normalizedIds, manifests.filter((m) => m.agentType === 'WORKER'), constraints);
  if (!validated) {
    return {
      ok: false,
      error: 'LLM plan failed validation',
      meta: llm.meta
    };
  }

  return {
    ok: true,
    selectedAgents: validated.selectedAgents,
    totalAgentFees: validated.totalAgentFees,
    initialTypes: validated.initialTypes,
    planner: {
      mode: 'llm',
      provider: 'ollama',
      model: llm.meta && llm.meta.model ? llm.meta.model : null,
      reason: String(llm.output.reason || 'LLM-selected valid agent chain').slice(0, 400)
    }
  };
}

function findCheapestPlan(manifests, taskBundle) {
  const constraints = getTaskConstraints(taskBundle);
  const requiredOutputType = constraints.requiredOutputType;
  const maxBudget = constraints.maxBudget;
  const initialTypes = constraints.initialTypes;

  const candidates = manifests
    .filter((m) => m.agentType === 'WORKER')
    .map((m) => ({
      ...m,
      fee: parseFee(m.pricePerTask)
    }));

  const frontier = [{
    used: [],
    typeSet: new Set(initialTypes),
    totalFee: 0
  }];
  const visited = new Map();

  let best = null;

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.totalFee - b.totalFee || a.used.length - b.used.length);
    const current = frontier.shift();

    if (current.typeSet.has(requiredOutputType)) {
      if (!best || current.totalFee < best.totalFee) {
        best = current;
      }
      continue;
    }

    for (const agent of candidates) {
      if (current.used.includes(agent.agentId)) {
        continue;
      }
      if (!canRunAgent(agent, current.typeSet, initialTypes)) {
        continue;
      }

      const nextFee = current.totalFee + agent.fee;
      if (maxBudget > 0 && nextFee > maxBudget) {
        continue;
      }

      const nextTypeSet = new Set(current.typeSet);
      nextTypeSet.add(agent.outputType);
      const nextUsed = [...current.used, agent.agentId];
      const key = signatureFor(nextUsed, nextTypeSet);

      const seenFee = visited.get(key);
      if (seenFee !== undefined && seenFee <= nextFee) {
        continue;
      }

      visited.set(key, nextFee);
      frontier.push({
        used: nextUsed,
        typeSet: nextTypeSet,
        totalFee: nextFee
      });
    }
  }

  if (!best) {
    return null;
  }

  const selectedAgents = best.used
    .map((agentId) => manifests.find((m) => m.agentId === agentId))
    .filter(Boolean);

  return {
    selectedAgents,
    totalAgentFees: best.totalFee,
    initialTypes,
    planner: {
      mode: 'deterministic',
      provider: 'local',
      model: null,
      reason: 'Cheapest valid deterministic plan (type constraints + budget)'
    }
  };
}

function buildStages(selectedAgents, initialTypes) {
  const producedByType = new Map();
  const stageByAgentId = new Map();
  const stages = [];

  for (const agent of selectedAgents) {
    const required = splitTypes(agent.inputType);
    const dependsOn = [];

    for (const reqType of required) {
      if (reqType === 'AllInputs') {
        continue;
      }
      if (initialTypes.has(reqType)) {
        continue;
      }
      const producerAgentId = producedByType.get(reqType);
      if (producerAgentId && !dependsOn.includes(producerAgentId)) {
        dependsOn.push(producerAgentId);
      }
    }

    let stageIndex = 0;
    if (dependsOn.length > 0) {
      const maxDepStage = Math.max(...dependsOn.map((dep) => stageByAgentId.get(dep) || 0));
      stageIndex = maxDepStage + 1;
    }

    stageByAgentId.set(agent.agentId, stageIndex);
    producedByType.set(agent.outputType, agent.agentId);

    const dependsOnStageIndexes = Array.from(new Set(dependsOn.map((id) => stageByAgentId.get(id))));
    const normalizedFee = Number(agent.pricePerTask || '0').toFixed(3);

    stages.push({
      stageIndex,
      agentId: agent.agentId,
      inputType: agent.inputType,
      outputType: agent.outputType,
      fee: normalizedFee,
      parallel: stageIndex === 0,
      ...(dependsOnStageIndexes.length ? { dependsOn: dependsOnStageIndexes } : {})
    });
  }

  return stages;
}

function buildBlueprint(taskBundle, selectedAgents, totalAgentFees, initialTypes, planner = {}) {
  const payload = taskBundle.payload || {};
  const taskId = payload.taskId || `task-${crypto.randomUUID()}`;
  const pipelineId = `pipeline-${crypto.randomUUID()}`;
  const stages = buildStages(selectedAgents, initialTypes);

  const routingPercent = Number(process.env.PLUMBER_ROUTING_FEE_PERCENT || process.env.PLUMBER_ROUTING_FEE || 8);
  const plumberRoutingFee = totalAgentFees * (routingPercent / 100);
  const totalCost = totalAgentFees + plumberRoutingFee;

  return {
    ucpVersion: '1.0',
    messageType: 'PIPELINE_BLUEPRINT',
    senderId: 'plumber-01',
    timestamp: new Date().toISOString(),
    payload: {
      pipelineId,
      taskId,
      assembledBy: 'plumber-01',
      planner: {
        mode: planner.mode || 'deterministic',
        provider: planner.provider || 'local',
        ...(planner.model ? { model: planner.model } : {}),
        ...(planner.reason ? { reason: planner.reason } : {})
      },
      stages,
      totalAgentFees: totalAgentFees.toFixed(3),
      plumberRoutingFee: plumberRoutingFee.toFixed(3),
      totalCost: totalCost.toFixed(3)
    }
  };
}

function buildPipelineFailed(taskBundle, reason) {
  const taskId = taskBundle && taskBundle.payload ? taskBundle.payload.taskId : null;
  return {
    ucpVersion: '1.0',
    messageType: 'PIPELINE_FAILED',
    senderId: 'plumber-01',
    timestamp: new Date().toISOString(),
    payload: {
      taskId,
      reason: String(reason || 'No valid pipeline found')
    }
  };
}

async function assemblePipeline(manifestsMap, taskBundle) {
  const manifests = Array.from(manifestsMap.values());
  const plannerMode = String(process.env.PLUMBER_PLANNER_MODE || 'llm').toLowerCase();

  let result = null;
  let warning = null;

  if (plannerMode !== 'deterministic') {
    const llmPlan = await findLlmPlan(manifests, taskBundle);
    if (llmPlan.ok) {
      result = llmPlan;
    } else {
      warning = `LLM planner fallback: ${llmPlan.error}`;
    }
  }

  if (!result) {
    result = findCheapestPlan(manifests, taskBundle);
  }

  if (!result) {
    return {
      ok: false,
      message: buildPipelineFailed(taskBundle, 'No valid pipeline found within budget and type constraints'),
      planner: {
        mode: 'deterministic',
        provider: 'local',
        model: null,
        reason: 'No valid plan found'
      },
      warning
    };
  }

  const blueprint = buildBlueprint(taskBundle, result.selectedAgents, result.totalAgentFees, result.initialTypes, result.planner);
  return {
    ok: true,
    message: blueprint,
    planner: result.planner,
    ...(warning ? { warning } : {})
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const taskIdx = args.indexOf('--task-bundle-json');
  if (taskIdx === -1 || !args[taskIdx + 1]) {
    console.error('Usage: node plumber-assemble.js --task-bundle-json "{...}"');
    process.exit(1);
  }
  console.error('CLI mode requires integration context. Use plumber-loop.js or import assemblePipeline().');
  process.exit(1);
}

module.exports = {
  assemblePipeline,
  deriveInitialTypes,
  splitTypes,
  parseFee
};
