/* Host half of the MCP console (Settings -> MCP).
 *
 * What it does
 * ------------
 * 1. Lists the MCP servers configured for this DSH home. Rows live in the
 *    home-level user patch layer ($DSH_HOME/cordis.patch.yml) because the
 *    hosting platform rewrites profiles/<name>/cordis.patch.yml at launch;
 *    the profile file is still read so hand-placed rows show up too.
 * 2. Reports the tools the running host actually registered for each server
 *    (`ctx.tools.schemas()`), which is the honest "is it connected" signal.
 *    For HTTP servers with no registered tools it also probes the endpoint.
 * 3. Turns individual tools on and off. Disabled names are persisted in
 *    $DSH_HOME/mcp-console.json and applied through `ctx.tools.restrict`,
 *    so the model simply does not see them.
 * 4. Adds and removes servers by rewriting the home patch layer (with a
 *    timestamped .bak first). A file containing `!!js` tags is never
 *    rewritten, because this package's YAML writer cannot preserve them.
 *
 * Everything the page calls is one small JSON route on `webServer`. The
 * route has no authentication of its own, exactly like any other plugin
 * route; the hosting gateway in front of this process requires a logged-in
 * session before it proxies anything here.
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** Cordis plugin name used by loader diagnostics. */
export const name = 'mcp-console'

/** Hard dependencies: the live tool registry and the agent registry. */
export const inject = ['tools', 'agents']

const MCP_PACKAGE = '@deepseek-ai/dsh-mcp-client'
const API_PATH = '/api/mcp-console'
const SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/
const PROBE_TIMEOUT_MS = 6000
const RESTRICT_INTERVAL_MS = 20000
/**
 * Placeholder the page shows instead of a stored header/env value. State never
 * carries secrets to the browser; a field left at this mask (or left empty)
 * keeps whatever value is already stored.
 */
const SECRET_MASK = '\u2022\u2022\u2022\u2022\u2022\u2022'

const FILE_HEADER = [
  '# MCP servers for this DSH home.',
  '#',
  '# A user patch layer: applied after every bundle layer and after',
  '# profiles/<name>/cordis.patch.yml. The hosting platform rewrites that',
  '# profile file at launch, so server rows belong here instead.',
  '#',
  '# Settings -> MCP maintains this file.',
  '',
].join('\n')

/** Absolute paths this plugin owns, derived from the live environment. */
function paths() {
  const fs = require('node:fs')
  const path = require('node:path')
  const os = require('node:os')
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const profile = process.env.DSH_PROFILE || 'web'
  const profileDir = path.join(home, 'profiles', profile)
  return {
    fs,
    path,
    home,
    profileDir,
    homePatch: path.join(home, 'cordis.patch.yml'),
    profilePatch: path.join(profileDir, 'cordis.patch.yml'),
    statePath: path.join(home, 'mcp-console.json'),
  }
}

/** js-yaml, resolved from this package or from the profile's own tree. */
function loadYaml(profileDir) {
  try {
    return require('js-yaml')
  } catch {
    /* not next to this package — try the profile */
  }
  try {
    const path = require('node:path')
    return createRequire(path.join(profileDir, 'package.json'))('js-yaml')
  } catch {
    return undefined
  }
}

const isMcpRow = (row) => !!row && typeof row === 'object' && row.name === MCP_PACKAGE

/** Parse one patch file into its entry array; a missing or broken file is empty. */
function readPatch(env, yaml, file) {
  let text = ''
  try {
    text = env.fs.readFileSync(file, 'utf8')
  } catch {
    return { text: '', entries: [] }
  }
  if (text.trim() === '') return { text, entries: [] }
  let parsed
  try {
    parsed = yaml.load(text)
  } catch {
    return { text, entries: [] }
  }
  return { text, entries: Array.isArray(parsed) ? parsed : [] }
}

/** Every MCP row a patch declares, flattened out of any insert block. */
function collectServers(entries) {
  const out = []
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue
    if (Array.isArray(entry.insert)) {
      for (const row of entry.insert) if (isMcpRow(row)) out.push(row)
    }
    if (isMcpRow(entry) && entry.id !== undefined) out.push(entry)
  }
  return out
}

/** Same entries with every MCP row removed, order and shape preserved. */
function withoutMcpRows(entries) {
  const kept = []
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') {
      kept.push(entry)
      continue
    }
    if (Array.isArray(entry.insert)) {
      const rows = entry.insert.filter((row) => !isMcpRow(row))
      if (rows.length > 0) kept.push({ ...entry, insert: rows })
      continue
    }
    if (isMcpRow(entry) && entry.id !== undefined) continue
    kept.push(entry)
  }
  return kept
}

function readState(env) {
  try {
    const parsed = JSON.parse(env.fs.readFileSync(env.statePath, 'utf8'))
    const disabled = Array.isArray(parsed && parsed.disabled) ? parsed.disabled.filter((n) => typeof n === 'string') : []
    return { disabled }
  } catch {
    return { disabled: [] }
  }
}

function writeState(env, state) {
  env.fs.writeFileSync(env.statePath, JSON.stringify({ disabled: state.disabled }, null, 2) + '\n', 'utf8')
}

/** Config as the page needs it: no header values, only their names. */
function configView(row) {
  const config = row && typeof row.config === 'object' && row.config !== null ? row.config : {}
  return {
    id: typeof row.id === 'string' ? row.id : null,
    serverName: typeof config.serverName === 'string' ? config.serverName : null,
    transport: typeof config.transport === 'string' ? config.transport : null,
    url: typeof config.url === 'string' ? config.url : null,
    command: typeof config.command === 'string' ? config.command : null,
    args: Array.isArray(config.args) ? config.args.map(String) : [],
    envKeys: config.env && typeof config.env === 'object' && !Array.isArray(config.env) ? Object.keys(config.env) : [],
    headerKeys: config.headers && typeof config.headers === 'object' && !Array.isArray(config.headers) ? Object.keys(config.headers) : [],
    /** A row-level `disabled: true` keeps the server unmounted entirely. */
    enabled: row.disabled !== true,
    toolCallTimeoutMs: Number.isFinite(config.toolCallTimeoutMs) ? config.toolCallTimeoutMs : null,
  }
}

/** Turn one posted server definition into a loader row, or an error code. */
function rowFor(input, existingNames) {
  if (input === null || typeof input !== 'object') return { error: 'invalid-body' }
  const serverName = typeof input.serverName === 'string' ? input.serverName.trim() : ''
  if (!SERVER_NAME_RE.test(serverName)) return { error: 'bad-server-name' }
  if (existingNames.includes(serverName)) return { error: 'duplicate-server-name' }

  const transport = input.transport === 'stdio' ? 'stdio'
    : input.transport === 'streamable-http' ? 'streamable-http' : null
  if (transport === null) return { error: 'bad-transport' }

  const config = { serverName, transport }
  if (transport === 'stdio') {
    const command = typeof input.command === 'string' ? input.command.trim() : ''
    if (command === '') return { error: 'command-required' }
    config.command = command
    if (Array.isArray(input.args) && input.args.length > 0) config.args = input.args.map(String)
    if (input.env && typeof input.env === 'object' && !Array.isArray(input.env)) config.env = input.env
  } else {
    const url = typeof input.url === 'string' ? input.url.trim() : ''
    if (url === '') return { error: 'url-required' }
    config.url = url
    if (input.headers && typeof input.headers === 'object' && !Array.isArray(input.headers)) config.headers = input.headers
  }
  if (Number.isFinite(input.toolCallTimeoutMs) && input.toolCallTimeoutMs > 0) {
    config.toolCallTimeoutMs = Math.trunc(input.toolCallTimeoutMs)
  }
  return { row: { id: 'mcp-' + serverName, name: MCP_PACKAGE, config }, serverName }
}

/**
 * Keep stored secrets a masked field did not replace: an incoming header/env
 * value equal to the mask (or empty) means "leave it as it is".
 * @param next - the row built from the submitted form.
 * @param previous - the row currently in the patch file.
 * @returns the row to store, with secrets merged in.
 */
function mergeSecrets(next, previous) {
  const stored = previous && typeof previous.config === 'object' && previous.config !== null ? previous.config : {}
  const config = { ...next.config }
  for (const field of ['headers', 'env']) {
    const incoming = config[field]
    if (incoming === undefined || incoming === null || typeof incoming !== 'object') continue
    const current = stored[field] && typeof stored[field] === 'object' && !Array.isArray(stored[field]) ? stored[field] : {}
    const merged = {}
    for (const [key, value] of Object.entries(incoming)) {
      merged[key] = (value === SECRET_MASK || value === '') && typeof current[key] === 'string' ? current[key] : value
    }
    config[field] = merged
  }
  return { ...next, config }
}

/** Reachability of one HTTP server, independent of the bridge's own state. */
async function probeEndpoint(config) {
  if (config.transport !== 'streamable-http' || typeof config.url !== 'string') return { state: 'unknown' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  const extra = config.headers && typeof config.headers === 'object' && !Array.isArray(config.headers) ? config.headers : {}
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { ...headers, ...extra },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dsh-mcp-console', version: '1.0.0' } },
      }),
      signal: controller.signal,
    })
    if (!response.ok) return { state: 'unreachable', detail: `HTTP ${response.status}` }
    const text = await response.text()
    return text.includes('"result"') ? { state: 'reachable' } : { state: 'unreachable', detail: 'unexpected reply' }
  } catch (error) {
    const message = error && error.message ? String(error.message) : String(error)
    return { state: 'unreachable', detail: message }
  } finally {
    clearTimeout(timer)
  }
}

/** Back up, then rewrite the home patch layer with the given server rows. */
function writeServers(env, yaml, file, servers) {
  const { text, entries } = readPatch(env, yaml, file)
  if (text.includes('!!js')) return { error: 'js-tag-present' }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  try {
    if (text.trim() !== '') env.fs.copyFileSync(file, `${file}.bak.${stamp}`)
  } catch {
    /* a failed backup must not stop the save */
  }
  const next = withoutMcpRows(entries)
  if (servers.length > 0) next.push({ insert: servers })
  env.fs.writeFileSync(file, FILE_HEADER + yaml.dump(next, { lineWidth: 120, noRefs: true }), 'utf8')
  return { ok: true }
}

export function apply(ctx) {
  const env = paths()
  const yaml = loadYaml(env.profileDir)
  if (yaml === undefined) ctx.logger.error('mcp-console: js-yaml is not resolvable; the page cannot read or save servers')
  const state = readState(env)

  /* `tools.restrict` only accepts a scoped context, so every live agent gets
   * its own restriction. New agents are covered by the agent/created event and
   * the periodic re-apply. */
  const restricted = new Map()

  /** Hide the disabled tools from one agent's view; idempotent per agent. */
  const applyToAgent = (agent) => {
    const previous = restricted.get(agent)
    if (previous !== undefined) {
      previous()
      restricted.delete(agent)
    }
    if (state.disabled.length === 0) return
    const present = new Set(ctx.tools.schemas().map((tool) => tool.name))
    const deny = state.disabled.filter((name) => present.has(name))
    if (deny.length === 0) return
    try {
      restricted.set(agent, agent.ctx.tools.restrict({ deny }))
    } catch (error) {
      const message = error && error.message ? String(error.message) : String(error)
      ctx.logger.warn(`mcp-console: could not restrict tools for ${String(agent.id)}: ${message}`)
    }
  }

  /** Re-apply the deny list to every live agent. */
  const applyRestrictions = () => {
    for (const agent of ctx.agents.list()) applyToAgent(agent)
  }

  ctx.effect(() => () => {
    for (const dispose of restricted.values()) dispose()
    restricted.clear()
  }, 'mcp-console.restrictions')
  ctx.on('agent/created', ({ agent }) => applyToAgent(agent))
  ctx.on('agent/disposed', ({ agent }) => {
    const dispose = restricted.get(agent)
    if (dispose !== undefined) {
      dispose()
      restricted.delete(agent)
    }
  })
  applyRestrictions()

  /* Re-apply periodically so a server that reconnects later still respects the
   * saved toggles. `timer` is an optional service: read it through ctx.get. */
  const timer = ctx.get('timer')
  if (timer !== undefined) {
    ctx.effect(() => timer.interval(applyRestrictions, RESTRICT_INTERVAL_MS), 'mcp-console.restriction-refresh')
  }

  /** The whole page state: servers, their live tools, status, toggles. */
  const snapshot = async () => {
    if (yaml === undefined) return { ok: false, error: 'yaml-unavailable' }
    const home = readPatch(env, yaml, env.homePatch)
    const profile = readPatch(env, yaml, env.profilePatch)
    const all = [...collectServers(home.entries), ...collectServers(profile.entries)]
    const seen = new Set()
    const rows = []
    for (const row of all) {
      const view = configView(row)
      const key = view.id || view.serverName
      if (key === null || seen.has(key)) continue
      seen.add(key)
      rows.push({ row, view })
    }

    const registered = ctx.tools.schemas().filter((tool) => tool.name.startsWith('mcp__'))
    const servers = []
    for (const { row, view } of rows) {
      const prefix = view.serverName === null ? null : `mcp__${view.serverName}__`
      const tools = prefix === null ? [] : registered.filter((tool) => tool.name.startsWith(prefix))
      let status = !view.enabled ? 'disabled' : tools.length > 0 ? 'connected' : 'idle'
      let detail = null
      if (view.enabled && tools.length === 0 && view.transport === 'streamable-http') {
        const probed = await probeEndpoint(row.config || {})
        status = probed.state === 'reachable' ? 'reachable' : probed.state === 'unknown' ? 'idle' : 'unreachable'
        detail = probed.detail || null
      }
      servers.push({
        ...view,
        status,
        detail,
        tools: tools.map((tool) => ({
          name: tool.name,
          label: prefix === null ? tool.name : tool.name.slice(prefix.length),
          description: typeof tool.description === 'string' ? tool.description : '',
          enabled: !state.disabled.includes(tool.name),
        })),
      })
    }
    return {
      ok: true,
      mask: SECRET_MASK,
      homePatch: env.homePatch,
      profilePatch: env.profilePatch,
      statePath: env.statePath,
      disabled: state.disabled,
      servers,
    }
  }

  const readBody = (req, limit = 1 << 20) => new Promise((resolve, reject) => {
    const parts = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body-too-large'))
        req.destroy()
        return
      }
      parts.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(parts).toString('utf8')
      if (text === '') {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new Error('invalid-json'))
      }
    })
    req.on('error', reject)
  })

  const sendJson = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  ctx.inject(['webServer'], (hostCtx) => {
    hostCtx.effect(() => hostCtx.webServer.register({
      kind: 'exact',
      path: API_PATH,
      handler: async (req, res) => {
        try {
          if (req.method === 'GET') {
            sendJson(res, 200, await snapshot())
            return
          }
          if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
            return
          }

          let body
          try {
            body = await readBody(req)
          } catch (error) {
            sendJson(res, 400, { ok: false, error: String(error && error.message ? error.message : error) })
            return
          }
          const action = body && body.action

          if (action === 'toggle') {
            const name = typeof body.tool === 'string' ? body.tool : ''
            if (!name.startsWith('mcp__')) {
              sendJson(res, 400, { ok: false, error: 'bad-tool' })
              return
            }
            const enabled = body.enabled === true
            const set = new Set(state.disabled)
            if (enabled) set.delete(name)
            else set.add(name)
            state.disabled = [...set]
            writeState(env, state)
            applyRestrictions()
            sendJson(res, 200, await snapshot())
            return
          }

          if (action === 'server') {
            if (yaml === undefined) {
              sendJson(res, 500, { ok: false, error: 'yaml-unavailable' })
              return
            }
            const target = typeof body.serverName === 'string' ? body.serverName : ''
            const current = collectServers(readPatch(env, yaml, env.homePatch).entries)
            const index = current.findIndex((row) => (row.config && row.config.serverName) === target)
            if (index < 0) {
              sendJson(res, 404, { ok: false, error: 'not-found' })
              return
            }
            const servers = current.slice()
            const row = { ...servers[index] }
            // Row-level `disabled: true` keeps the whole server unmounted; the
            // saved per-tool switches stay untouched so re-enabling restores them.
            if (body.enabled === true) delete row.disabled
            else row.disabled = true
            servers[index] = row
            const written = writeServers(env, yaml, env.homePatch, servers)
            if (written.error) {
              sendJson(res, 500, { ok: false, error: written.error })
              return
            }
            sendJson(res, 200, await snapshot())
            return
          }

          if (action === 'add') {
            if (yaml === undefined) {
              sendJson(res, 500, { ok: false, error: 'yaml-unavailable' })
              return
            }
            const existing = collectServers(readPatch(env, yaml, env.homePatch).entries)
              .map((row) => (row.config && row.config.serverName) || '')
              .filter(Boolean)
            const built = rowFor(body.server, existing)
            if (built.error) {
              sendJson(res, 400, { ok: false, error: built.error })
              return
            }
            const servers = [...collectServers(readPatch(env, yaml, env.homePatch).entries), built.row]
            const written = writeServers(env, yaml, env.homePatch, servers)
            if (written.error) {
              sendJson(res, 500, { ok: false, error: written.error })
              return
            }
            sendJson(res, 200, await snapshot())
            return
          }

          if (action === 'update') {
            if (yaml === undefined) {
              sendJson(res, 500, { ok: false, error: 'yaml-unavailable' })
              return
            }
            const target = typeof body.serverName === 'string' ? body.serverName : ''
            const current = collectServers(readPatch(env, yaml, env.homePatch).entries)
            const index = current.findIndex((row) => (row.config && row.config.serverName) === target)
            if (index < 0) {
              sendJson(res, 404, { ok: false, error: 'not-found' })
              return
            }
            const others = current
              .map((row) => (row.config && row.config.serverName) || '')
              .filter((name) => name !== '' && name !== target)
            const built = rowFor(body.server, others)
            if (built.error) {
              sendJson(res, 400, { ok: false, error: built.error })
              return
            }
            const keptId = typeof current[index].id === 'string' ? current[index].id : built.row.id
            const renamed = built.serverName !== target
            const rebuilt = { ...mergeSecrets(built.row, current[index]), id: renamed ? built.row.id : keptId }
            if (current[index].disabled === true) rebuilt.disabled = true
            const servers = current.slice()
            servers[index] = rebuilt
            if (renamed) {
              // The model-facing names change with the namespace: follow them so
              // the saved per-tool switches keep pointing at the same tools.
              const from = `mcp__${target}__`
              const to = `mcp__${built.serverName}__`
              const remapped = state.disabled.map((name) => (name.startsWith(from) ? to + name.slice(from.length) : name))
              if (remapped.join('|') !== state.disabled.join('|')) {
                state.disabled = remapped
                writeState(env, state)
              }
            }
            const written = writeServers(env, yaml, env.homePatch, servers)
            if (written.error) {
              sendJson(res, 500, { ok: false, error: written.error })
              return
            }
            sendJson(res, 200, await snapshot())
            return
          }

          if (action === 'test') {
            if (yaml === undefined) {
              sendJson(res, 500, { ok: false, error: 'yaml-unavailable' })
              return
            }
            const target = typeof body.serverName === 'string' ? body.serverName : ''
            const current = collectServers(readPatch(env, yaml, env.homePatch).entries)
            const row = current.find((entry) => (entry.config && entry.config.serverName) === target)
            if (row === undefined) {
              sendJson(res, 404, { ok: false, error: 'not-found' })
              return
            }
            const registered = ctx.tools.schemas().filter((tool) => tool.name.startsWith(`mcp__${target}__`))
            let outcome = row.disabled === true ? 'disabled' : registered.length > 0 ? 'connected' : 'disconnected'
            let detail = null
            const probe = await probeEndpoint(row.config || {})
            if (row.disabled !== true && probe.state === 'reachable') outcome = registered.length > 0 ? 'connected' : 'reachable'
            else if (row.disabled !== true && probe.state === 'unreachable') {
              outcome = 'unreachable'
              detail = probe.detail || null
            }
            sendJson(res, 200, {
              ok: true,
              test: { serverName: target, state: outcome, detail, tools: registered.length, at: Date.now() },
            })
            return
          }

          if (action === 'remove') {
            if (yaml === undefined) {
              sendJson(res, 500, { ok: false, error: 'yaml-unavailable' })
              return
            }
            const target = typeof body.serverName === 'string' ? body.serverName : ''
            const current = collectServers(readPatch(env, yaml, env.homePatch).entries)
            const remaining = current.filter((row) => (row.config && row.config.serverName) !== target)
            if (remaining.length === current.length) {
              sendJson(res, 404, { ok: false, error: 'not-found' })
              return
            }
            const written = writeServers(env, yaml, env.homePatch, remaining)
            if (written.error) {
              sendJson(res, 500, { ok: false, error: written.error })
              return
            }
            sendJson(res, 200, await snapshot())
            return
          }

          sendJson(res, 400, { ok: false, error: 'unknown-action' })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error && error.message ? error.message : error) })
        }
      },
    }), 'mcp-console: Settings -> MCP route')
  })
}
