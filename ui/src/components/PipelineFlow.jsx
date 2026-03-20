import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';

function shortLabel(agentId) {
  const labels = {
    'watcher-01': 'Watcher',
    'plumber-01': 'Plumber',
    'wallet-analyst-01': 'Wallet',
    'sentiment-01': 'Sentiment',
    'liquidity-01': 'Liquidity',
    'risk-scorer-01': 'Risk',
    'report-publisher-01': 'Report'
  };
  return labels[agentId] || agentId;
}

function statusColor(state) {
  if (state === 'DONE') {
    return {
      background: 'rgba(73, 209, 125, 0.2)',
      border: '1px solid rgba(73, 209, 125, 0.65)',
      boxShadow: '0 0 0 1px rgba(73, 209, 125, 0.25) inset'
    };
  }

  if (state === 'ACTIVE') {
    return {
      background: 'rgba(83, 200, 255, 0.2)',
      border: '1px solid rgba(83, 200, 255, 0.65)',
      boxShadow: '0 0 0 1px rgba(83, 200, 255, 0.25) inset, 0 0 14px rgba(83, 200, 255, 0.18)'
    };
  }

  return {
    background: 'rgba(160, 173, 195, 0.12)',
    border: '1px solid rgba(45, 63, 98, 0.9)'
  };
}

function deriveFlowStates(pipeline) {
  const states = new Map();
  states.set('watcher-01', pipeline.stageStates['watcher-01'] || 'PENDING');
  states.set('plumber-01', pipeline.stageStates['plumber-01'] || 'PENDING');

  const orderedStages = pipeline.stages
    .slice()
    .sort((a, b) => Number(a.stageIndex || 0) - Number(b.stageIndex || 0));

  for (const stage of orderedStages) {
    states.set(stage.agentId, pipeline.stageStates[stage.agentId] || 'PENDING');
  }

  if (pipeline.status !== 'ACTIVE') {
    return states;
  }

  if (states.get('watcher-01') !== 'DONE') {
    states.set('watcher-01', 'ACTIVE');
    return states;
  }

  if (states.get('plumber-01') !== 'DONE') {
    states.set('plumber-01', 'ACTIVE');
    return states;
  }

  const groupedByStageIndex = new Map();
  for (const stage of orderedStages) {
    const idx = Number(stage.stageIndex || 0);
    if (!groupedByStageIndex.has(idx)) {
      groupedByStageIndex.set(idx, []);
    }
    groupedByStageIndex.get(idx).push(stage.agentId);
  }

  const indexes = Array.from(groupedByStageIndex.keys()).sort((a, b) => a - b);

  for (const idx of indexes) {
    const ids = groupedByStageIndex.get(idx) || [];
    const pendingIds = ids.filter((id) => states.get(id) !== 'DONE');
    if (!pendingIds.length) {
      continue;
    }

    for (const id of pendingIds) {
      states.set(id, 'ACTIVE');
    }

    return states;
  }

  return states;
}

function buildGraph(pipeline) {
  const states = deriveFlowStates(pipeline);
  const stageGroups = new Map();

  for (const stage of pipeline.stages) {
    const idx = Number(stage.stageIndex || 0);
    if (!stageGroups.has(idx)) {
      stageGroups.set(idx, []);
    }
    stageGroups.get(idx).push(stage);
  }

  const stageIndexes = Array.from(stageGroups.keys()).sort((a, b) => a - b);
  const stageIdsByIndex = new Map();
  const nodes = [];
  const edges = [];
  let edgeCounter = 0;

  const makeNode = (id, label, detail, x, y) => {
    const state = states.get(id) || 'PENDING';
    const palette = statusColor(state);
    return {
      id,
      position: { x, y },
      data: {
        label: (
          <div className="rfNodeLabel">
            <strong>{label}</strong>
            <span>{detail}</span>
            <span>{state}</span>
          </div>
        )
      },
      style: {
        width: 190,
        borderRadius: 12,
        color: '#eaf0ff',
        fontSize: 12,
        transition: 'all 220ms ease',
        ...palette
      }
    };
  };

  nodes.push(makeNode('watcher-01', 'Watcher', pipeline.taskId || '-', 20, 120));
  nodes.push(makeNode('plumber-01', 'Plumber', pipeline.plannerMode || 'unknown', 250, 120));

  edges.push({
    id: `edge-${edgeCounter++}`,
    source: 'watcher-01',
    target: 'plumber-01',
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: states.get('plumber-01') === 'ACTIVE'
  });

  stageIndexes.forEach((index, groupPosition) => {
    const group = stageGroups.get(index);
    const x = 500 + (groupPosition * 300);
    const startY = 120 - (((group.length - 1) * 120) / 2);
    const ids = [];

    group.forEach((stage, stagePosition) => {
      const id = stage.agentId;
      ids.push(id);
      nodes.push(makeNode(id, shortLabel(id), `fee ${stage.fee || '-'}`, x, startY + (stagePosition * 120)));
    });

    stageIdsByIndex.set(index, ids);
  });

  if (stageIndexes.length) {
    for (const targetId of stageIdsByIndex.get(stageIndexes[0]) || []) {
      edges.push({
        id: `edge-${edgeCounter++}`,
        source: 'plumber-01',
        target: targetId,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: states.get(targetId) === 'ACTIVE'
      });
    }
  }

  stageIndexes.forEach((index, groupPosition) => {
    const currentGroup = stageGroups.get(index);

    currentGroup.forEach((stage) => {
      const targetId = stage.agentId;
      const deps = Array.isArray(stage.dependsOn) ? stage.dependsOn : [];

      if (deps.length) {
        deps.forEach((dep) => {
          for (const sourceId of stageIdsByIndex.get(Number(dep)) || []) {
            edges.push({
              id: `edge-${edgeCounter++}`,
              source: sourceId,
              target: targetId,
              markerEnd: { type: MarkerType.ArrowClosed },
              animated: states.get(targetId) === 'ACTIVE'
            });
          }
        });
        return;
      }

      if (groupPosition === 0) {
        return;
      }

      const prevIndex = stageIndexes[groupPosition - 1];
      for (const sourceId of stageIdsByIndex.get(prevIndex) || []) {
        edges.push({
          id: `edge-${edgeCounter++}`,
          source: sourceId,
          target: targetId,
          markerEnd: { type: MarkerType.ArrowClosed },
          animated: states.get(targetId) === 'ACTIVE'
        });
      }
    });
  });

  return { nodes, edges };
}

export default function PipelineFlow({ pipeline }) {
  const graph = useMemo(() => {
    if (!pipeline) {
      return { nodes: [], edges: [] };
    }
    return buildGraph(pipeline);
  }, [pipeline]);

  if (!pipeline) {
    return (
      <section className="panel flowPanel">
        <header className="panelHeader">
          <h2>Pipeline React Flow</h2>
          <span className="pill">No pipeline yet</span>
        </header>
        <div className="flowEmpty">No PIPELINE_BLUEPRINT messages found on task topic.</div>
      </section>
    );
  }

  return (
    <section className="panel flowPanel">
      <header className="panelHeader">
        <h2>Pipeline React Flow</h2>
        <span className="pill">{pipeline.pipelineId}</span>
      </header>

      <div className="reactFlowWrap">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Background gap={20} color="#223454" />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>

      <div className="flowLegend">
        <span className="legendDone">done</span>
        <span className="legendActive">active</span>
        <span className="legendPending">pending</span>
      </div>
    </section>
  );
}
