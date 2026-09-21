/* dsh-workbench — 宿主半边的**实现**（被 lib/index.js 按 mtime 热加载）。
 *
 * 为什么单独一个文件：宿主插件的代码改了，DSH 要重启才生效（模块被 import 缓存），
 * 而客户端半边是热重载的。所以真正的逻辑放在这里，index.js 每次请求按 mtime
 * 重新 import 它 —— 从此改这个文件不用重启。
 *
 * 浏览器做不到的事：调 MCP、列技能。全部走 DSH 自己已经挂好的东西，
 * **不自己配地址、不碰任何 token**：
 *
 *   客户    → `ctx.tools.execute('mcp__sora-knowledge__list_clients')`
 *   文章库  → `ctx.tools.execute('mcp__sora-articles__list_articles')`
 *   技能    → `ctx.skills.list()`（dsh-skill-remote 注册的 provider）
 *
 * 好处：用户在「设置 → MCP」里换地址/换服务器，或者换技能服务，工作台自动跟着走。
 *
 * ── 环境约定（见工作区 ENVIRONMENT.md）──────────────────────────────
 * 这三个服务都跑在用户自己电脑上、走 Cloudflare 快速通道，**地址随时会变**。
 * 连不上时**不要乱排查、不要换地址试** —— 先问用户要新地址。
 * 本文件里的判定只做一件事：把"连不上"如实报出来，别猜。
 *
 * 路由：
 *   GET /api/workbench/clients              → { ok, customers: [{id,name,meta,business_lines,service_periods}] }
 *   GET /api/workbench/skills               → { ok, skills:  [{name,description,whenToUse,source,provider}] }
 *   GET /api/workbench/articles?client=NAME → { ok, articles:[{id,title}] }
 *   GET /api/workbench/mcp                  → 诊断：这台 Host 挂了哪些 MCP、各有哪些工具
 */

const CLIENTS_PATH = '/api/workbench/clients'
const SKILLS_PATH = '/api/workbench/skills'
const ARTICLES_PATH = '/api/workbench/articles'
const MCP_INFO_PATH = '/api/workbench/mcp'

/** 默认服务器名；在 cordis.patch.yml 的 config 里可改。 */
const DEFAULT_KNOWLEDGE_SERVER = 'sora-knowledge'
const DEFAULT_LIBRARY_SERVER = 'sora-articles'

/** 一次工具调用的预算。 */
const TOOL_TIMEOUT_MS = 15000

/* ---------------------------------------------------------------- 工具注册表 */

/** 某个 MCP server 在本 Host 上注册了哪些工具（去掉 `mcp__<server>__` 前缀）。 */
function toolsOf(ctx, server) {
  const prefix = `mcp__${server}__`
  return ctx.tools.schemas()
    .map(schema => schema.name)
    .filter(name => name.startsWith(prefix))
    .map(name => name.slice(prefix.length))
    .sort()
}

/** 挑一个工具：优先用户指定的，其次按名字猜（hierarchy → list → 第一个）。 */
function pickTool(ctx, server, configured, hints) {
  const names = toolsOf(ctx, server)
  if (configured !== '' && names.indexOf(configured) >= 0) return configured
  for (const hint of hints) {
    const hit = names.filter(name => hint.test(name))
    if (hit.length > 0) return hit[0]
  }
  return names.length > 0 ? names[0] : ''
}

/**
 * 调一次 MCP 工具。
 * @param ctx - host context。
 * @param server - MCP server 名。
 * @param tool - 工具短名。
 * @param args - 工具入参。
 * @returns `{ ok: true, value }`，或 `{ ok: false, error, detail }`。
 */
async function callTool(ctx, server, tool, args) {
  try {
    const result = await ctx.tools.execute({
      callId: `workbench-${tool}-${String(Date.now())}`,
      name: `mcp__${server}__${tool}`,
      arguments: args,
      signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
    })
    if (result !== null && typeof result === 'object' && result.isError === true) {
      return { ok: false, error: 'mcp-error', detail: failureText(result) }
    }
    const value = payloadOf(result)
    if (value === null) return { ok: false, error: 'bad-reply', detail: failureText(result) }
    return { ok: true, value }
  } catch (error) {
    return { ok: false, error: 'mcp-error', detail: String(error && error.message ? error.message : error) }
  }
}

/** 从 content 数组里找第一块能当 JSON 解析的文本。 */
function jsonFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return null
  for (const block of blocks) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      try { return JSON.parse(block.text) } catch { /* 不是 JSON，看下一块 */ }
    }
  }
  return null
}

/**
 * 拆掉 mcp-client 的规范包装。
 *
 * DSH 的 MCP 桥把一次 tools/call 的产物包成
 * `{ content: [...], structuredContent: ... }`（见 mcp-client 的 createOutput），
 * 业务数据在 structuredContent 里，或者退一步在 content 的 JSON 文本块里。
 * 直接拿 `result.value` 当业务数据会全部认不出来 —— 这个坑踩过一次。
 * @param value - result.value。
 * @returns 业务数据本身。
 */
function unwrapMcp(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value
  const structured = value.structuredContent
  if (structured !== undefined && structured !== null) {
    if (Array.isArray(structured)) return structured
    if (typeof structured === 'object'
      && (Array.isArray(structured.customers) || Array.isArray(structured.clients) || Array.isArray(structured.items))) {
      return structured
    }
  }
  if (Array.isArray(value.content)) {
    const parsed = jsonFromBlocks(value.content)
    if (parsed !== null) return parsed
  }
  return value
}

/** 工具产物：先拆包装，再退回 harness 自己的 content 文本块。 */
function payloadOf(result) {
  if (result === null || typeof result !== 'object') return null
  const value = result.value
  if (value !== undefined && value !== null) return unwrapMcp(value)
  return jsonFromBlocks(result.content)
}

/** 认不出形状时，把"收到了什么"说清楚，别让人靠猜。 */
function describe(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `array(${String(value.length)})`
  if (typeof value !== 'object') return typeof value
  const keys = Object.keys(value)
  return `object{${keys.slice(0, 8).join(',')}${keys.length > 8 ? ',…' : ''}}`
}

/** 失败时给人看的一句话。 */
function failureText(result) {
  if (result === null || typeof result !== 'object') return '工具没有任何返回'
  const blocks = Array.isArray(result.content) ? result.content : []
  const texts = blocks
    .filter(block => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
  if (texts.length > 0) return texts.join(' ')
  if (result.error !== undefined && result.error !== null) {
    return typeof result.error === 'string' ? result.error : JSON.stringify(result.error)
  }
  return '工具报错，但没有说明'
}

/* ------------------------------------------------------------------ 归一化 */

function firstString() {
  for (let index = 0; index < arguments.length; index++) {
    const value = arguments[index]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

/** 把标量字段拼成一句人话（files / chars 这种），没有就不写。 */
function metaOf(item) {
  const bits = []
  if (Number.isFinite(item.files)) bits.push(`${String(item.files)} 个文件`)
  if (Number.isFinite(item.chars)) bits.push(`${String(Math.round(item.chars / 1000))}k 字`)
  return bits.join(' · ')
}

/**
 * 客户名单归一化。两种真实形状都认：
 *   - 测试版 `[{ client, files, chars }]`
 *   - 生产版 `{ customers: [{ client_key, display_name, business_lines, service_periods }] }`
 * 缺的层级就是空数组，**不编**。
 * @param raw - 工具返回值。
 * @returns 归一化后的客户数组，或 null。
 */
function normalize(raw) {
  const list = Array.isArray(raw) ? raw : (raw !== null && typeof raw === 'object' && Array.isArray(raw.customers) ? raw.customers : null)
  if (list === null) return null
  const out = []
  for (const item of list) {
    if (item === null || typeof item !== 'object') {
      // 也可能就是一堆客户名字符串
      if (typeof item === 'string' && item.trim() !== '') {
        out.push({ id: item.trim(), name: item.trim(), meta: '', business_lines: [], service_periods: [] })
      }
      continue
    }
    const name = firstString(item.display_name, item.client, item.name, item.title, item.client_key)
    if (name === '') continue
    out.push({
      id: firstString(item.client_key, item.client, item.id) || name,
      name,
      meta: metaOf(item),
      business_lines: Array.isArray(item.business_lines) ? item.business_lines : [],
      service_periods: Array.isArray(item.service_periods) ? item.service_periods : [],
    })
  }
  return out
}

/** 文章列表可以是字符串数组，也可以是对象数组；统一成 {id,title}。 */
function normalizeArticles(raw) {
  const list = Array.isArray(raw) ? raw : (raw !== null && typeof raw === 'object' && Array.isArray(raw.items) ? raw.items : null)
  if (list === null) return null
  const out = []
  for (const item of list) {
    if (typeof item === 'string') {
      if (item.trim() !== '') out.push({ id: item.trim(), title: item.trim() })
      continue
    }
    if (item === null || typeof item !== 'object') continue
    const title = firstString(item.title, item.name, item.file, item.id)
    if (title === '') continue
    out.push({ id: firstString(item.id, item.key, title) || title, title })
  }
  return out
}

function sendJson(res, body) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function methodNotAllowed(res) {
  res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ ok: false, error: 'method-not-allowed' }))
}

/* 归一化函数导出，只为离线自检用（宿主加载器只用 apply）：
 *   node --input-type=module -e "import('./lib/index.js').then(m => …)" */
export { normalize, normalizeArticles, payloadOf }

/**
 * 造出这一版实现的路由处理函数。壳（lib/index.js）每个请求调一次，
 * 所以这里可以随便改、不用重启。
 * @param ctx - host plugin context（需要 webServer / tools / skills）。
 * @param config - this row's config from cordis.patch.yml。
 * @returns `{ handlers: { [path]: (req, res) => Promise<void> } }`。
 */
export function create(ctx, config) {
  const cfg = config !== null && typeof config === 'object' ? config : {}
  const knowledgeServer = firstString(cfg.knowledgeServer) || DEFAULT_KNOWLEDGE_SERVER
  const libraryServer = firstString(cfg.libraryServer) || DEFAULT_LIBRARY_SERVER
  const clientsTool = firstString(cfg.clientsTool)
  const articlesTool = firstString(cfg.articlesTool) || 'list_articles'

  const hostCtx = ctx
  const handlers = {}

    /* ---- 诊断：这台 Host 挂了哪些 MCP、各有哪些工具 ---------------- */
    handlers[MCP_INFO_PATH] = (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const servers = new Map()
      for (const name of hostCtx.tools.schemas().map(schema => schema.name)) {
        const match = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(name)
        if (match === null) continue
        if (!servers.has(match[1])) servers.set(match[1], [])
        servers.get(match[1]).push(match[2])
      }
      sendJson(res, {
        ok: true,
        configured: { knowledgeServer, libraryServer, clientsTool, articlesTool },
        servers: [...servers.entries()]
          .map(([server, tools]) => ({ server, tools: tools.sort() }))
          .sort((a, b) => a.server.localeCompare(b.server)),
        toolCount: hostCtx.tools.schemas().length,
      })
    }

    /* ---- 知识库：客户名单（不缓存）-------------------------------- */
    handlers[CLIENTS_PATH] = async (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const tool = pickTool(hostCtx, knowledgeServer, clientsTool, [/hierarch/i, /(list|space|customer|client)/i])
      if (tool === '') {
        sendJson(res, {
          ok: false,
          error: 'mcp-missing',
          detail: `没找到 ${knowledgeServer} 的工具。设置 → MCP 里确认这台服务器已连接。`,
          available: hostCtx.tools.schemas().map(schema => schema.name).filter(name => name.startsWith('mcp__')).sort(),
        })
        return
      }
      const called = await callTool(hostCtx, knowledgeServer, tool, {})
      if (!called.ok) {
        sendJson(res, { ok: false, error: called.error, detail: called.detail, server: knowledgeServer, tool })
        return
      }
      const customers = normalize(called.value)
      if (customers === null) {
        sendJson(res, { ok: false, error: 'bad-reply', detail: `认不出 ${tool} 的返回形状（收到 ${describe(called.value)}）`, server: knowledgeServer, tool })
        return
      }
      sendJson(res, { ok: true, customers, server: knowledgeServer, tool })
    }

    /* ---- 文章库：某个客户已有的文章 -------------------------------- */
    handlers[ARTICLES_PATH] = async (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      const url = new URL(req.url ?? '/', 'http://dsh.invalid')
      const client = (url.searchParams.get('client') ?? '').trim()
      if (client === '') {
        sendJson(res, { ok: false, error: 'bad-request', detail: '缺少 client 参数' })
        return
      }
      const tool = pickTool(hostCtx, libraryServer, articlesTool, [/list/i, /article/i])
      if (tool === '') {
        sendJson(res, {
          ok: false,
          error: 'mcp-missing',
          detail: `没找到 ${libraryServer} 的工具。设置 → MCP 里确认这台服务器已连接。`,
        })
        return
      }
      const called = await callTool(hostCtx, libraryServer, tool, { client })
      if (!called.ok) {
        sendJson(res, { ok: false, error: called.error, detail: called.detail, server: libraryServer, tool })
        return
      }
      const articles = normalizeArticles(called.value)
      if (articles === null) {
        sendJson(res, { ok: false, error: 'bad-reply', detail: `认不出 ${tool} 的返回形状（收到 ${describe(called.value)}）`, server: libraryServer, tool })
        return
      }
      sendJson(res, { ok: true, articles, client, server: libraryServer, tool })
    }

    /* ---- 技能：dsh-skill-remote 注册的 provider 目录 ---------------- */
    handlers[SKILLS_PATH] = async (req, res) => {
      if (req.method !== 'GET') { methodNotAllowed(res); return }
      try {
        const summaries = await hostCtx.skills.list({ cwd: process.cwd(), signal: AbortSignal.timeout(TOOL_TIMEOUT_MS) })
        sendJson(res, {
          ok: true,
          skills: summaries.map(summary => ({
            name: String(summary.name ?? ''),
            description: String(summary.description ?? ''),
            whenToUse: typeof summary.whenToUse === 'string' ? summary.whenToUse : '',
            provider: String(summary.provider ?? ''),
            modelInvocable: summary.invocation === undefined ? true : summary.invocation.modelInvocable === true,
          })).filter(skill => skill.name !== ''),
        })
      } catch (error) {
        sendJson(res, {
          ok: false,
          error: 'skills-unavailable',
          detail: String(error && error.message ? error.message : error),
        })
      }
    }

  return { handlers }
}
