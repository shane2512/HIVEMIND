import React from 'react';

function rowLabel(m) {
  if (!m || !m.message) return 'UNKNOWN';
  return m.message.messageType || 'UNKNOWN';
}

export default function HCSFeed({ items }) {
  return (
    <section className="panel feedPanel">
      <header className="panelHeader">
        <h2>HCS Live Feed</h2>
        <span className="pill">{items.length} events</span>
      </header>

      <div className="feedList">
        {items.map((m, idx) => {
          const payload = m.message && m.message.payload ? m.message.payload : {};
          return (
            <article key={`${m.sequenceNumber}-${idx}`} className="feedItem">
              <div className="feedTop">
                <strong>{rowLabel(m)}</strong>
                <span>seq {m.sequenceNumber}</span>
              </div>
              <div className="feedMeta">
                <span>{payload.pipelineId || payload.taskId || '-'}</span>
                <span>{m.consensusTimestamp || '-'}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
