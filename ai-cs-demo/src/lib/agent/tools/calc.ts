import { z } from 'zod'
import { defineTool } from './define-tool'

/**
 * 安全计算器:用白名单解析,只支持数字 + 四则运算 + 括号 + 小数点
 * 不用 eval/new Function(防注入)
 * 体现手册 §4.6:Tool Calling + Zod
 */

function tokenize(expr: string): string[] {
  const re = /\s*(\d+\.?\d*|[+\-*/()])/g
  const tokens: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(expr)) !== null) tokens.push(m[1])
  const consumed = tokens.join('').replace(/\s+/g, '')
  const cleaned = expr.replace(/\s+/g, '')
  if (consumed !== cleaned) {
    throw new Error(`非法字符,只支持数字和 + - * / ( )`)
  }
  return tokens
}

function parse(tokens: string[]): number {
  let pos = 0
  const peek = () => tokens[pos]
  const consume = () => tokens[pos++]
  function parseExpr(): number {
    let left = parseTerm()
    while (peek() === '+' || peek() === '-') {
      const op = consume()
      const right = parseTerm()
      left = op === '+' ? left + right : left - right
    }
    return left
  }
  function parseTerm(): number {
    let left = parseFactor()
    while (peek() === '*' || peek() === '/') {
      const op = consume()
      const right = parseFactor()
      if (op === '/' && right === 0) throw new Error('除数不能为 0')
      left = op === '*' ? left * right : left / right
    }
    return left
  }
  function parseFactor(): number {
    const t = peek()
    if (t === '(') {
      consume()
      const v = parseExpr()
      const close = consume()
      if (close !== ')') throw new Error('括号不匹配')
      return v
    }
    if (/^\d+\.?\d*$/.test(t)) {
      consume()
      return parseFloat(t)
    }
    if (t === '-') {
      consume()
      return -parseFactor()
    }
    throw new Error(`无法解析: '${t}'`)
  }
  const result = parseExpr()
  if (pos !== tokens.length) throw new Error('表达式未完整解析')
  return result
}

export const calc = defineTool({
  description:
    '安全计算数学表达式。支持 + - * / ( ) 和小数。不支持函数、变量、负号(开头可)。当用户问数学题时调用。',
  inputSchema: z.object({
    expression: z
      .string()
      .describe(
        '数学表达式,例如: "(3 + 5) * 2"、"100 / 4 - 7"。"3.14 * 2" — 不支持幂运算,改用乘法',
      ),
  }),
  execute: async ({ expression }) => {
    // calc 是同步纯计算,不接 signal 也不需要 catch(异常会冒到 defineTool wrapper,
    // 然后结构化返回 {error: true, message})
    const tokens = tokenize(expression)
    const v = parse(tokens)
    const value = Math.round(v * 1e8) / 1e8
    return { expression, value }
  },
})
