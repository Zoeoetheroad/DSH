// dsh-skill-remote —— 从远程技能服务拉取 skill 的 provider 插件
//
// 官方只提供「读本地目录」的 skill provider（dsh-skill-filesystem）。
// 这个插件补上「从远程 HTTP 服务读」：技能统一存云端，本地不落文件。
//
// 配置（挂在宿主层）：
//   { id: skill-remote, name: 'dsh-skill-remote', config: { url, token } }
//
// 服务端接口约定（见 README）：
//   GET {url}/skills                    → [{ name, description, whenToUse? }]
//   GET {url}/skills/{name}             → SKILL.md 全文
//   GET {url}/skills/{name}/{path}      → 包内附属文件（references/x.md 等）
//
// 设计要点：
//   - 目录（list）会被频繁调用 → 带 TTL 缓存，正常情况不产生网络请求
//   - 正文（get）不缓存 → 云端改了，下一次加载就是新的
//   - 后台轮询目录，**只有内容真的变了**才 invalidate()，避免无谓的目录刷新

export const name = 'skill-remote'
export const inject = ['skills']

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const DEFAULTS = {
  providerName: 'remote',
  rank: 50, // 本地目录是 100；50 让远程优先
  cacheTtlMs: 60_000, // 目录缓存时长
  pollMs: 120_000, // 后台轮询间隔；0 = 关闭
  timeoutMs: 10_000, // 单次请求超时
}

function trimBase(url) {
  return String(url ?? '').replace(/\/+$/, '')
}

export function apply(ctx, config = {}) {
  const baseUrl = trimBase(config.url)
  const token = String(config.token ?? '')
  const providerName = config.providerName ?? DEFAULTS.providerName
  const rank = Number(config.rank ?? DEFAULTS.rank)
  const cacheTtlMs = Number(config.cacheTtlMs ?? DEFAULTS.cacheTtlMs)
  const pollMs = Number(config.pollMs ?? DEFAULTS.pollMs)
  const timeoutMs = Number(config.timeoutMs ?? DEFAULTS.timeoutMs)

  // 附属文件的 base：默认不带 token（消费端自己带鉴权取）；
  // 若给了 resourceToken，则用服务端的路径带 token 形式 —— 相对路径能正常解析。
  const resourceToken = config.resourceToken ? String(config.resourceToken) : ''
  const resourceRoot = resourceToken ? `${baseUrl}/t/${resourceToken}/skills` : `${baseUrl}/skills`

  if (!baseUrl) {
    throw new Error('dsh-skill-remote: 缺少 config.url（远程技能服务地址）')
  }

  // ---------- HTTP ----------
  async function httpGet(path, outerSignal) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    const onAbort = () => ac.abort()
    outerSignal?.addEventListener('abort', onAbort, { once: true })
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        signal: ac.signal,
      })
      if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`)
      return await res.text()
    } finally {
      clearTimeout(timer)
      outerSignal?.removeEventListener('abort', onAbort)
    }
  }

  // ---------- 目录缓存 ----------
  let cache = null // { at:number, digest:string, items:Array }
  let inflight = null

  async function fetchCatalog(signal) {
    const text = await httpGet('/skills', signal)
    const items = JSON.parse(text)
    if (!Array.isArray(items)) throw new Error('技能目录格式不对：应为数组')
    return items
  }

  async function catalog(signal) {
    const now = Date.now()
    if (cache && now - cache.at < cacheTtlMs) return cache.items
    if (inflight) return inflight
    inflight = (async () => {
      const items = await fetchCatalog(signal)
      cache = { at: Date.now(), digest: JSON.stringify(items), items }
      return items
    })()
    try {
      return await inflight
    } finally {
      inflight = null
    }
  }

  function toCandidate(it) {
    // 技能来自哪一层（公共 / 中间层 / 个人）。服务端返回 layer；没有就退回 'remote'。
    // 放进 source：它是「来源桶」，是 SkillSummary 上唯一能带自定义字符串的字段，
    // 消费端（工作台等）可以据此分层展示。
    const layer = it.layer ? String(it.layer) : null
    return {
      name: it.name,
      description: String(it.description ?? ''),
      whenToUse: it.whenToUse ? String(it.whenToUse) : undefined,
      invocation: { modelInvocable: true, userInvocable: true },
      source: layer ?? 'remote',
      provider: providerName,
      rank,
      locator: { name: it.name },
      ...(layer ? { metadata: { layer } } : {}),
      resourceBase: { kind: 'url', url: `${resourceRoot}/${it.name}` },
    }
  }

  // ---------- 注册 provider ----------
  ctx.skills.registerProvider((control) => {
    // 后台轮询：内容真变了才通知刷新，避免无谓的目录抖动
    if (pollMs > 0) {
      const timer = setInterval(async () => {
        try {
          const items = await fetchCatalog(control.signal)
          const digest = JSON.stringify(items)
          if (!cache || digest !== cache.digest) {
            cache = { at: Date.now(), digest, items }
            control.invalidate()
          } else {
            cache.at = Date.now()
          }
        } catch {
          // 云端暂时不可达：保持现状，下一轮再试
        }
      }, pollMs)
      timer.unref?.()
      control.signal.addEventListener('abort', () => clearInterval(timer), { once: true })
    }

    return {
      name: providerName,

      async list(options = {}) {
        try {
          const items = await catalog(options.signal)
          return items.filter((it) => it && NAME_RE.test(String(it.name ?? '')) && it.description).map(toCandidate)
        } catch (error) {
          // 拉不到时：有缓存就先用旧的并标记不完整（消费端会保留上一份可用目录）
          if (cache) {
            return { candidates: cache.items.map(toCandidate), complete: false }
          }
          throw error
        }
      },

      async get(candidate, options = {}) {
        const skillName = candidate?.locator?.name ?? candidate?.name
        const text = await httpGet(`/skills/${encodeURIComponent(skillName)}`, options.signal)
        return {
          name: candidate.name,
          description: candidate.description,
          whenToUse: candidate.whenToUse,
          invocation: candidate.invocation,
          source: candidate.source,
          provider: providerName,
          content: text,
          resourceBase: candidate.resourceBase,
        }
      },
    }
  })
}
