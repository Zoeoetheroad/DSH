/* Host half of the MCP manager.
 *
 * MCP servers are ordinary loader rows in the profile's patch layer, which is
 * the kernel's own home for them (see @deepseek-ai/dsh-mcp-client). A profile
 * with patchReload: live re-applies that file, so writing it here mounts the
 * server without a restart.
 *
 * The patch file is READ with js-yaml but WRITTEN by this module's own small
 * emitter, on purpose: a dump/load round trip would reformat (and strip the
 * comments from) a file the user may have hand-edited, and reformatting rows
 * another plugin owns is exactly how a manager corrupts a composition.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const MANAGER_ID = 'dsh-local-mcp-manager';
const MCP_PACKAGE = '@deepseek-ai/dsh-mcp-client';
const API_PREFIX = '/api/mcp-manager/servers';
const SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;

function resolvePaths(home, profile) {
  const fs = require('node:fs');
  const path = require('node:path');
  const profileDir = path.join(home, 'profiles', profile);
  return { fs, path, profileDir, patchFile: path.join(profileDir, 'cordis.patch.yml') };
}

/** Read the profile's patch layer. An absent or empty file is an empty list. */
function readPatch(fs, patchFile) {
  let text = '';
  try {
    text = fs.readFileSync(patchFile, 'utf8');
  } catch {
    return [];
  }
  if (text.trim() === '') return [];
  let yaml;
  try {
    yaml = require('js-yaml');
  } catch {
    try {
      const path = require('node:path');
      yaml = createRequire(path.join(path.dirname(patchFile), 'package.json'))('js-yaml');
    } catch {
      return null; // caller reports "cannot parse"
    }
  }
  const parsed = yaml.load(text);
  return Array.isArray(parsed) ? parsed : [];
}

/** Every MCP row the patch currently declares, flattened out of any insert block. */
function collectServers(patch) {
  const out = [];
  for (const entry of patch) {
    if (entry === null || typeof entry !== 'object') continue;
    if (Array.isArray(entry.insert)) {
      for (const row of entry.insert) {
        if (row && typeof row === 'object' && row.name === MCP_PACKAGE) out.push(row);
      }
    }
    if (entry.name === MCP_PACKAGE && entry.id !== undefined) out.push(entry);
  }
  return out;
}

/** Drop every MCP row, keeping all other entries untouched and in order. */
function withoutMcpRows(patch) {
  const kept = [];
  for (const entry of patch) {
    if (entry === null || typeof entry !== 'object') { kept.push(entry); continue; }
    if (Array.isArray(entry.insert)) {
      const rows = entry.insert.filter((row) => !(row && typeof row === 'object' && row.name === MCP_PACKAGE));
      if (rows.length > 0) kept.push({ ...entry, insert: rows });
      continue;
    }
    if (entry.name === MCP_PACKAGE && entry.id !== undefined) continue;
    kept.push(entry);
  }
  return kept;
}

/* ---- a deliberately small YAML emitter ---------------------------------- */

function scalar(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value === null || value === undefined) return 'null';
  const text = String(value);
  if (text.startsWith('!!js ')) return text; // must stay a tag so the loader evaluates it
  return JSON.stringify(text);
}

/* Emit a mapping as lines, each already carrying its own indentation. */
function emitMap(object, indent) {
  const pad = ' '.repeat(indent);
  const keys = Object.keys(object).filter((k) => object[k] !== undefined);
  const lines = [];
  for (const key of keys) {
    const value = object[key];
    if (Array.isArray(value)) {
      if (value.length === 0) { lines.push(pad + key + ': []'); continue; }
      lines.push(pad + key + ':');
      for (const item of value) {
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          const sub = emitMap(item, indent + 4);
          lines.push(pad + '  - ' + sub[0].trimStart());
          for (let i = 1; i < sub.length; i++) lines.push(sub[i]);
        } else {
          lines.push(pad + '  - ' + scalar(item));
        }
      }
    } else if (value !== null && typeof value === 'object') {
      const sub = emitMap(value, indent + 2);
      if (sub.length === 0) { lines.push(pad + key + ': {}'); continue; }
      lines.push(pad + key + ':');
      for (const line of sub) lines.push(line);
    } else {
      lines.push(pad + key + ': ' + scalar(value));
    }
  }
  return lines;
}

/** Serialize the top-level patch array. */
function emitPatch(patch) {
  if (patch.length === 0) return '[]';
  const lines = [];
  for (const item of patch) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const sub = emitMap(item, 2);
      lines.push('- ' + sub[0].trimStart());
      for (let i = 1; i < sub.length; i++) lines.push(sub[i]);
    } else {
      lines.push('- ' + scalar(item));
    }
  }
  return lines.join('\n');
}

const HEADER = [
  '# Your patch layer for this dsh profile, applied after every bundle layer:',
  '# a top-level YAML array of loader patch entries (id-targeted config',
  '# overrides, disables, and insert lists; `!!js` expressions allowed).',
  '#',
  '# The `insert:` block below is maintained by dsh-local-mcp-manager; edit MCP',
  '# servers from Settings -> MCP in the web GUI rather than by hand.',
  '',
].join('\n');

function writePatch(fs, patchFile, patch) {
  const body = emitPatch(patch) + '\n';
  fs.writeFileSync(patchFile, HEADER + body, 'utf8');
}

/** Turn one posted server definition into a loader row, or an error string. */
function rowFor(input, existing) {
  if (input === null || typeof input !== 'object') return { error: 'invalid-body' };
  const serverName = typeof input.serverName === 'string' ? input.serverName.trim() : '';
  if (!SERVER_NAME_RE.test(serverName)) return { error: 'bad-server-name' };
  if (existing.includes(serverName)) return { error: 'duplicate-server-name' };

  const transport = input.transport === 'stdio' ? 'stdio'
    : input.transport === 'streamable-http' ? 'streamable-http' : null;
  if (transport === null) return { error: 'bad-transport' };

  const config = { serverName, transport };

  if (transport === 'stdio') {
    const command = typeof input.command === 'string' ? input.command.trim() : '';
    if (command === '') return { error: 'command-required' };
    config.command = command;
    if (Array.isArray(input.args) && input.args.length > 0) config.args = input.args.map(String);
    if (input.env && typeof input.env === 'object' && !Array.isArray(input.env)) config.env = input.env;
    if (typeof input.cwd === 'string' && input.cwd.trim() !== '') config.cwd = input.cwd.trim();
  } else {
    const url = typeof input.url === 'string' ? input.url.trim() : '';
    if (url === '') return { error: 'url-required' };
    config.url = url;
    if (input.headers && typeof input.headers === 'object' && !Array.isArray(input.headers)) config.headers = input.headers;
  }

  if (Number.isFinite(input.toolCallTimeoutMs)) config.toolCallTimeoutMs = Math.trunc(input.toolCallTimeoutMs);
  return { row: { id: 'mcp-' + serverName, name: MCP_PACKAGE, config }, serverName, transport };
}

/** Public shape of one server, as the settings page needs it. */
function viewOf(row) {
  const config = row.config && typeof row.config === 'object' ? row.config : {};
  return {
    id: typeof row.id === 'string' ? row.id : null,
    serverName: typeof config.serverName === 'string' ? config.serverName : null,
    transport: typeof config.transport === 'string' ? config.transport : null,
    command: typeof config.command === 'string' ? config.command : null,
    url: typeof config.url === 'string' ? config.url : null,
    args: Array.isArray(config.args) ? config.args.map(String) : [],
    envKeys: config.env && typeof config.env === 'object' ? Object.keys(config.env) : [],
    headerKeys: config.headers && typeof config.headers === 'object' ? Object.keys(config.headers) : [],
    toolCallTimeoutMs: Number.isFinite(config.toolCallTimeoutMs) ? config.toolCallTimeoutMs : null,
  };
}

function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error('body-too-large')); req.destroy(); return; }
      parts.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(parts).toString('utf8');
      if (text === '') { resolve({}); return; }
      try { resolve(JSON.parse(text)); } catch { reject(new Error('invalid-json')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function apply(ctx) {
  const path = require('node:path');
  const home = process.env.DSH_HOME || path.join(require('node:os').homedir(), '.dsh');
  const profile = process.env.DSH_PROFILE || 'web';
  const { fs, patchFile, profileDir } = resolvePaths(home, profile);

  const load = () => {
    const patch = readPatch(fs, patchFile);
    if (patch === null) return { error: 'yaml-unavailable' };
    return { patch, servers: collectServers(patch) };
  };

  ctx.inject(['webServer'], (hostCtx) => {
  hostCtx.effect(() => hostCtx.webServer.register({
    kind: 'exact',
    path: API_PREFIX,
    handler: async (req, res) => {
      if (req.method === 'GET') {
        const state = load();
        if (state.error) { sendJson(res, 500, { ok: false, error: state.error }); return; }
        sendJson(res, 200, { ok: true, patchFile, profileDir, servers: state.servers.map(viewOf) });
        return;
      }
      if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return; }

      let body;
      try { body = await readBody(req); }
      catch (error) { sendJson(res, 400, { ok: false, error: String(error.message) }); return; }
      const action = body && body.action;

      try {
        if (action === 'add') {
          const state = load();
          if (state.error) { sendJson(res, 500, { ok: false, error: state.error }); return; }
          const existing = state.servers.map((r) => (r.config && r.config.serverName) || '').filter(Boolean);
          const built = rowFor(body.server, existing);
          if (built.error) { sendJson(res, 400, { ok: false, error: built.error }); return; }
          // Keep every server already configured: strip the old rows, then
          // re-insert the whole set plus the new one.
          const next = [...withoutMcpRows(state.patch), { insert: [...state.servers, built.row] }];
          writePatch(fs, patchFile, next);
          sendJson(res, 200, { ok: true, added: viewOf(built.row) });
          return;
        }
        if (action === 'remove') {
          const target = typeof body.serverName === 'string' ? body.serverName : '';
          const state = load();
          if (state.error) { sendJson(res, 500, { ok: false, error: state.error }); return; }
          const remaining = state.servers.filter((r) => (r.config && r.config.serverName) !== target);
          if (remaining.length === state.servers.length) { sendJson(res, 404, { ok: false, error: 'not-found' }); return; }
          const next = withoutMcpRows(state.patch);
          if (remaining.length > 0) next.push({ insert: remaining });
          writePatch(fs, patchFile, next);
          sendJson(res, 200, { ok: true, removed: target });
          return;
        }
        sendJson(res, 400, { ok: false, error: 'unknown-action' });
      } catch (error) {
        sendJson(res, 500, { ok: false, error: 'write-failed', detail: String(error && error.message) });
      }
    },
  }), MANAGER_ID + ': MCP server settings route');
  });

  process.stderr.write('[dsh-local-mcp-manager] route ' + API_PREFIX + ' -> ' + patchFile + '\n');
}
