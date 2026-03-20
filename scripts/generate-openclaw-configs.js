#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');

const AGENTS = [
  'watcher',
  'plumber',
  'wallet-analyst',
  'sentiment',
  'liquidity',
  'risk-scorer',
  'report-publisher'
];

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
  };

  const has = (flag) => args.includes(flag);

  const root = path.resolve(get('--root', process.cwd()));
  const outputDir = path.resolve(root, get('--output-dir', 'openclaw-configs'));
  const apply = has('--no-apply') ? false : true;

  return {
    root,
    outputDir,
    apply
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readEnvFile(rootDir) {
  const envPath = path.join(rootDir, '.env');
  const map = new Map();
  if (!fs.existsSync(envPath)) {
    return map;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      continue;
    }

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key) {
      map.set(key, value);
    }
  }

  return map;
}

function normalizeOllamaModel(raw) {
  const input = String(raw || '').trim();
  if (!input) {
    return 'phi3.5';
  }
  return input.startsWith('ollama/') ? input.slice('ollama/'.length) : input;
}

function resolveModel(envMap) {
  const raw = envMap.get('OLLAMA_MODEL') || envMap.get('PLANNER_MODEL') || process.env.OLLAMA_MODEL || process.env.PLANNER_MODEL || 'phi3.5';
  const normalized = normalizeOllamaModel(raw);
  return `ollama/${normalized}`;
}

function createConfig({ model, workspaceDir }) {
  return {
    meta: {
      lastTouchedVersion: '2026.3.11',
      lastTouchedAt: new Date().toISOString()
    },
    agents: {
      defaults: {
        model: {
          primary: model
        },
        workspace: workspaceDir
      }
    },
    commands: {
      native: 'auto',
      nativeSkills: 'auto',
      restart: true,
      ownerDisplay: 'raw'
    }
  };
}

function main() {
  const options = parseArgs();
  const envMap = readEnvFile(options.root);
  const model = resolveModel(envMap);

  ensureDir(options.outputDir);

  const results = [];
  for (const agent of AGENTS) {
    const profileDir = path.join(os.homedir(), `.openclaw-${agent}`);
    const workspaceDir = path.join(profileDir, 'workspace');

    const config = createConfig({ model, workspaceDir });

    const artifactFile = path.join(options.outputDir, `${agent}.openclaw.json`);
    fs.writeFileSync(artifactFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

    let appliedPath = null;
    if (options.apply) {
      ensureDir(profileDir);
      ensureDir(workspaceDir);
      const profileConfigPath = path.join(profileDir, 'openclaw.json');
      fs.writeFileSync(profileConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
      appliedPath = profileConfigPath;
    }

    results.push({
      agent,
      model,
      artifactFile,
      appliedPath,
      workspaceDir
    });
  }

  console.log(JSON.stringify({
    ok: true,
    generatedAt: new Date().toISOString(),
    model,
    apply: options.apply,
    count: results.length,
    results
  }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }
}

module.exports = {
  AGENTS,
  resolveModel,
  createConfig
};
