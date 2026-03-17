const { PrivateKey } = require('@hashgraph/sdk');

function parsePrivateKey(keyValue) {
  const key = String(keyValue || '').trim();
  if (!key) {
    throw new Error('Private key is missing');
  }

  if (key.startsWith('0x')) {
    return PrivateKey.fromStringECDSA(key);
  }

  return PrivateKey.fromString(key);
}

module.exports = {
  parsePrivateKey
};