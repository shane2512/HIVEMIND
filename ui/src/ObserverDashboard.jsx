import React, { useCallback, useEffect, useMemo, useState } from 'react';
import StatsBar from './components/StatsBar';
import HCSFeed from './components/HCSFeed';
import PipelineFlow from './components/PipelineFlow';
import { getTopics, readTopicMessages } from './topic-api';

const POLL_MS = 4000;

function toMs(iso) {
  const n = Date.parse(String(iso || ''));
  return Number.isFinite(n) ? n : null;
}

function toReadableTime(ts) {
  const n = Date.parse(String(ts || ''));
  if (!Number.isFinite(n)) {
    return '-';
  }
  return new Date(n).toLocaleString();
}

function classifyMessageType(type) {
  if (type === 'TASK_ATTESTATION') {
    return 'att';
  }
  if (type === 'HIVE_REPORT') {
    return 'report';
  }
  return 'task';
}

function inferNodeState(pipeline) {
  const state = {
    'watcher-01': 'IDLE',
    'plumber-01': 'IDLE',
    'wallet-analyst-01': 'IDLE',
    'sentiment-01': 'IDLE',
    'liquidity-01': 'IDLE',
    'risk-scorer-01': 'IDLE',
    'report-publisher-01': 'IDLE'
  };

  if (!pipeline) {
    return state;
  }

  const ordered = [
    'watcher-01',
    'plumber-01',
    ...pipeline.stages
      .slice()
      .sort((a, b) => Number(a.stageIndex || 0) - Number(b.stageIndex || 0))
      .map((stage) => stage.agentId)
      .filter(Boolean)
  ];

  let activeAssigned = false;
  for (const id of ordered) {
    const stageState = pipeline.stageStates[id] || 'PENDING';
    if (stageState === 'DONE') {
      state[id] = 'SETTLED';
      continue;
    }

    if (!activeAssigned && pipeline.status === 'ACTIVE') {
      state[id] = 'ACTIVE';
      activeAssigned = true;
    }
  }

  if (pipeline.status === 'COMPLETED') {
    Object.keys(state).forEach((id) => {
      if (state[id] !== 'ERROR') {
        state[id] = 'SETTLED';
      }
    });
  }

  return state;
}

function buildPipelines(taskMsgs, attMsgs, reportMsgs) {
  const bundlesByTaskId = new Map();
  for (const msg of taskMsgs) {
    if (msg.message?.messageType !== 'TASK_BUNDLE') continue;
    const taskId = msg.message?.payload?.taskId;
    if (!taskId) continue;
    bundlesByTaskId.set(taskId, msg);
  }

  const reportsByPipeline = new Map();
  for (const msg of reportMsgs) {
    if (msg.message?.messageType !== 'HIVE_REPORT') continue;
    const pipelineId = msg.message?.payload?.pipelineId;
    if (!pipelineId || reportsByPipeline.has(pipelineId)) continue;
    reportsByPipeline.set(pipelineId, msg);
  }

  const completeByPipeline = new Map();
  for (const msg of taskMsgs) {
    if (msg.message?.messageType !== 'PIPELINE_COMPLETE') continue;
    const pipelineId = msg.message?.payload?.pipelineId;
    if (!pipelineId || completeByPipeline.has(pipelineId)) continue;
    completeByPipeline.set(pipelineId, msg);
  }

  const attestedAgentsByPipeline = new Map();
  for (const msg of attMsgs) {
    if (msg.message?.messageType !== 'TASK_ATTESTATION') continue;
    const pipelineId = msg.message?.payload?.pipelineId;
    const agentId = msg.message?.payload?.agentId;
    if (!pipelineId || !agentId) continue;

    if (!attestedAgentsByPipeline.has(pipelineId)) {
      attestedAgentsByPipeline.set(pipelineId, new Set());
    }
    attestedAgentsByPipeline.get(pipelineId).add(agentId);
  }

  const blueprintMessages = taskMsgs
    .filter((msg) => msg.message?.messageType === 'PIPELINE_BLUEPRINT' && msg.message?.payload?.pipelineId)
    .slice()
    .sort((a, b) => Number(b.sequenceNumber || 0) - Number(a.sequenceNumber || 0));

  const pipelines = [];
  const seen = new Set();

  for (const blueprint of blueprintMessages) {
    const payload = blueprint.message?.payload || {};
    const pipelineId = payload.pipelineId;
    const taskId = payload.taskId || null;

    if (!pipelineId || seen.has(pipelineId)) {
      continue;
    }
    seen.add(pipelineId);

    const stages = Array.isArray(payload.stages) ? payload.stages : [];
    const attestedAgents = attestedAgentsByPipeline.get(pipelineId) || new Set();
    const report = reportsByPipeline.get(pipelineId) || null;
    const complete = completeByPipeline.get(pipelineId) || null;
    const bundle = taskId ? bundlesByTaskId.get(taskId) || null : null;

    const stageStates = {
      // Blueprint existence implies watcher already emitted a TASK_BUNDLE.
      'watcher-01': 'DONE',
      'plumber-01': 'DONE'
    };

    for (const stage of stages) {
      const agentId = stage.agentId;
      if (!agentId) continue;

      const isDone =
        attestedAgents.has(agentId) ||
        (agentId === 'report-publisher-01' && (Boolean(report) || Boolean(complete)));

      stageStates[agentId] = isDone ? 'DONE' : 'PENDING';
    }

    const bundleTs = toMs(bundle?.message?.timestamp);
    const blueprintTs = toMs(blueprint?.message?.timestamp);
    const reportTs = toMs(report?.message?.timestamp);
    const completeTs = toMs(complete?.message?.timestamp);
    const safeDelta = (a, b) => (a && b ? a - b : null);

    pipelines.push({
      pipelineId,
      taskId,
      plannerMode: payload.planner?.mode || 'unknown',
      status: complete ? 'COMPLETED' : 'ACTIVE',
      stages,
      stageStates,
      latencies: {
        watcherToBlueprintMs: safeDelta(blueprintTs, bundleTs),
        bundleToReportMs: safeDelta(reportTs, bundleTs),
        bundleToCompleteMs: safeDelta(completeTs, bundleTs)
      }
    });
  }

  return pipelines;
}

function computeStats(taskMsgs, reportMsgs, pipelines) {
  const complete = taskMsgs.filter((m) => m.message?.messageType === 'PIPELINE_COMPLETE');
  const reports = reportMsgs.filter((m) => m.message?.messageType === 'HIVE_REPORT');

  let settled = 0;
  for (const p of complete) {
    const v = Number(p.message?.payload?.totalPipeSettled || 0);
    if (Number.isFinite(v)) settled += v;
  }

  const plannerMode = pipelines.length ? pipelines[0].plannerMode : 'unknown';

  return {
    agentCount: 7,
    activePipelines: pipelines.filter((pipeline) => pipeline.status === 'ACTIVE').length,
    completedPipelines: complete.length,
    pipeSettled: settled.toFixed(3),
    reportCount: reports.length,
    plannerMode
  };
}

function buildReportPosts(reportMsgs, pipelineById) {
  return reportMsgs
    .filter((m) => m.message?.messageType === 'HIVE_REPORT')
    .sort((a, b) => Number(b.sequenceNumber || 0) - Number(a.sequenceNumber || 0))
    .map((msg) => {
      const payload = msg.message?.payload || {};
      const pipeline = pipelineById.get(payload.pipelineId);
      const riskLabel = String(payload.riskLabel || 'UNKNOWN');
      const riskScore = Number(payload.riskScore || 0);
      const tokenLabel = payload.tokenSymbol || payload.tokenName || payload.tokenId || 'Unknown token';

      const headline = `${tokenLabel} / ${riskLabel} risk`;
      const enhancedNarrative = [
        payload.summary || 'No summary available.',
        payload.reasoning && payload.reasoning.source === 'llm'
          ? 'Narrative quality boosted by model reasoning before publication.'
          : 'Narrative produced through deterministic fallback path.'
      ].join(' ');

      return {
        id: `${payload.reportId || payload.pipelineId || 'report'}-${msg.sequenceNumber}`,
        headline,
        pipelineId: payload.pipelineId || '-',
        taskId: pipeline ? pipeline.taskId : '-',
        plannerMode: pipeline ? pipeline.plannerMode : 'unknown',
        riskLabel,
        riskScore: Number.isFinite(riskScore) ? riskScore : 0,
        postedAt: msg.message?.timestamp || null,
        sequenceNumber: msg.sequenceNumber,
        narrative: enhancedNarrative,
        tags: [
          `risk:${riskLabel.toLowerCase()}`,
          `score:${Number.isFinite(riskScore) ? riskScore : 'n/a'}`,
          `planner:${pipeline ? pipeline.plannerMode : 'unknown'}`,
          payload.reasoning && payload.reasoning.source ? `source:${payload.reasoning.source}` : 'source:unknown'
        ]
      };
    });
}

function toPipelineSnapshot(pipeline) {
  if (!pipeline) {
    return null;
  }

  return {
    taskId: pipeline.taskId,
    pipelineId: pipeline.pipelineId,
    plannerMode: pipeline.plannerMode,
    complete: pipeline.status === 'COMPLETED',
    stageStates: pipeline.stageStates,
    latencies: pipeline.latencies
  };
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function ObserverDashboard() {
  const [taskMsgs, setTaskMsgs] = useState([]);
  const [attMsgs, setAttMsgs] = useState([]);
  const [reportMsgs, setReportMsgs] = useState([]);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [pollMs, setPollMs] = useState(POLL_MS);
  const [feedFilter, setFeedFilter] = useState('all');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [activeTab, setActiveTab] = useState('reports');

  const topics = useMemo(() => getTopics(), []);

  const loadData = useCallback(async () => {
    if (!topics.taskTopic || !topics.attTopic || !topics.reportTopic) {
      throw new Error('Missing VITE_HCS_TASK_TOPIC, VITE_HCS_ATTESTATION_TOPIC, or VITE_HCS_REPORT_TOPIC in ui/.env.local');
    }

    const [tasks, atts, reports] = await Promise.all([
      readTopicMessages(topics.taskTopic, 80),
      readTopicMessages(topics.attTopic, 120),
      readTopicMessages(topics.reportTopic, 60)
    ]);

    setTaskMsgs(tasks);
    setAttMsgs(atts);
    setReportMsgs(reports);
    setError('');
    setLastUpdatedAt(new Date().toISOString());
  }, [topics]);

  useEffect(() => {
    let cancelled = false;
    let id = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        await loadData();
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load topic data');
        }
      }
    };

    tick();
    if (autoRefresh) {
      id = setInterval(tick, pollMs);
    }

    return () => {
      cancelled = true;
      if (id) clearInterval(id);
    };
  }, [autoRefresh, pollMs, loadData]);

  const pipelines = useMemo(
    () => buildPipelines(taskMsgs, attMsgs, reportMsgs),
    [taskMsgs, attMsgs, reportMsgs]
  );

  useEffect(() => {
    if (!pipelines.length) {
      setSelectedPipelineId('');
      return;
    }

    const preferred = pipelines.find((pipeline) => pipeline.status === 'ACTIVE') || pipelines[0];
    const hasSelected = pipelines.some((pipeline) => pipeline.pipelineId === selectedPipelineId);
    if (!hasSelected) {
      setSelectedPipelineId(preferred.pipelineId);
    }
  }, [pipelines, selectedPipelineId]);

  const selectedPipeline = useMemo(() => {
    if (!pipelines.length) {
      return null;
    }
    return pipelines.find((pipeline) => pipeline.pipelineId === selectedPipelineId) || pipelines[0];
  }, [pipelines, selectedPipelineId]);

  const nodeState = useMemo(
    () => inferNodeState(selectedPipeline),
    [selectedPipeline]
  );

  const pipelineById = useMemo(() => {
    const map = new Map();
    for (const pipeline of pipelines) {
      map.set(pipeline.pipelineId, pipeline);
    }
    return map;
  }, [pipelines]);

  const reportPosts = useMemo(
    () => buildReportPosts(reportMsgs, pipelineById),
    [reportMsgs, pipelineById]
  );

  const stats = useMemo(
    () => computeStats(taskMsgs, reportMsgs, pipelines),
    [taskMsgs, reportMsgs, pipelines]
  );

  const pipelineSnapshot = useMemo(
    () => toPipelineSnapshot(selectedPipeline),
    [selectedPipeline]
  );

  const latestPipelineId = pipelines.length ? pipelines[0].pipelineId : '-';
  const activePipelineIds = pipelines
    .filter((pipeline) => pipeline.status === 'ACTIVE')
    .map((pipeline) => pipeline.pipelineId);

  const feed = useMemo(() => {
    return [...taskMsgs.slice(0, 20), ...attMsgs.slice(0, 20), ...reportMsgs.slice(0, 20)]
      .sort((a, b) => Number(b.sequenceNumber || 0) - Number(a.sequenceNumber || 0))
      .slice(0, 30);
  }, [taskMsgs, attMsgs, reportMsgs]);

  const visibleFeed = useMemo(() => {
    if (feedFilter === 'all') {
      return feed;
    }
    return feed.filter((m) => classifyMessageType(m.message?.messageType) === feedFilter);
  }, [feed, feedFilter]);

  const selectedPipelineLogs = useMemo(() => {
    if (!selectedPipeline) {
      return visibleFeed;
    }

    return visibleFeed.filter((entry) => {
      const payload = entry && entry.message ? entry.message.payload || {} : {};
      if (payload.pipelineId && payload.pipelineId === selectedPipeline.pipelineId) {
        return true;
      }
      if (payload.taskId && payload.taskId === selectedPipeline.taskId) {
        return true;
      }
      return false;
    });
  }, [visibleFeed, selectedPipeline]);

  const handleExportSnapshot = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      topics,
      stats,
      latestPipelineId,
      activePipelineIds,
      snapshot: pipelineSnapshot,
      feed: visibleFeed
    };
    downloadJson(`observer-snapshot-${Date.now()}.json`, payload);
  };

  return (
    <main className="appShell">
      <header className="topBanner">
        <h1>HIVE MIND Observer</h1>
        <p>Read-only dashboard for autonomous agent flow, attestations, and settlement.</p>
      </header>

      <StatsBar data={stats} />

      <section className="pipelineBar">
        <div className="pipelineSummary">
          <span className="pill">latest {latestPipelineId}</span>
          <span className="pill">active {activePipelineIds.length ? activePipelineIds.join(', ') : 'none'}</span>
        </div>

        <div className="controlsGroup">
          <label>
            Pipeline
            <select
              value={selectedPipelineId}
              onChange={(e) => setSelectedPipelineId(e.target.value)}
              disabled={!pipelines.length}
            >
              {!pipelines.length ? <option value="">No pipelines</option> : null}
              {pipelines.map((pipeline) => (
                <option key={pipeline.pipelineId} value={pipeline.pipelineId}>
                  {pipeline.status} | {pipeline.pipelineId}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="controlsBar">
        <div className="controlsGroup">
          <button
            type="button"
            onClick={() => loadData().catch((err) => setError(err.message || 'Failed to load topic data'))}
          >
            Refresh now
          </button>
          <button type="button" onClick={handleExportSnapshot}>
            Export snapshot
          </button>
          <label>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            auto refresh
          </label>
        </div>

        <div className="controlsGroup">
          <label>
            Poll
            <select value={String(pollMs)} onChange={(e) => setPollMs(Number(e.target.value))}>
              <option value="2000">2s</option>
              <option value="4000">4s</option>
              <option value="8000">8s</option>
            </select>
          </label>
          <label>
            Feed
            <select value={feedFilter} onChange={(e) => setFeedFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="task">Task</option>
              <option value="att">Attestation</option>
              <option value="report">Report</option>
            </select>
          </label>
          <span className="lastUpdated">last update: {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : '-'}</span>
        </div>
      </section>

      {error ? <div className="errorBanner">Data error: {error}</div> : null}

      <section className="observerTabs">
        <button
          type="button"
          className={activeTab === 'reports' ? 'observerTabBtn active' : 'observerTabBtn'}
          onClick={() => setActiveTab('reports')}
        >
          Report Posts
        </button>
        <button
          type="button"
          className={activeTab === 'pipelines' ? 'observerTabBtn active' : 'observerTabBtn'}
          onClick={() => setActiveTab('pipelines')}
        >
          Pipeline & Logs
        </button>
      </section>

      {activeTab === 'reports' ? (
        <section className="postStream">
          {reportPosts.length === 0 ? (
            <article className="postCard emptyPost">
              <h2>No reports yet</h2>
              <p>When report-publisher posts HIVE_REPORT events, they will appear here as on-chain post cards.</p>
            </article>
          ) : (
            reportPosts.map((post) => (
              <article key={post.id} className="postCard">
                <header className="postHead">
                  <div>
                    <h2>{post.headline}</h2>
                    <p>{post.pipelineId} / task {post.taskId}</p>
                  </div>
                  <div className="postRisk">
                    <span className="postRiskLabel">{post.riskLabel}</span>
                    <strong>{post.riskScore}</strong>
                  </div>
                </header>
                <p className="postBody">{post.narrative}</p>
                <footer className="postMeta">
                  <span>posted {toReadableTime(post.postedAt)}</span>
                  <span>seq {post.sequenceNumber}</span>
                  <span>{post.plannerMode}</span>
                </footer>
                <div className="postTags">
                  {post.tags.map((tag) => (
                    <span key={`${post.id}-${tag}`}>{tag}</span>
                  ))}
                </div>
              </article>
            ))
          )}
        </section>
      ) : (
        <>
          <section className="pipelineTiming panel">
            <header className="panelHeader">
              <h2>Pipeline Timing</h2>
              <span className="pill">{selectedPipeline ? selectedPipeline.pipelineId : 'none'}</span>
            </header>
            <div className="pipelineTimingGrid">
              <div>
                <span>watcher-&gt;plumber</span>
                <strong>{pipelineSnapshot?.latencies?.watcherToBlueprintMs != null ? `${pipelineSnapshot.latencies.watcherToBlueprintMs} ms` : '-'}</strong>
              </div>
              <div>
                <span>bundle-&gt;report</span>
                <strong>{pipelineSnapshot?.latencies?.bundleToReportMs != null ? `${pipelineSnapshot.latencies.bundleToReportMs} ms` : '-'}</strong>
              </div>
              <div>
                <span>bundle-&gt;complete</span>
                <strong>{pipelineSnapshot?.latencies?.bundleToCompleteMs != null ? `${pipelineSnapshot.latencies.bundleToCompleteMs} ms` : '-'}</strong>
              </div>
            </div>
          </section>

          <section className="mainGrid">
            <PipelineFlow pipeline={selectedPipeline} nodeState={nodeState} />
            <HCSFeed items={selectedPipelineLogs} />
          </section>
        </>
      )}
    </main>
  );
}
