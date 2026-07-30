/**
 * Prompt 模板变量工具
 *
 * 从模板正文里 regex 提取 `{var_name}` 占位符,去重保序。
 * 与表单里手动声明的 variables 数组做 diff,用于提示用户补全 / 删多余声明。
 *
 * 命名规则(对齐后端 ai_prompt_template.service):
 *   - 以字母或下划线开头
 *   - 后续字符:字母 / 数字 / 下划线
 *   - 不允许带点 / 空格 / 中文(避免 JSON 序列化时出岔)
 */

export const VAR_REGEX = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/**
 * 从 content 文本里 regex 提取 `{var_name}` 占位符,去重保序。
 *
 * @example
 *   extractUsedVariables('你是 {store_name} 的 AI 客服,{store_name} 您好')
 *   // → ['store_name']
 */
export function extractUsedVariables(content: string): string[] {
  if (!content) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of content.matchAll(VAR_REGEX)) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * 把后端存的 variables(JSON 字符串,如 `'["store_name","ticket_no"]'`)
 * 安全地解析成字符串数组。失败返回空数组(UI 静默退化即可)。
 *
 * @example
 *   parseVariableList('["a","b"]') // → ['a','b']
 *   parseVariableList('')           // → []
 *   parseVariableList('not json')   // → []
 */
export function parseVariableList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

/**
 * 变量 diff 计算 — 模板里用了 vs 表单里声明的。
 *
 * @returns
 *   - `undeclared` 模板里用了但表单里没声明(必补)
 *   - `unused`     表单里声明了但模板里没用(可选删)
 */
export function diffVariables(
  used: string[],
  declared: string[],
): { undeclared: string[]; unused: string[] } {
  const declaredSet = new Set(declared);
  const usedSet = new Set(used);
  return {
    undeclared: used.filter((v) => !declaredSet.has(v)),
    unused: declared.filter((v) => !usedSet.has(v)),
  };
}
