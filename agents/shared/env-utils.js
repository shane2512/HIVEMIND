const fs = require("fs");
const path = require("path");

function getEnvPath() {
  return path.resolve(process.cwd(), ".env");
}

function upsertEnvValues(values) {
  const envPath = getEnvPath();
  if (!fs.existsSync(envPath)) {
    throw new Error(".env file not found. Create it from .env.example first.");
  }

  const existing = fs.readFileSync(envPath, "utf8");
  const lines = existing.split(/\r?\n/);
  const keys = Object.keys(values);

  const seen = new Set();
  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      return line;
    }

    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    if (keys.includes(key)) {
      seen.add(key);
      return `${key}=${values[key]}`;
    }
    return line;
  });

  for (const key of keys) {
    if (!seen.has(key)) {
      updated.push(`${key}=${values[key]}`);
    }
  }

  fs.writeFileSync(envPath, `${updated.join("\n")}\n`, "utf8");
}

function requireEnv(keys) {
  const missing = keys.filter((key) => !process.env[key] || String(process.env[key]).trim() === "");
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

module.exports = {
  upsertEnvValues,
  requireEnv,
  getEnvPath
};