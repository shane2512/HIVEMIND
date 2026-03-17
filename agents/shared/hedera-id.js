function parseHederaId(id) {
  const parts = String(id).split(".");
  if (parts.length !== 3) {
    throw new Error(`Invalid Hedera ID format: ${id}`);
  }

  const shard = BigInt(parts[0]);
  const realm = BigInt(parts[1]);
  const num = BigInt(parts[2]);
  return { shard, realm, num };
}

function hederaIdToEvmAddress(id) {
  const { shard, realm, num } = parseHederaId(id);
  const packed = (shard << 96n) | (realm << 64n) | num;
  return `0x${packed.toString(16).padStart(40, "0")}`;
}

function pipeAmountToTinyUnits(amount, decimals = 6) {
  const amountStr = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(amountStr)) {
    throw new Error(`Invalid PIPE amount: ${amount}`);
  }

  const [wholeRaw, fracRaw = ""] = amountStr.split(".");
  const frac = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
  return (BigInt(wholeRaw) * (10n ** BigInt(decimals))) + BigInt(frac);
}

module.exports = {
  hederaIdToEvmAddress,
  pipeAmountToTinyUnits
};