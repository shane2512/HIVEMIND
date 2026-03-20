import React from 'react';

function stat(label, value) {
  return { label, value };
}

export default function StatsBar({ data }) {
  const items = [
    stat('Agents', data.agentCount),
    stat('Active Pipelines', data.activePipelines),
    stat('Completed Pipelines', data.completedPipelines),
    stat('PIPE Settled', data.pipeSettled),
    stat('Reports', data.reportCount),
    stat('Planner', data.plannerMode)
  ];

  return (
    <section className="statsBar">
      {items.map((item) => (
        <div key={item.label} className="statCard">
          <span className="statLabel">{item.label}</span>
          <strong className="statValue">{item.value}</strong>
        </div>
      ))}
    </section>
  );
}
