const REQUIRED_FIELDS = ['ucpVersion', 'messageType', 'senderId', 'timestamp', 'payload'];

const VALID_MESSAGE_TYPES = [
  'AGENT_MANIFEST',
  'TASK_BUNDLE',
  'PIPELINE_BLUEPRINT',
  'TASK_ASSIGNMENT',
  'TASK_ATTESTATION',
  'HIVE_REPORT',
  'PIPELINE_COMPLETE',
  'PIPELINE_FAILED',
  'BLACKLIST_UPDATE',
  'BLACKLIST_ENTRY'
];

function validateUCPMessage(msg) {
  for (const field of REQUIRED_FIELDS) {
    if (msg[field] === undefined || msg[field] === null) {
      throw new Error(`Missing UCP field: ${field}`);
    }
  }
  if (msg.ucpVersion !== '1.0') {
    throw new Error(`Unsupported UCP version: ${msg.ucpVersion}`);
  }
  if (!VALID_MESSAGE_TYPES.includes(msg.messageType)) {
    throw new Error(`Unknown messageType: ${msg.messageType}`);
  }
  return true;
}

function buildUCPMessage(messageType, senderId, payload) {
  return {
    ucpVersion: '1.0',
    messageType,
    senderId,
    timestamp: new Date().toISOString(),
    payload
  };
}

module.exports = { validateUCPMessage, buildUCPMessage, VALID_MESSAGE_TYPES };
