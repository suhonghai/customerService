import { Test, type TestingModule } from '@nestjs/testing';
import { Subject } from 'rxjs';
import OpenAI from 'openai';
import { EmbeddingService } from './embedding.service';
import { AiConfigService, type ActiveAiConfig } from '../../modules/ai-config/ai-config.service';

/**
 * EmbeddingService 单元测试(Day 11)
 *
 * 覆盖:
 *  - onModuleInit 拿 active config 成功 → client 就绪
 *  - onModuleInit 拿不到,fallback env → client 用 env 构造
 *  - onModuleInit 拿不到 + 无 env → client null,embed() 抛错
 *  - emit configChanged$ 后 refresh client(新 key/baseURL)
 *  - embed() 调底层 OpenAI client 并 batch
 *  - onModuleDestroy unsubscribe
 *
 * 注:用 jest.mock('openai') 拦 SDK,不去真打百炼。
 */

jest.mock('openai', () => {
  return jest.fn().mockImplementation((opts: { apiKey: string; baseURL?: string }) => ({
    _opts: opts,
    embeddings: {
      create: jest.fn(async ({ input }: { input: string[]; model: string }) => ({
        data: input.map((text: string, i: number) => ({
          embedding: Array(4).fill(i + 0.1),
          index: i,
          object: 'embedding',
        })),
        model: 'mock-model',
        object: 'list',
        usage: { prompt_tokens: input.length, total_tokens: input.length },
      })),
    },
  }));
});

const MockOpenAI = OpenAI as unknown as jest.Mock;

function makeActiveCfg(over: Partial<ActiveAiConfig> = {}): ActiveAiConfig {
  return {
    id: 1,
    code: 'dashscope_main',
    name: 'main',
    provider: 'dashscope',
    modelId: 'text-embedding-v4',
    apiKey: 'sk-active-from-db',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    temperature: 0.7,
    topP: 0.8,
    maxTokens: 2000,
    systemPrompt: null,
    ...over,
  };
}

describe('EmbeddingService', () => {
  const ORIGINAL_ENV = process.env;

  let service: EmbeddingService;
  let configChanged$: Subject<ActiveAiConfig | null>;
  let getActiveInternal: jest.Mock<Promise<ActiveAiConfig | null>, []>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.EMBED_MODEL;
    delete process.env.DASHSCOPE_BASE_URL;

    configChanged$ = new Subject<ActiveAiConfig | null>();
    getActiveInternal = jest.fn<Promise<ActiveAiConfig | null>, []>();

    const mockAiConfig = {
      configChanged$,
      getActiveInternal,
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        {
          provide: AiConfigService,
          useValue: mockAiConfig,
        },
      ],
    }).compile();

    service = moduleRef.get(EmbeddingService);
    MockOpenAI.mockClear();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('onModuleInit:DB 有 active config → 用 active key 构造 OpenAI client', async () => {
    const cfg = makeActiveCfg({ apiKey: 'sk-from-db' });
    getActiveInternal.mockResolvedValue(cfg);

    await service.onModuleInit();

    expect(MockOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-from-db',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
    expect(getActiveInternal).toHaveBeenCalledTimes(1);
  });

  it('onModuleInit:DB 无 active 配置,env 有 → fallback env', async () => {
    getActiveInternal.mockResolvedValue(null);
    process.env.DASHSCOPE_API_KEY = 'sk-from-env';
    process.env.EMBED_MODEL = 'text-embedding-v3';

    await service.onModuleInit();

    expect(MockOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-from-env',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
  });

  it('onModuleInit:DB 无 + env 无 → client 未初始化,embed() 抛错', async () => {
    getActiveInternal.mockResolvedValue(null);
    // process.env 无 DASHSCOPE_API_KEY

    await service.onModuleInit();

    expect(MockOpenAI).not.toHaveBeenCalled();
    await expect(service.embed(['hello'])).rejects.toThrow(/EmbeddingService 未初始化/);
  });

  it('onModuleInit:getActiveInternal 抛错 → fallback env,不冒泡', async () => {
    getActiveInternal.mockRejectedValue(new Error('DB not ready'));
    process.env.DASHSCOPE_API_KEY = 'sk-env-fallback';

    await service.onModuleInit();

    expect(MockOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-env-fallback',
      baseURL: expect.any(String),
    });
  });

  it('configChanged$ emit 新 active → refresh client(新 key+baseURL)', async () => {
    const initial = makeActiveCfg({ apiKey: 'sk-old' });
    getActiveInternal.mockResolvedValue(initial);
    await service.onModuleInit();
    expect(MockOpenAI).toHaveBeenCalledTimes(1);
    expect(MockOpenAI).toHaveBeenLastCalledWith({
      apiKey: 'sk-old',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    // 后台切换到新配置
    const updated = makeActiveCfg({
      apiKey: 'sk-new-key',
      baseUrl: 'https://api.openai.com/v1',
      modelId: 'text-embedding-3-large',
    });
    configChanged$.next(updated);

    // 等 microtask flush(Subscribe 是同步触发,但日志等是异步)
    await Promise.resolve();
    await Promise.resolve();

    expect(MockOpenAI).toHaveBeenCalledTimes(2);
    expect(MockOpenAI).toHaveBeenLastCalledWith({
      apiKey: 'sk-new-key',
      baseURL: 'https://api.openai.com/v1',
    });
  });

  it('configChanged$ emit null → 不重建 client,保留当前', async () => {
    const initial = makeActiveCfg({ apiKey: 'sk-keep' });
    getActiveInternal.mockResolvedValue(initial);
    await service.onModuleInit();

    configChanged$.next(null);
    await Promise.resolve();
    await Promise.resolve();

    expect(MockOpenAI).toHaveBeenCalledTimes(1);
  });

  it('embed() 调底层 client 并按 10 分批', async () => {
    const cfg = makeActiveCfg();
    getActiveInternal.mockResolvedValue(cfg);
    await service.onModuleInit();

    const texts = Array.from({ length: 25 }, (_, i) => `text-${i}`);
    const out = await service.embed(texts);

    expect(out).toHaveLength(25);
    // 第 0 个 text 的 embedding
    expect(out[0]).toHaveLength(4);
    // mock 调用次数:25 / 10 向上 = 3 个 batch
    const clientInstance = MockOpenAI.mock.results[0].value;
    expect(clientInstance.embeddings.create).toHaveBeenCalledTimes(3);
  });

  it('embed() 空数组直接返空,不打 client', async () => {
    const cfg = makeActiveCfg();
    getActiveInternal.mockResolvedValue(cfg);
    await service.onModuleInit();

    const out = await service.embed([]);
    expect(out).toEqual([]);
  });

  it('onModuleDestroy 取消订阅', async () => {
    const cfg = makeActiveCfg();
    getActiveInternal.mockResolvedValue(cfg);
    await service.onModuleInit();

    // emit 不应触发 refresh(已 unsub)
    await service.onModuleDestroy();
    configChanged$.next(makeActiveCfg({ apiKey: 'sk-after-destroy' }));
    await Promise.resolve();
    await Promise.resolve();

    expect(MockOpenAI).toHaveBeenCalledTimes(1);
  });
});
