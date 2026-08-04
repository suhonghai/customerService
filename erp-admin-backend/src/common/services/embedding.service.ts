import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import OpenAI from 'openai';
import { Subscription } from 'rxjs';
import { AiConfigService, ActiveAiConfig } from '../../modules/ai-config/ai-config.service';

/**
 * Embedding 服务(Day 5,Day 11 重构为热重载)
 *
 * 关键(W11):
 * - 启动时 onModuleInit 主动从 AiConfigService.getActive() 拉当前 active 配置
 * - 订阅 AiConfigService.configChanged$,后台改 ai-config 后热重载 OpenAI client
 * - 没有 active 配置时,降级用 process.env.DASHSCOPE_* + 默认 model
 *   (允许容器在 DB 还没 seed 时也能起得来)
 *
 * 兼容性:
 * - 百炼 batch 上限 10,大于 10 自动分批
 * - 失败时 throw,让上层 audit 记录
 * - OpenAI client 不能改 key/baseURL,只能重新构造实例
 */

const DEFAULT_MODEL = 'text-embedding-v4';
const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const BATCH_SIZE = 10;

interface DashscopeConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
}

@Injectable()
export class EmbeddingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmbeddingService.name);
  private openaiClient: OpenAI | null = null;
  private currentConfig: DashscopeConfig | null = null;
  private subscription: Subscription | null = null;
  private initialized = false;

  constructor(private readonly aiConfigService: AiConfigService) {}

  /**
   * 启动时:
   * 1. 订阅 AiConfigService 的 configChanged$
   * 2. 主动拉一次 active 配置并初始化 client(失败降级 env)
   */
  async onModuleInit(): Promise<void> {
    // 订阅后台变更 → 立刻热重载
    this.subscription = this.aiConfigService.configChanged$.subscribe({
      next: (cfg) => {
        if (!cfg) {
          this.logger.warn('configChanged$ emitted null (no active config),keep current client');
          return;
        }
        try {
          this.refreshClient(this.toDashscopeConfig(cfg));
          this.logger.log(
            `热重载 OpenAI client: model=${this.currentConfig?.model} baseURL=${this.currentConfig?.baseURL ?? '(default)'}`,
          );
        } catch (e) {
          this.logger.error(`热重载 OpenAI client 失败: ${(e as Error).message}`);
        }
      },
      error: (err) => {
        this.logger.error(`configChanged$ stream error: ${(err as Error).message}`);
      },
    });

    // 主动拉一次(DB 可能还没 seed,失败降级 env)
    await this.bootstrapClient();
  }

  async onModuleDestroy(): Promise<void> {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  /**
   * 把 AiConfigService 返的 ActiveAiConfig 投影成 DashscopeConfig
   *
   * 设计(W11 闭环修正 2026-07-13):embedding 模型与 chat 模型**解耦**。
   * - apiKey / baseURL 从 active chat config 取(热重载 key 轮换 + 切 provider 是真需求)
   * - model **不**从 chat config 取(chat model 是 qwen3.7-plus,
   *   embedding 必须是 text-embedding-v4,跨类别 dashscope OpenAI compat mode 返 404)
   * - model 走 process.env.EMBED_MODEL,默认 'text-embedding-v4'
   * - 切换 chat model 不影响 embedding,切换 embedding model 需要改 env 重启
   */
  private toDashscopeConfig(cfg: ActiveAiConfig): DashscopeConfig {
    return {
      apiKey: cfg.apiKey,
      baseURL: cfg.baseUrl || undefined,
      model: process.env.EMBED_MODEL || DEFAULT_MODEL,
    };
  }

  /**
   * 启动阶段:试 DB → 失败 fallback env
   */
  private async bootstrapClient(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // 1) 试 DB 拿 active
    try {
      const active = await this.aiConfigService.getActiveInternal();
      if (active) {
        this.refreshClient(this.toDashscopeConfig(active));
        this.logger.log(
          `启动 init from DB active config: model=${active.modelId} provider=${active.provider}`,
        );
        return;
      }
    } catch (e) {
      this.logger.warn(`启动拿不到 active ai-config(降级 env): ${(e as Error).message}`);
    }

    // 2) fallback env
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (apiKey) {
      this.refreshClient({
        apiKey,
        model: process.env.EMBED_MODEL || DEFAULT_MODEL,
        baseURL: process.env.DASHSCOPE_BASE_URL || DEFAULT_BASE_URL,
      });
      this.logger.log(`启动 init from env fallback: model=${this.currentConfig?.model}`);
    } else {
      this.logger.warn(
        'EmbeddingService 启动时无 active ai-config 且无 env fallback,embed() 调用将抛错直到后台配置生效',
      );
    }
  }

  /**
   * 重新构造 OpenAI client(因为 OpenAI SDK 不能 in-place 改 key)
   */
  private refreshClient(cfg: DashscopeConfig): void {
    this.openaiClient = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL || DEFAULT_BASE_URL,
    });
    this.currentConfig = cfg;
  }

  /**
   * 每次 embed 前确保 client 就绪,否则 throw 给上层
   */
  private ensureClient(): { client: OpenAI; model: string } {
    if (!this.openaiClient || !this.currentConfig) {
      throw new Error(
        'EmbeddingService 未初始化:无 active ai-config 且无 env fallback。请先在后台配置 AI 模型。',
      );
    }
    return {
      client: this.openaiClient,
      model: this.currentConfig.model,
    };
  }

  /**
   * 批量 embed 文本
   * @param texts 待 embed 的字符串数组
   * @returns 与 texts 等长的向量数组(每项 number[])
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];
    const { client, model } = this.ensureClient();
    const all: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      try {
        const resp = await client.embeddings.create({
          model,
          input: batch,
          encoding_format: 'float',
        });
        // resp.data 顺序与 input 顺序一致(SDK 保证)
        for (const item of resp.data) {
          if (!item.embedding || item.embedding.length === 0) {
            throw new Error('empty embedding returned');
          }
          all.push(item.embedding);
        }
        this.logger.log(`embedded batch [${i}-${i + batch.length - 1}] / total=${texts.length}`);
      } catch (e) {
        this.logger.error(
          `embedding batch failed [${i}-${i + batch.length - 1}]: ${(e as Error).message}`,
        );
        throw e;
      }
    }
    return all;
  }
}
