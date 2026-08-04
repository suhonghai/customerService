import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BizException, BizCode } from '../../common/exceptions/biz.exception';
import { encryptApiKey, decryptApiKey, maskApiKey } from '../../common/utils/crypto.util';
import { CreateAiConfigDto } from './dto/create-ai-config.dto';
import { UpdateAiConfigDto } from './dto/update-ai-config.dto';
import { QueryAiConfigDto } from './dto/query-ai-config.dto';
import { TestAiConfigDto } from './dto/test-ai-config.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { generateText } from 'ai';
import type { LanguageModelUsage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const DEFAULT_BASE_URLS: Record<string, string> = {
  dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  openai: 'https://api.openai.com/v1',
  minimax: 'https://api.minimax.chat/v1',
};

/**
 * AI 配置 Service(Day 4 + Day 11 热重载)
 *
 * - 列表 / 详情: API key 脱敏(maskApiKey)
 * - active(给 ai-cs-demo): 返**解密**后的明文 + 写 audit
 * - 创 / 改: apiKey 入库前加密
 * - setDefault: 事务,清掉所有 is_default 再设
 * - test: 实际调 LLM,返 response + latencyMs + tokens
 *
 * 热重载(Day 11):
 * - 暴露 configChanged$ Subject,后台 create/update/set-default/delete 后
 *   emit 新 active 配置(若有);无 active 时 emit null
 * - 订阅者(EmbeddingService)据此重新构造 OpenAI client
 * - getActiveInternal() 不写 audit、不抛异常(给内部 init 用),
 *   失败时返 null,让 EmbeddingService 走 env fallback
 */
export interface ActiveAiConfig {
  id: number;
  code: string;
  name: string;
  provider: string;
  modelId: string;
  apiKey: string; // 明文
  baseUrl: string | null;
  temperature: number;
  topP: number;
  maxTokens: number;
  systemPrompt: string | null;
}

@Injectable()
export class AiConfigService {
  private readonly logger = new Logger(AiConfigService.name);
  /**
   * 配置变更广播(Day 11)
   * - emit(ActiveAiConfig):有新 active,订阅者需重新构造 client
   * - emit(null):没有 active(或被删了),订阅者按 fallback 处理
   */
  private readonly _configChanged$ = new Subject<ActiveAiConfig | null>();
  readonly configChanged$: Observable<ActiveAiConfig | null> = this._configChanged$.asObservable();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * 把 db row 的 apiKey 脱敏(返回时不暴露明文)
   * 注意: db row 拿出来的 apiKey 是密文,解密后才能 mask
   * 这里用 maskedEncrypted 简化:展示一个固定标记 + 末 4 位密文
   * 更准确做法: 解密后 maskApiKey;为了安全,解密只在必要时进行
   */
  private toSafeResponse(row: {
    id: number;
    code: string;
    name: string;
    provider: string;
    modelId: string;
    apiKey: string | null;
    baseUrl: string | null;
    temperature: number;
    topP: number;
    maxTokens: number;
    systemPrompt: string | null;
    description: string | null;
    isDefault: boolean;
    status: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    let masked = '****';
    if (row.apiKey) {
      try {
        const plain = decryptApiKey(row.apiKey);
        masked = maskApiKey(plain);
      } catch (e) {
        // 解密失败(比如密钥换了)→ 只显示 '****'
        this.logger.warn(`decrypt failed for config id=${row.id}: ${(e as Error).message}`);
      }
    }
    return { ...row, apiKey: masked };
  }

  /**
   * GET /api/ai-configs
   */
  async list(query: QueryAiConfigDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AiModelConfigWhereInput = { deletedAt: null };
    if (query.code) where.code = { contains: query.code };
    if (query.name) where.name = { contains: query.name };
    if (query.provider) where.provider = query.provider;
    if (query.status !== undefined) where.status = query.status;
    if (query.isDefault !== undefined) where.isDefault = query.isDefault;

    const orderBy: Prisma.AiModelConfigOrderByWithRelationInput = {
      [query.sortBy ?? 'id']: query.sortOrder ?? 'desc',
    } as Prisma.AiModelConfigOrderByWithRelationInput;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.aiModelConfig.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aiModelConfig.count({ where }),
    ]);

    return {
      list: rows.map((r) => this.toSafeResponse(r)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * GET /api/ai-configs/:id
   */
  async getById(id: number) {
    const row = await this.prisma.aiModelConfig.findUnique({ where: { id } });
    if (!row || row.deletedAt) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, 'AI 配置不存在');
    }
    return this.toSafeResponse(row);
  }

  /**
   * GET /api/ai-configs/active
   * 返当前默认配置,**包含明文 apiKey**(给 ai-cs-demo 调)
   * 写 audit_log
   */
  async getActive(operator: { id: number; username: string } | null) {
    const row = await this.getActiveRow();
    if (!row) {
      throw new BizException(BizCode.BIZ_ERROR, '未配置默认 AI 模型');
    }
    const apiKey = row.apiKey ? decryptApiKey(row.apiKey) : null;
    // 记 audit(异步)
    void this.audit.create({
      userId: operator?.id ?? null,
      username: operator?.username ?? null,
      module: 'ai-configs',
      action: 'pull-active',
      method: 'GET',
      path: '/api/ai-configs/active',
      resource: 'ai_model_config',
      resourceId: String(row.id),
      status: 1,
    });
    return { ...row, apiKey };
  }

  /**
   * 内部用 — 拿当前 active 配置,失败时返 null(给 EmbeddingService 启动降级用)
   * 不写 audit、不抛业务异常
   * 重试 1-2 次容忍冷启动时序(DB 还没 seed)
   */
  async getActiveInternal(): Promise<ActiveAiConfig | null> {
    const maxAttempts = 3;
    const delayMs = 500;
    let lastErr: unknown = null;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const row = await this.getActiveRow();
        if (row) {
          return {
            id: row.id,
            code: row.code,
            name: row.name,
            provider: row.provider,
            modelId: row.modelId,
            apiKey: row.apiKey ? decryptApiKey(row.apiKey) : '',
            baseUrl: row.baseUrl,
            temperature: row.temperature,
            topP: row.topP,
            maxTokens: row.maxTokens,
            systemPrompt: row.systemPrompt,
          };
        }
        return null;
      } catch (e) {
        lastErr = e;
        if (i < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }
    this.logger.warn(
      `getActiveInternal 重试 ${maxAttempts} 次仍失败: ${(lastErr as Error)?.message ?? 'unknown'}`,
    );
    return null;
  }

  private async getActiveRow() {
    return this.prisma.aiModelConfig.findFirst({
      where: { isDefault: true, deletedAt: null, status: 1 },
    });
  }

  /**
   * POST /api/ai-configs
   */
  async create(dto: CreateAiConfigDto) {
    const code = dto.code ?? this.generateCode(dto.provider);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) {
          // 取消其他默认
          await tx.aiModelConfig.updateMany({
            where: { isDefault: true, deletedAt: null },
            data: { isDefault: false },
          });
        }
        return tx.aiModelConfig.create({
          data: {
            code,
            name: dto.name,
            provider: dto.provider,
            modelId: dto.modelId,
            apiKey: encryptApiKey(dto.apiKey),
            baseUrl: dto.baseUrl ?? null,
            temperature: dto.temperature ?? 0.7,
            topP: dto.topP ?? 0.8,
            maxTokens: dto.maxTokens ?? 2000,
            systemPrompt: dto.systemPrompt ?? null,
            description: dto.description ?? null,
            isDefault: dto.isDefault ?? false,
            status: dto.status ?? 1,
          },
        });
      });
      await this.emitConfigChanged();
      return this.toSafeResponse(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BizException(BizCode.USERNAME_EXISTS, 'AI 配置 code 已存在');
      }
      throw e;
    }
  }

  /**
   * PUT /api/ai-configs/:id
   * apiKey 若传,会重加密
   */
  async update(id: number, dto: UpdateAiConfigDto) {
    const exist = await this.prisma.aiModelConfig.findUnique({ where: { id } });
    if (!exist || exist.deletedAt) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, 'AI 配置不存在');
    }
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault === true) {
          await tx.aiModelConfig.updateMany({
            where: { isDefault: true, deletedAt: null, NOT: { id } },
            data: { isDefault: false },
          });
        }
        return tx.aiModelConfig.update({
          where: { id },
          data: {
            code: dto.code ?? undefined,
            name: dto.name ?? undefined,
            provider: dto.provider ?? undefined,
            modelId: dto.modelId ?? undefined,
            apiKey: dto.apiKey ? encryptApiKey(dto.apiKey) : undefined,
            baseUrl: dto.baseUrl ?? undefined,
            temperature: dto.temperature ?? undefined,
            topP: dto.topP ?? undefined,
            maxTokens: dto.maxTokens ?? undefined,
            systemPrompt: dto.systemPrompt ?? undefined,
            description: dto.description ?? undefined,
            isDefault: dto.isDefault ?? undefined,
            status: dto.status ?? undefined,
          },
        });
      });
      await this.emitConfigChanged();
      return this.toSafeResponse(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BizException(BizCode.USERNAME_EXISTS, 'AI 配置 code 已存在');
      }
      throw e;
    }
  }

  /**
   * DELETE /api/ai-configs/:id
   * 软删(若唯一默认,拒)
   */
  async delete(id: number) {
    const exist = await this.prisma.aiModelConfig.findUnique({ where: { id } });
    if (!exist || exist.deletedAt) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, 'AI 配置不存在');
    }
    if (exist.isDefault) {
      // 检查是否还有其他启用配置
      const otherActive = await this.prisma.aiModelConfig.count({
        where: { deletedAt: null, status: 1, NOT: { id } },
      });
      if (otherActive === 0) {
        throw new BizException(BizCode.STATE_NOT_ALLOW, '唯一默认配置不可删除,请先设其他为默认');
      }
    }
    await this.prisma.aiModelConfig.delete({ where: { id } });
    await this.emitConfigChanged();
    return { id };
  }

  /**
   * POST /api/ai-configs/:id/set-default
   * 事务:取消其他默认 + 设当前为默认
   */
  async setDefault(id: number) {
    const exist = await this.prisma.aiModelConfig.findUnique({ where: { id } });
    if (!exist || exist.deletedAt) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, 'AI 配置不存在');
    }
    if (exist.status !== 1) {
      throw new BizException(BizCode.STATE_NOT_ALLOW, '已禁用的配置不可设为默认');
    }
    const updated = await this.prisma.$transaction([
      this.prisma.aiModelConfig.updateMany({
        where: { isDefault: true, deletedAt: null, NOT: { id } },
        data: { isDefault: false },
      }),
      this.prisma.aiModelConfig.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);
    await this.emitConfigChanged();
    return this.toSafeResponse(updated[1]);
  }

  /**
   * 通知订阅者配置变化
   * - 拿当前最新 active(若有)
   * - 订阅者据此重建 OpenAI client / 清空缓存
   */
  private async emitConfigChanged(): Promise<void> {
    try {
      const active = await this.getActiveInternal();
      this._configChanged$.next(active);
      if (active) {
        this.logger.log(
          `ai-config changed → broadcast active config id=${active.id} model=${active.modelId}`,
        );
      } else {
        this.logger.log(`ai-config changed → no active config (broadcasted null to subscribers)`);
      }
    } catch (e) {
      this.logger.error(`emitConfigChanged failed: ${(e as Error).message}`);
    }
  }

  /**
   * POST /api/ai-configs/:id/test
   * 实际调 LLM,返 response + latencyMs + tokens
   */
  async test(id: number, dto: TestAiConfigDto) {
    const config = await this.prisma.aiModelConfig.findUnique({ where: { id } });
    if (!config || config.deletedAt) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, 'AI 配置不存在');
    }
    if (!config.apiKey) {
      throw new BizException(BizCode.BIZ_ERROR, 'AI 配置未设置 API key');
    }

    const baseUrl = config.baseUrl || DEFAULT_BASE_URLS[config.provider];
    if (!baseUrl) {
      throw new BizException(BizCode.BIZ_ERROR, '未配置 baseUrl');
    }

    const apiKey = decryptApiKey(config.apiKey);
    const start = Date.now();
    let response = '';
    let usage: LanguageModelUsage | undefined;
    let errMsg: string | null = null;
    try {
      // createOpenAI 支持自定义 baseURL,可对接 dashscope / openai / minimax 等 OpenAI 兼容服务
      const provider = createOpenAI({
        apiKey,
        baseURL: baseUrl,
      });
      const result = await generateText({
        model: provider(config.modelId),
        prompt: dto.prompt,
        system: dto.systemPrompt ?? config.systemPrompt ?? undefined,
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
      });
      response = result.text;
      usage = result.usage;
    } catch (e) {
      errMsg = e instanceof Error ? e.message : 'unknown';
      this.logger.warn(`AI test failed for config id=${id}: ${errMsg}`);
      // 不抛,返 200 + 错误信息,前端可控
    }
    const latencyMs = Date.now() - start;
    return {
      response,
      latencyMs,
      tokens: usage?.totalTokens ?? 0,
      promptTokens: usage?.inputTokens ?? 0,
      completionTokens: usage?.outputTokens ?? 0,
      success: !errMsg,
      error: errMsg,
    };
  }

  private generateCode(provider: string): string {
    const ts = Date.now().toString(36);
    return `${provider}_${ts}`;
  }
}
