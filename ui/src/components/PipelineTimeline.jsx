import React from 'react';

const STAGES = [
  { id: 'watcher-01', label: 'Watcher' },
  { id: 'plumber-01', label: 'Plumber' },
  { id: 'wallet-analyst-01', label: 'Wallet' },
  { id: 'sentiment-01', label: 'Sentiment' },
  { id: 'liquidity-01', label: 'Liquidity' },
  { id: 'risk-scorer-01', label: 'Risk' },
  { id: 'report-publisher-01', label: 'Report' }
];

function classFor(status) {
  if (status === 'DONE') return 'timelineDone';
  if (status === 'PENDING') return 'timelinePending';
  return 'timelineUnknown';
}

export default function PipelineTimeline({ snapshot }) {
  if (!snapshot) {
    return (
      <section className="timelinePanel panel">
        <header className="panelHeader">
          <h2>Latest Pipeline</h2>
          <span className="pill">No pipeline detected yet</span>
        </header>
      </section>
    );
  }

  return (
    <section className="timelinePanel panel">
      <header className="panelHeader">
        <h2>Latest Pipeline</h2>
        <span className="pill">{snapshot.pipelineId}</span>
      </header>

      <div className="timelineMeta">
        <span>task {snapshot.taskId || '-'}</span>
        <span>planner {snapshot.plannerMode || 'unknown'}</span>
        <span>
          complete {snapshot.complete ? 'yes' : 'no'}
        </span>
      </div>

      <div className="timelineStages">
        {STAGES.map((stage) => {
          const state = snapshot.stageStates[stage.id] || 'UNKNOWN';
          return (
            <div key={stage.id} className={`timelineStage ${classFor(state)}`}>
              <span className="timelineStageLabel">{stage.label}</span>
              <strong>{state}</strong>
            </div>
          );
        })}
      </div>

      <div className="timelineMetrics">
        <div>
            <span>watcher-&gt;plumber</span>
          <strong>{snapshot.latencies.watcherToBlueprintMs ?? '-'} ms</strong>
        </div>
        <div>
            <span>bundle-&gt;report</span>
          <strong>{snapshot.latencies.bundleToReportMs ?? '-'} ms</strong>
        </div>
        <div>
            <span>bundle-&gt;complete</span>
          <strong>{snapshot.latencies.bundleToCompleteMs ?? '-'} ms</strong>
        </div>
      </div>
    </section>
  );
}
