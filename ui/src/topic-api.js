const DEFAULT_MIRROR = 'https://testnet.mirrornode.hedera.com';

export function getMirrorBase() {
  return (import.meta.env.VITE_MIRROR_NODE_URL || DEFAULT_MIRROR).replace(/\/$/, '');
}

function decodeMessagePayload(value) {
  const raw = String(value || '');
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeMessagePayloadBytes(value) {
  const raw = String(value || '');
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

function concatUint8Arrays(arrays) {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;

  for (const arr of arrays) {
    merged.set(arr, offset);
    offset += arr.length;
  }

  return merged;
}

function decodeMirrorMessage(base64) {
  const raw = decodeMessagePayload(base64);
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function chunkKey(rawMsg) {
  const info = rawMsg && rawMsg.chunk_info && rawMsg.chunk_info.initial_transaction_id;
  if (!info) {
    return null;
  }
  return `${info.account_id}|${info.transaction_valid_start}|${info.nonce || 0}|${info.scheduled ? 1 : 0}`;
}

function decodeRawMirrorMessages(rawMessages) {
  const asc = [...rawMessages].sort((a, b) => Number(a.sequence_number || 0) - Number(b.sequence_number || 0));
  const chunks = new Map();
  const decoded = [];

  for (const msg of asc) {
    const chunkInfo = msg.chunk_info;
    const total = Number(chunkInfo && chunkInfo.total ? chunkInfo.total : 1);

    if (total <= 1) {
      decoded.push({
        sequenceNumber: Number(msg.sequence_number || 0),
        consensusTimestamp: msg.consensus_timestamp,
        message: decodeMirrorMessage(msg.message)
      });
      continue;
    }

    const key = chunkKey(msg);
    if (!key) {
      decoded.push({
        sequenceNumber: Number(msg.sequence_number || 0),
        consensusTimestamp: msg.consensus_timestamp,
        message: decodeMirrorMessage(msg.message)
      });
      continue;
    }

    if (!chunks.has(key)) {
      chunks.set(key, {
        total,
        parts: new Map(),
        lastSequenceNumber: Number(msg.sequence_number || 0),
        lastConsensusTimestamp: msg.consensus_timestamp
      });
    }

    const entry = chunks.get(key);
    entry.parts.set(Number(chunkInfo.number || 1), msg.message);

    const seq = Number(msg.sequence_number || 0);
    if (seq >= entry.lastSequenceNumber) {
      entry.lastSequenceNumber = seq;
      entry.lastConsensusTimestamp = msg.consensus_timestamp;
    }

    if (entry.parts.size !== entry.total) {
      continue;
    }

    const partBytes = [];
    let complete = true;
    for (let i = 1; i <= entry.total; i += 1) {
      const part = entry.parts.get(i);
      if (!part) {
        complete = false;
        break;
      }
      partBytes.push(decodeMessagePayloadBytes(part));
    }

    if (!complete) {
      continue;
    }

    const fullText = new TextDecoder().decode(concatUint8Arrays(partBytes));
    let parsed;
    try {
      parsed = JSON.parse(fullText);
    } catch {
      parsed = fullText;
    }

    decoded.push({
      sequenceNumber: entry.lastSequenceNumber,
      consensusTimestamp: entry.lastConsensusTimestamp,
      message: parsed
    });

    chunks.delete(key);
  }

  decoded.sort((a, b) => Number(b.sequenceNumber || 0) - Number(a.sequenceNumber || 0));
  return decoded;
}

export async function readTopicMessages(topicId, limit = 60) {
  if (!topicId) {
    return [];
  }

  const url = `${getMirrorBase()}/api/v1/topics/${topicId}/messages?limit=${limit}&order=desc`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Mirror request failed ${res.status}`);
  }
  const data = await res.json();

  return decodeRawMirrorMessages(data.messages || []);
}

export function getTopics() {
  return {
    taskTopic: import.meta.env.VITE_HCS_TASK_TOPIC || '',
    attTopic: import.meta.env.VITE_HCS_ATTESTATION_TOPIC || '',
    reportTopic: import.meta.env.VITE_HCS_REPORT_TOPIC || '',
    registryTopic: import.meta.env.VITE_HCS_REGISTRY_TOPIC || ''
  };
}
