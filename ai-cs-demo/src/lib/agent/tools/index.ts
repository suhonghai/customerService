import { getWeather } from './get-weather'
import { calc } from './calc'
import { searchDocs } from './search-docs'
import { getCurrentTime } from './get-time'

/**
 * 4 个 Agent 工具 — 体现手册 §4.6:
 *  - [x] Tool Calling(自定义工具 + Zod 参数)
 *  - [x] maxSteps 多步推理(让 AI 自己串起来)
 *  - [x] UI 展示工具调用过程(前端 tool-invocation 渲染,见 page.tsx)
 *  - [x] 切换模型(沿用 W3-4 的 CHAT_MODEL)
 *  - [ ] LangGraph.js(本项目用 AI SDK 单独够用,W6 后单独研究)
 */
export const tools = {
  get_weather: getWeather,
  calc,
  search_docs: searchDocs,
  get_current_time: getCurrentTime,
} as const

export { getWeather, calc, searchDocs, getCurrentTime }
