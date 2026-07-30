import { z } from 'zod'
import { defineTool } from './define-tool'
import { env } from '../../env'

/**
 * get_weather - 查天气
 *
 * 设计:默认返回 mock 数据(避免要 API key 才能跑)
 * 如果 .env.local 设了 WEATHER_API_KEY 且 WEATHER_API_URL,自动切到真实 API
 *
 * 体现手册 §4.6:Tool Calling + Zod + 错误处理 + AbortSignal
 */

interface WeatherResult {
  city: string
  temperature: number
  description: string
  humidity: number
  wind: string
  source: 'mock' | 'live'
}

const MOCK_DB: Record<string, Omit<WeatherResult, 'city' | 'source'>> = {
  北京: { temperature: 28, description: '晴', humidity: 45, wind: '东南风 3 级' },
  上海: { temperature: 31, description: '多云', humidity: 70, wind: '东风 2 级' },
  广州: { temperature: 33, description: '雷阵雨', humidity: 80, wind: '南风 2 级' },
  深圳: { temperature: 32, description: '多云', humidity: 75, wind: '东南风 3 级' },
  杭州: { temperature: 30, description: '阴', humidity: 65, wind: '北风 1 级' },
  成都: { temperature: 26, description: '小雨', humidity: 85, wind: '微风' },
  西安: { temperature: 25, description: '晴', humidity: 50, wind: '西北风 2 级' },
}

/**
 * 真实 API 调用(默认未启用,示意)
 * 真接时:和风 /dev/qvg/api?location=北京&key=YOUR_KEY
 * 接 signal:用户 stop 后 fetch 立即中断,不会等 API 响应
 */
async function fetchLiveWeather(
  city: string,
  signal: AbortSignal,
): Promise<WeatherResult | null> {
  const url = env.WEATHER_API_URL
  const key = env.WEATHER_API_KEY
  if (!url || !key) return null
  try {
    const res = await fetch(
      `${url}?location=${encodeURIComponent(city)}&key=${key}`,
      { signal },
    )
    if (!res.ok) return null
    const data = await res.json()
    return {
      city,
      temperature: data.temp,
      description: data.text,
      humidity: data.humidity,
      wind: `${data.windDir} ${data.windScale} 级`,
      source: 'live',
    }
  } catch (err) {
    // 取消是正常的,继续冒到 defineTool
    if (signal.aborted) throw err
    return null
  }
}

export const getWeather = defineTool({
  description:
    '查询指定中国城市的当前天气。返回温度、天气状况、湿度、风力。' +
    '当用户问"北京天气怎么样"、"上海今天多少度"、"XX 城市下雨吗"时调用。',
  inputSchema: z.object({
    city: z
      .string()
      .describe('城市名,例如:"北京"、"上海"、"广州"。不支持海外城市。'),
  }),
  execute: async ({ city }, ctx) => {
    // 优先真实 API(接 signal)
    const live = await fetchLiveWeather(city, ctx.signal)
    if (live) return live

    // 回退 mock
    const normalized = city.replace(/市$/, '')
    const mock = MOCK_DB[normalized] ?? MOCK_DB[city]
    if (mock) {
      return {
        city: normalized,
        temperature: mock.temperature,
        description: mock.description,
        humidity: mock.humidity,
        wind: mock.wind,
        source: 'mock' as const,
      }
    }
    // 没找到:定义错误(让 Agent 看到失败后能换措辞或告诉用户不支持)
    throw new Error(
      `没有 ${city} 的 mock 数据,只支持: ${Object.keys(MOCK_DB).join('、')}`,
    )
  },
})
