const { upsertEnvValues, requireEnv } = require('../agents/shared/env-utils');

function parseHederaId(id) {
  const parts = String(id).split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid Hedera ID: ${id}`);
  }

  return {
    shard: BigInt(parts[0]),
    realm: BigInt(parts[1]),
    num: BigInt(parts[2])
  };
}

function hederaIdToEvmAddress(id) {
  const { shard, realm, num } = parseHederaId(id);
  const packed = (shard << 96n) | (realm << 64n) | num;
  return `0x${packed.toString(16).padStart(40, '0')}`;
}

module.exports = {
  upsertEnvValues,
  requireEnv,
  hederaIdToEvmAddress
};