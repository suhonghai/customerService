#!/usr/bin/env node
/**
 * W9-10 Day 9:为 README 截 2 张演示截图
 *
 * 输出:
 *   docs/screenshots/day9-f7-export-main.png        主界面(对话 + AI 答 + 工具调用 + 导出按钮)
 *   docs/screenshots/day9-f7-export-escalate.png    转人工(工单号气泡 + 已转人工标识)
 *
 * 跑法:
 *   node scripts/capture-readme-screenshots.mjs
 *
 * 设计:
 *   - 自动启 pnpm dev(端口 9529),结束 SIGTERM
 *   - 复用 test-cs-e2e.mjs 已验证的 wait 模式(发送按钮存在 = 流结束)
 *   - 1440x900 viewport,fullPage 截图(给 README 留宽屏空间)
 */

import { spawn } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'
import { mkdir, stat } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const SCREENSHOT_DIR = resolve(PROJECT_ROOT, 'docs/screenshots')
const BASE_URL = 'http://localhost:9529'
const CASE_TIMEOUT_MS = 120_000
const DEV_BOOT_WAIT_MS = 12_000

// ============ Dev server 生命周期 ============

let devServer = null

async function waitForServer(url, maxMs = 30_000) {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status < 500) return true
    } catch { /* 还连不上 */ }
    await wait(500)
  }
  return false
}

async function startDevServer() {
  console.log('[setup] starting pnpm dev ...')
  devServer = spawn('pnpm', ['dev'], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  })
  let serverLog = ''
  devServer.stdout.on('data', d => { serverLog += d.toString() })
  devServer.stderr.on('data', d => { serverLog += d.toString() })
  await wait(DEV_BOOT_WAIT_MS)
  const ready = await waitForServer(`${BASE_URL}/api/faq-info`, 30_000)
  if (!ready) {
    devServer.kill('SIGKILL')
    throw new Error(`Dev server did not become ready.\nLog tail:\n${serverLog.slice(-2000)}`)
  }
  // 预热关键路由
  for (const p of ['/api/store-info', '/api/documents', '/api/faq-info']) {
    try { await fetch(`${BASE_URL}${p}`) } catch { /* ignore */ }
  }
  console.log('[setup] dev server ready')
}

async function stopDevServer() {
  if (!devServer) return
  devServer.kill('SIGTERM')
  await wait(2000)
  if (!devServer.killed) devServer.kill('SIGKILL')
  devServer = null
}

// ============ 工具函数 ============

async function waitForStreamComplete(page, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const state = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const hasStop = buttons.some(b => b.textContent?.trim() === '停止')
      const hasSend = buttons.some(b =>
        b.textContent?.trim() === '发送' && b.type === 'submit',
      )
      return { hasStop, hasSend }
    })
    if (!state.hasStop && state.hasSend) return
    await wait(1000)
  }
  throw new Error(`waitForStreamComplete timeout (${timeoutMs}ms)`)
}

async function fillChatInput(page, text) {
  const input = page.locator('input[placeholder="说点什么..."]')
  await input.fill(text)
  // 给 React 渲染时间(focus + onChange → setState → button re-render)
  await page.waitForTimeout(800)
  // 等 React 重渲 — 按钮变成可点;最多 15s
  await page.locator('button[type="submit"]:has-text("发送"):not([disabled])').waitFor({ timeout: 15_000 })
}

async function clickSend(page) {
  await page.locator('button[type="submit"]:has-text("发送"):not([disabled])').click()
}

// ============ 主流程 ============

async function capture() {
  await mkdir(SCREENSHOT_DIR, { recursive: true })
  await startDevServer()

  const browser = await chromium.launch({ headless: true })

  // 已存在则跳过(便于多次重跑)
  async function exists(p) {
    try { await stat(p); return true } catch { return false }
  }

  try {
    // ====== 截图 1:主界面(对话 + 导出按钮) ======
    const shot1Path = resolve(SCREENSHOT_DIR, 'day9-f7-export-main.png')
    if (await exists(shot1Path)) {
      console.log(`[shot 1/2] main: ⏭️  跳过(已存在)`)
    } else {
      console.log('[shot 1/2] main: start')
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'zh-CN',
      })
      const page = await ctx.newPage()
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
      await page.locator('text=+ 新会话').waitFor({ timeout: 10_000 })
      await page.locator('button:has-text("+ 新会话")').click()
      await page.waitForTimeout(1500)

      // 触发主流程:订单 + FAQ(沿用 Case 1 的 query)
      await fillChatInput(page, '订单 #002 想退换货,你们的退换货政策是什么?')
      await clickSend(page)
      await waitForStreamComplete(page, CASE_TIMEOUT_MS)
      await page.waitForTimeout(3000)

      // 展开「AI 决策过程」面板(截图能体现 F4 推理 + 工具调用)
      const decision = page.locator('summary:has-text("AI 决策过程")').first()
      if (await decision.count() > 0) {
        try {
          await decision.click({ timeout: 2000 })
          await page.waitForTimeout(800)
        } catch { /* 已展开 */ }
      }

      // 再问一个 FAQ 问题,丰富对话流
      await fillChatInput(page, '如何申请退款?')
      await clickSend(page)
      await waitForStreamComplete(page, CASE_TIMEOUT_MS)
      await page.waitForTimeout(2000)

      const out = resolve(SCREENSHOT_DIR, 'day9-f7-export-main.png')
      await page.screenshot({ path: out, fullPage: true })
      console.log(`[shot 1/2] main: ✅ ${out}`)
      await ctx.close()
    }

    // ====== 截图 2:转人工(工单号气泡) ======
    const shot2Path = resolve(SCREENSHOT_DIR, 'day9-f7-export-escalate.png')
    if (await exists(shot2Path)) {
      console.log(`[shot 2/2] escalate: ⏭️  跳过(已存在)`)
    } else {
      console.log('[shot 2/2] escalate: start')
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'zh-CN',
      })
      const page = await ctx.newPage()
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
      await page.locator('text=+ 新会话').waitFor({ timeout: 10_000 })
      await page.locator('button:has-text("+ 新会话")').click()
      await page.waitForTimeout(1500)

      // 先发一条触发 AI 答
      await fillChatInput(page, '我的订单有问题想找人工客服')
      await clickSend(page)
      await waitForStreamComplete(page, CASE_TIMEOUT_MS)
      await page.waitForTimeout(1500)

      // 点「转人工」
      const escalateBtn = page.locator('button:has-text("转人工")').first()
      await escalateBtn.waitFor({ timeout: 10_000 })
      await escalateBtn.click()

      // 等工单号气泡
      await page.locator('text=/H-\\d{8}\\d{3}/').first().waitFor({ timeout: CASE_TIMEOUT_MS })
      await page.waitForTimeout(1500)

      const out = resolve(SCREENSHOT_DIR, 'day9-f7-export-escalate.png')
      await page.screenshot({ path: out, fullPage: true })
      console.log(`[shot 2/2] escalate: ✅ ${out}`)
      await ctx.close()
    }
  } finally {
    await browser.close()
    await stopDevServer()
  }

  console.log('\n=== README 截图完成 ===')
}

capture().catch(err => {
  console.error(`\n[main] fatal: ${err.message}`)
  console.error(err.stack)
  process.exit(1)
})
