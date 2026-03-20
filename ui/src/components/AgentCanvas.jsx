import React from 'react';

const FLOW = [
  ['watcher-01', 'plumber-01'],
  ['plumber-01', 'wallet-analyst-01'],
  ['plumber-01', 'sentiment-01'],
  ['plumber-01', 'liquidity-01'],
  ['wallet-analyst-01', 'risk-scorer-01'],
  ['sentiment-01', 'risk-scorer-01'],
  ['liquidity-01', 'risk-scorer-01'],
  ['risk-scorer-01', 'report-publisher-01']
];

function statusClass(status) {
  if (status === 'ACTIVE') return 'nodeActive';
  if (status === 'ATTESTING') return 'nodeAttesting';
  if (status === 'SETTLED') return 'nodeSettled';
  if (status === 'ERROR') return 'nodeError';
  return 'nodeIdle';
}

export default function AgentCanvas({ nodeState, pipelineMeta }) {
  const ids = [
    'watcher-01',
    'plumber-01',
    'wallet-analyst-01',
    'sentiment-01',
    'liquidity-01',
    'risk-scorer-01',
    'report-publisher-01'
  ];

  return (
    <section className="panel canvasPanel">
      <header className="panelHeader">
        <h2>Agent Flow</h2>
        <span className="pill">{pipelineMeta}</span>
      </header>

      <div className="flowEdges">
        {FLOW.map(([a, b]) => (
          <div key={`${a}-${b}`} className="edgeRow">
            <span>{a}</span>
            <span className="edgeArrow">-&gt;</span>
            <span>{b}</span>
          </div>
        ))}
      </div>

      <div className="nodeGrid">
        {ids.map((id) => (
          <div key={id} className={`nodeCard ${statusClass(nodeState[id] || 'IDLE')}`}>
            <span className="nodeId">{id}</span>
            <strong className="nodeStatus">{nodeState[id] || 'IDLE'}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
