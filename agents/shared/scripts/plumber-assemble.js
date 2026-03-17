require('dotenv').config();
const crypto = require('crypto');

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

function findCheapestPlan(manifests, taskBundle) {
  const payload = taskBundle && taskBundle.payload ? taskBundle.payload : {};
  const requiredOutputType = String(payload.requiredOutputType || '').trim();
  if (!requiredOutputType) {
    throw new Error('TASK_BUNDLE missing payload.requiredOutputType');
  }

  const maxBudget = parseFee(payload.maxBudget || '0');
  const initialTypes = deriveInitialTypes(taskBundle);

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
    initialTypes
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

function buildBlueprint(taskBundle, selectedAgents, totalAgentFees, initialTypes) {
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

function assemblePipeline(manifestsMap, taskBundle) {
  const manifests = Array.from(manifestsMap.values());
  const result = findCheapestPlan(manifests, taskBundle);
  if (!result) {
    return {
      ok: false,
      message: buildPipelineFailed(taskBundle, 'No valid pipeline found within budget and type constraints')
    };
  }

  const blueprint = buildBlueprint(taskBundle, result.selectedAgents, result.totalAgentFees, result.initialTypes);
  return {
    ok: true,
    message: blueprint
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
