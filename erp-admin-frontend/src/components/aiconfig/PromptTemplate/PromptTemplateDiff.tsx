import { useMemo } from 'react';
import { Alert, Tag } from 'antd';
import type { FormInstance } from 'antd';
import { Form } from 'antd';
import { extractUsedVariables, diffVariables } from '@/utils/variables';

export interface PromptTemplateDiffProps {
  // 用 any 兼容上层不同的 Form generic(create form 形参带 variables 数组);
  // Diff 只读 content / variables 两个字段,不需要严格约束。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: FormInstance<any>;
}

/**
 * 变量插值 diff 提示 — 必须在 <Form> 子树内使用 Form.useWatch。
 *
 * 实时从 content 文本里提取 `{var_name}` 占位符,跟表单里 declared variables 数组做 diff:
 *   - content 用了但没声明 → warning(后端会把 content 原样返回,真正插值由调用方做)
 *   - 声明了但 content 没用 → info(纯提示,可保留)
 *   - 完美对齐 → success
 *   - 模板 + 声明都空 → null(不渲染,避免视觉噪声)
 */
export function PromptTemplateDiff({ form }: PromptTemplateDiffProps) {
  const contentValue: string = Form.useWatch('content', form) || '';
  const declaredValue: string[] = Form.useWatch('variables', form) || [];
  const usedInTemplate = useMemo(() => extractUsedVariables(contentValue), [contentValue]);
  const { undeclared, unused } = useMemo(
    () => diffVariables(usedInTemplate, declaredValue),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usedInTemplate, declaredValue],
  );

  if (usedInTemplate.length === 0 && declaredValue.length === 0) return null;

  if (undeclared.length > 0) {
    return (
      <div style={{ marginBottom: 16 }} data-testid="prompt-diff-warning">
        <Alert
          type="warning"
          showIcon
          message={
            <span>
              模板中使用了 {undeclared.length} 个未声明的变量:
              {undeclared.map((v) => (
                <Tag color="orange" key={v} style={{ marginLeft: 4 }}>
                  {v}
                </Tag>
              ))}
            </span>
          }
        />
      </div>
    );
  }

  if (unused.length > 0) {
    return (
      <div style={{ marginBottom: 16 }} data-testid="prompt-diff-info">
        <Alert
          type="info"
          showIcon
          message={
            <span>
              已声明但模板中未使用的变量(可选保留):
              {unused.map((v) => (
                <Tag key={v} style={{ marginLeft: 4 }}>
                  {v}
                </Tag>
              ))}
            </span>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }} data-testid="prompt-diff-success">
      <Alert
        type="success"
        showIcon
        message={`变量声明完整(${usedInTemplate.length} 个): ${usedInTemplate.join(', ')}`}
      />
    </div>
  );
}
