#!/usr/bin/env node
/**
 * 截图工具 —— 工作台改造的「眼睛」。
 *
 * 为什么需要它：客户端插件的注册失败（槽位没声明、重复注册、React 抛错）
 * **只在浏览器里报**，宿主的 stderr 一个字都不会说。没有这个工具，改界面就是盲改。
 *
 * 做法：起一个 chromium，带上本机 dsh web 的浏览器 cookie（签名密钥从
 * $DSH_HOME/.credentials.yaml 读，只在内存里用，不落盘、不打印），截若干张图，
 * 并把控制台里的 error / warning 全部打出来。
 *
 *   node tools/shot.mjs [输出目录]
 *   node tools/shot.mjs /tmp/shots --url http://127.0.0.1:3100 --click 工作台
 *   node tools/shot.mjs /tmp/shots --dump      # 只打印侧栏的可访问结构，不截图
 */

import { createHash, createHmac } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const outDir = args[0] !== undefined && !args[0].startsWith('--') ? args[0] : '/tmp/wb-shots'
const flag = name => {
  const index = args.indexOf(`--${name}`)
  return index < 0 ? undefined : (args[index + 1] ?? true)
}
const url = String(flag('url') ?? 'http://127.0.0.1:3100')
const clickText = flag('click') === undefined ? '工作台' : String(flag('click'))
const dumpOnly = args.includes('--dump')

/* ---- 1) playwright：包不在根 node_modules 里，去 pnpm store 里找 -------- */
function loadPlaywright() {
  const root = '/opt/dsh/src/deepseek-harness'
  const candidates = []
  const store = join(root, 'node_modules', '.pnpm')
  if (existsSync(store)) {
    for (const entry of readdirSync(store)) {
      if (entry.startsWith('playwright@')) candidates.push(join(store, entry, 'node_modules', 'playwright'))
    }
  }
  candidates.push(join(root, 'node_modules', 'playwright'))
  candidates.push('/usr/local/lib/nodejs/node-v24.14.1-linux-x64/lib/node_modules/playwright')
  candidates.push('/usr/local/lib/node_modules/playwright')

  let fallback
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    let loaded
    try {
      loaded = createRequire(join(candidate, 'package.json'))(candidate)
    } catch { continue }
    /* Several playwright installs coexist here (a global CLI and the pinned
     * one in the pnpm store) and they want DIFFERENT chromium builds. Pick
     * the one whose browser is actually on disk; remembering the first
     * resolvable as a fallback keeps the error message useful. */
    try {
      if (existsSync(loaded.chromium.executablePath())) {
        console.log(`[shot] playwright: ${candidate}`)
        return loaded
      }
    } catch { /* keep looking */ }
    fallback ??= { candidate, loaded }
  }
  if (fallback !== undefined) {
    console.log(`[shot] 没有已下载的浏览器，用 ${fallback.candidate}（它会报 executablePath 缺失）`)
    return fallback.loaded
  }
  throw new Error('playwright not found — 检查 /opt/dsh/src/deepseek-harness/node_modules/.pnpm')
}

/* ---- 2) cookie：把 dsh web 的浏览器会话签出来 ---------------------------- */
function mintCookie(target) {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const credentials = join(home, '.credentials.yaml')
  if (!existsSync(credentials)) throw new Error(`找不到 ${credentials}`)
  const match = /secret:\s*(\S+)/.exec(readFileSync(credentials, 'utf8'))
  if (match === null) throw new Error('.credentials.yaml 里没有 browser-session secret')
  const secret = Buffer.from(match[1], 'base64url')
  if (secret.length !== 32) throw new Error(`secret 长度不对：${secret.length}`)
  const authority = new URL(target).host
  const now = Date.now()
  const payload = { version: 1, authority, issuedAt: now, expiresAt: now + 86_400_000 }
  const b64 = buffer => buffer.toString('base64url')
  const body = b64(Buffer.from(JSON.stringify(payload), 'utf8'))
  const signature = b64(createHmac('sha256', secret).update(body).digest())
  const name = `dsh-auth-${b64(createHash('sha256').update(authority).digest())}`
  return { name, value: `v1.${body}.${signature}` }
}

/* ---- 3) 跑 --------------------------------------------------------------- */
const { chromium } = loadPlaywright()
const cookie = mintCookie(url)
mkdirSync(outDir, { recursive: true })

/* 本机没有 playwright 自带的 chromium（官方 CDN 在这台机器上只有 40KB/s）。
 * 用 npmmirror 的 chrome-for-testing：同一个浏览器，200 倍的速度。
 * 下载：https://cdn.npmmirror.com/binaries/chrome-for-testing/<ver>/linux64/chrome-linux64.zip */
const chromePath = [
  process.env.WB_CHROME,
  '/opt/dsh/run/chrome-for-testing/chrome-linux64/chrome',
].find(candidate => candidate !== undefined && existsSync(candidate))

const browser = await chromium.launch(chromePath === undefined ? {} : { executablePath: chromePath })
if (chromePath !== undefined) console.log(`[shot] chrome: ${chromePath}`)
const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } })
await context.addCookies([{ ...cookie, domain: new URL(url).hostname, path: '/' }])
const page = await context.newPage()

const logs = []
page.on('console', message => {
  const type = message.type()
  if (type === 'error' || type === 'warning') logs.push(`[console.${type}] ${message.text()}`)
})
page.on('pageerror', error => logs.push(`[pageerror] ${error.message}`))
/* A console "Failed to load resource" line never says WHICH resource, and a
 * missing bundle / font / icon all look identical. Log the URL. */
const badResponses = []
page.on('response', response => {
  if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`)
})
page.on('requestfailed', request => {
  badResponses.push(`FAILED ${request.url()} — ${request.failure()?.errorText ?? 'unknown'}`)
})

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

if (dumpOnly) {
  const rows = await page.locator('nav button, aside button').allTextContents()
  console.log('侧栏/导航上的按钮：')
  for (const row of rows) console.log('  -', JSON.stringify(row.trim()))
  await browser.close()
  process.exit(0)
}

const shot = async name => {
  const path = join(outDir, `${name}.png`)
  await page.screenshot({ path })
  console.log('saved', path)
}

await shot('01-default')

if (clickText !== '') {
  /* 支持一串：--click "用模板,放大" —— 依次点，每步各截一张。 */
  const steps = String(clickText).split(',').map(step => step.trim()).filter(step => step !== '')
  let index = 0
  for (const step of steps) {
    index += 1
    const candidates = [
      page.getByRole('button', { name: step, exact: true }),
      page.locator(`[aria-label="${step}"]`),
      page.getByText(step, { exact: true }),
    ]
    let clicked = false
    for (const locator of candidates) {
      try {
        if (await locator.count() === 0) continue
        await locator.first().click({ timeout: 4000 })
        clicked = true
        break
      } catch { /* try the next strategy */ }
    }
    console.log(clicked ? `clicked 「${step}」` : `没找到 「${step}」——用 --dump 看结构`)
    await page.waitForTimeout(1500)
    await shot(`0${index + 1}-after-${index}`)
  }
}

/* --drag <selector>,<dy>：把某个把手往下拖 dy 像素。拖拽是原型里最容易出
 * 隐蔽 bug 的地方（它的 mousemove 挂在 document 上，鼠标移出窗口就卡住），
 * 所以这类交互必须实测，不能只看代码。 */
const dragSpec = flag('drag')
if (typeof dragSpec === 'string') {
  const [selector, dyRaw] = dragSpec.split(',')
  const dy = Number(dyRaw ?? 120)
  const box = await page.locator(selector).first().boundingBox()
  if (box === null) {
    console.log(`没找到可拖的 ${selector}`)
  } else {
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + dy / 2, { steps: 6 })
    await page.mouse.move(x, y + dy, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(600)
    console.log(`dragged ${selector} by ${dy}px`)
    await shot('90-after-drag')
  }
}

/* --dom <selector>：把一块 DOM 的骨架打出来（标签 + class + data-* + role），
 * 用来找能安全下手的钩子。比猜 hash 类名可靠得多 —— 那些每次重建都变。 */
const domSelector = flag('dom')
if (typeof domSelector === 'string') {
  const skeleton = await page.evaluate((selector) => {
    const root = document.querySelector(selector)
    if (root === null) return `(找不到 ${selector})`
    const lines = []
    const walk = (element, depth) => {
      if (depth > 7) return
      const attrs = []
      if (typeof element.className === 'string' && element.className.trim() !== '') {
        attrs.push(`.${element.className.trim().split(/\s+/).join('.')}`)
      }
      for (const attribute of element.attributes) {
        if (attribute.name.startsWith('data-') || attribute.name === 'role' || attribute.name === 'aria-label') {
          attrs.push(`[${attribute.name}="${attribute.value}"]`)
        }
      }
      const text = element.children.length === 0 ? ` «${(element.textContent ?? '').trim().slice(0, 36)}»` : ''
      lines.push(`${'  '.repeat(depth)}${element.tagName.toLowerCase()}${attrs.join('')}${text}`)
      for (const child of element.children) walk(child, depth + 1)
    }
    walk(root, 0)
    return lines.join('\n')
  }, domSelector)
  console.log('\n--- DOM: ' + domSelector + ' ---')
  console.log(skeleton)
}

if (badResponses.length > 0) {
  console.log('\n失败的网络请求：')
  for (const line of new Set(badResponses)) console.log('  ' + line)
}

if (logs.length > 0) {
  console.log('\n浏览器控制台：')
  for (const line of new Set(logs)) console.log('  ' + line)
} else {
  console.log('\n浏览器控制台：干净')
}

await browser.close()
