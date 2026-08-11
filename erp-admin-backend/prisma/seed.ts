/**
 * Prisma seed: 初始化超级管理员 + 5 内置角色 + 完整菜单树 + 4 类数据字典
 * 运行: pnpm prisma db seed
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import dayjs = require('dayjs');
import * as fs from 'fs';
import * as path from 'path';

const ALGO = 'aes-256-gcm';
const KEY_HEX_LENGTH = 64;

function getEncryptKey(): Buffer {
  const hex = process.env.AI_API_KEY_ENCRYPT_KEY || '';
  if (hex.length !== KEY_HEX_LENGTH) {
    throw new Error(
      `AI_API_KEY_ENCRYPT_KEY must be ${KEY_HEX_LENGTH} hex chars, got ${hex.length}`,
    );
  }
  return Buffer.from(hex, 'hex');
}

function encryptApiKey(plain: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getEncryptKey(), iv);
  let enc = cipher.update(plain, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc}`;
}

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始 seed ...');

  // ============================================
  // 1. 5 个内置角色
  // ============================================
  const roles = [
    {
      code: 'super_admin',
      name: '超级管理员',
      description: '系统最高权限,可配置一切',
      dataScope: 1,
      builtin: true,
      sort: 1,
    },
    {
      code: 'agent_lead',
      name: '客服主管',
      description: '管理客服团队,看板 + 工单分配',
      dataScope: 2,
      builtin: true,
      sort: 2,
    },
    {
      code: 'agent',
      name: '客服坐席',
      description: '处理工单 / 会话,只看到自己的数据',
      dataScope: 3,
      builtin: true,
      sort: 3,
    },
    {
      code: 'editor',
      name: '内容运营',
      description: '维护 FAQ / 商品 / 订单查询',
      dataScope: 1,
      builtin: true,
      sort: 4,
    },
    {
      code: 'viewer',
      name: '只读账号',
      description: '只读看板,无写权限',
      dataScope: 1,
      builtin: true,
      sort: 5,
    },
  ];

  for (const r of roles) {
    await prisma.role.upsert({
      where: { code: r.code },
      update: r,
      create: r,
    });
  }
  console.log(`✅ 5 角色 upsert 完成`);

  // ============================================
  // 2. super_admin 用户(username=admin / password=Admin@123)
  // ============================================
  const passwordHash = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash },
    create: {
      username: 'admin',
      passwordHash,
      nickname: '超级管理员',
      email: 'admin@example.com',
      status: 1,
      remark: '系统初始超级管理员',
    },
  });
  console.log(`✅ admin 用户 upsert 完成 (id=${admin.id})`);

  // 关联 super_admin 角色
  const superAdminRole = await prisma.role.findUnique({ where: { code: 'super_admin' } });
  if (superAdminRole) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: admin.id, roleId: superAdminRole.id },
      },
      update: {},
      create: { userId: admin.id, roleId: superAdminRole.id },
    });
    console.log(`✅ admin 关联 super_admin 角色完成`);
  }

  // ============================================
  // 3. 完整菜单树(目录 + 菜单 + 按钮)
  // ============================================
  const menuTree = [
    // 系统管理
    {
      name: '系统管理',
      icon: 'SettingOutlined',
      type: 1,
      sort: 1,
      children: [
        { name: '用户管理', path: '/system/user', component: 'User', icon: 'UserOutlined', type: 2, sort: 1, permCode: 'user:view',
          children: [
            { name: '查询用户', type: 3, permCode: 'user:view', sort: 0 },
            { name: '新增用户', type: 3, permCode: 'user:create', sort: 1 },
            { name: '编辑用户', type: 3, permCode: 'user:update', sort: 2 },
            { name: '删除用户', type: 3, permCode: 'user:delete', sort: 3 },
            { name: '重置密码', type: 3, permCode: 'user:reset-password', sort: 4 },
          ],
        },
        { name: '角色管理', path: '/system/role', component: 'Role', icon: 'TeamOutlined', type: 2, sort: 2, permCode: 'role:view',
          children: [
            { name: '查询角色', type: 3, permCode: 'role:view', sort: 0 },
            { name: '新增角色', type: 3, permCode: 'role:create', sort: 1 },
            { name: '编辑角色', type: 3, permCode: 'role:update', sort: 2 },
            { name: '删除角色', type: 3, permCode: 'role:delete', sort: 3 },
            { name: '分配菜单', type: 3, permCode: 'role:assign-menu', sort: 4 },
          ],
        },
        { name: '菜单管理', path: '/system/menu', component: 'Menu', icon: 'MenuOutlined', type: 2, sort: 3, permCode: 'menu:view' },
        { name: '数据字典', path: '/system/dict', component: 'Dict', icon: 'BookOutlined', type: 2, sort: 4, permCode: 'dict:view',
          children: [
            { name: '查询字典', type: 3, permCode: 'dict:view', sort: 0 },
            { name: '新建字典', type: 3, permCode: 'dict:create', sort: 1 },
            { name: '编辑字典', type: 3, permCode: 'dict:update', sort: 2 },
            { name: '删除字典', type: 3, permCode: 'dict:delete', sort: 3 },
          ],
        },
      ],
    },
    // AI 配置
    {
      name: 'AI 配置',
      icon: 'RobotOutlined',
      type: 1,
      sort: 2,
      children: [
        { name: '模型配置', path: '/ai-config', component: 'AIConfig', icon: 'ApiOutlined', type: 2, sort: 1, permCode: 'ai-config:view',
          children: [
            { name: '新增模型', type: 3, permCode: 'ai-config:create', sort: 1 },
            { name: '编辑模型', type: 3, permCode: 'ai-config:update', sort: 2 },
            { name: '删除模型', type: 3, permCode: 'ai-config:delete', sort: 3 },
            { name: '测试模型', type: 3, permCode: 'ai-config:test', sort: 4 },
          ],
        },
        { name: 'Prompt 模板', path: '/ai-config/prompt', component: 'AIPrompt', icon: 'FileTextOutlined', type: 2, sort: 2, permCode: 'ai-config:view' },
      ],
    },
    // 内容管理
    {
      name: '内容管理',
      icon: 'FileOutlined',
      type: 1,
      sort: 3,
      children: [
        { name: 'FAQ 管理', path: '/faq', component: 'FAQ', icon: 'QuestionCircleOutlined', type: 2, sort: 1, permCode: 'faq:view',
          children: [
            { name: '上传 FAQ', type: 3, permCode: 'faq:create', sort: 1 },
            { name: '编辑 FAQ', type: 3, permCode: 'faq:update', sort: 2 },
            { name: '删除 FAQ', type: 3, permCode: 'faq:delete', sort: 3 },
            { name: '审核 FAQ', type: 3, permCode: 'faq:review', sort: 4 },
          ],
        },
      ],
    },
    // 业务管理
    {
      name: '业务管理',
      icon: 'ShopOutlined',
      type: 1,
      sort: 4,
      children: [
        { name: '订单管理', path: '/orders', component: 'Order', icon: 'ShoppingCartOutlined', type: 2, sort: 1, permCode: 'order:view',
          children: [
            { name: '查询订单', type: 3, permCode: 'order:view', sort: 0 },
            { name: '新建订单', type: 3, permCode: 'order:create', sort: 1 },
            { name: '编辑订单', type: 3, permCode: 'order:update', sort: 2 },
            { name: '改状态', type: 3, permCode: 'order:update-status', sort: 3 },
            { name: '退款', type: 3, permCode: 'order:refund', sort: 4 },
            { name: '导出', type: 3, permCode: 'order:export', sort: 5 },
          ],
        },
        { name: '工单管理', path: '/tickets', component: 'Ticket', icon: 'IssueTrackerOutlined', type: 2, sort: 2, permCode: 'ticket:view',
          children: [
            { name: '查询工单', type: 3, permCode: 'ticket:view', sort: 0 },
            { name: '创建工单', type: 3, permCode: 'ticket:create', sort: 1 },
            { name: '分配工单', type: 3, permCode: 'ticket:assign', sort: 2 },
            { name: '改工单状态', type: 3, permCode: 'ticket:update-status', sort: 3 },
            { name: '回复工单', type: 3, permCode: 'ticket:reply', sort: 4 },
          ],
        },
        { name: '会话管理', path: '/sessions', component: 'Session', icon: 'MessageOutlined', type: 2, sort: 3, permCode: 'session:view',
          children: [
            { name: '查询会话', type: 3, permCode: 'session:view', sort: 0 },
            { name: '查看消息', type: 3, permCode: 'session:view-messages', sort: 1 },
            { name: '删除会话', type: 3, permCode: 'session:delete', sort: 2 },
          ],
        },
      ],
    },
    // 监控 + 审计
    {
      name: '监控中心',
      icon: 'DashboardOutlined',
      type: 1,
      sort: 5,
      children: [
        { name: '看板', path: '/stats', component: 'Stats', icon: 'PieChartOutlined', type: 2, sort: 1, permCode: 'stats:view' },
        { name: '审计日志', path: '/audit-logs', component: 'AuditLog', icon: 'FileSearchOutlined', type: 2, sort: 2, permCode: 'audit-log:view' },
        { name: '客服绩效', path: '/stats/agent-performance', component: 'AgentPerformance', icon: 'TrophyOutlined', type: 2, sort: 3, permCode: 'stats:view' },
      ],
    },
  ];

  // 清空旧菜单(避免重复 seed 累积),重置
  await prisma.menu.deleteMany({});

  async function createMenuTree(
    nodes: any[],
    parentId: number | null = null,
  ): Promise<number> {
    for (const node of nodes) {
      const { children, ...menuData } = node;
      const created = await prisma.menu.create({
        data: { ...menuData, parentId },
      });
      if (children && children.length > 0) {
        await createMenuTree(children, created.id);
      }
    }
    return 0;
  }

  await createMenuTree(menuTree);
  const menuCount = await prisma.menu.count();
  console.log(`✅ 菜单树创建完成,共 ${menuCount} 条`);

  // super_admin 角色绑定所有菜单
  if (superAdminRole) {
    const allMenus = await prisma.menu.findMany({ select: { id: true } });
    await prisma.roleMenu.deleteMany({ where: { roleId: superAdminRole.id } });
    await prisma.roleMenu.createMany({
      data: allMenus.map((m) => ({ roleId: superAdminRole.id, menuId: m.id })),
    });
    console.log(`✅ super_admin 绑定全部 ${allMenus.length} 菜单`);
  }

  // ============================================
  // 3.5 Day 3: 非超管角色绑基础菜单(让 E2E + 业务能跑通)
  // agent_lead / agent / editor / viewer 各绑适合自己的菜单
  // ============================================
  const builtinRoleMenuMap: Record<string, string[]> = {
    agent_lead: [
      // 系统-用户管理(view) + 业务-工单/会话/订单 + 监控
      '用户管理', '工单管理', '会话管理', '订单管理', '看板', '审计日志', '客服绩效', '数据字典', '角色管理',
    ],
    agent: [
      // 系统-用户(只看自己) + 工单(view) + 会话 + 订单(view)
      '用户管理', '工单管理', '会话管理', '看板', '订单管理',
    ],
    editor: [
      // 系统-用户 + FAQ + 订单 + 数据字典
      '用户管理', 'FAQ 管理', '订单管理', '数据字典',
    ],
    viewer: [
      // 监控 + 业务(只读)
      '看板', '审计日志', '客服绩效', '工单管理', '订单管理', '会话管理', 'FAQ 管理',
    ],
  };

  for (const [code, menuNames] of Object.entries(builtinRoleMenuMap)) {
    const r = await prisma.role.findUnique({ where: { code } });
    if (!r) continue;
    const menus = await prisma.menu.findMany({
      where: { name: { in: menuNames }, deletedAt: null },
      select: { id: true },
    });
    // 父目录(menu 节点的父级 1 目录)也得有,sidebar 才显示
    const parentIds = new Set<number>();
    for (const m of menus) {
      // 找父链
      let cur = await prisma.menu.findUnique({ where: { id: m.id } });
      while (cur && cur.parentId != null) {
        parentIds.add(cur.parentId);
        cur = await prisma.menu.findUnique({ where: { id: cur.parentId } });
      }
    }
    const finalMenuIds = Array.from(
      new Set([...menus.map((m) => m.id), ...parentIds]),
    );
    await prisma.roleMenu.deleteMany({ where: { roleId: r.id } });
    await prisma.roleMenu.createMany({
      data: finalMenuIds.map((mid) => ({ roleId: r.id, menuId: mid })),
    });
    console.log(`✅ ${code} 绑 ${finalMenuIds.length} 菜单(基础 + 业务)`);
  }

  // ============================================
  // 4. 4 类数据字典初始
  // ============================================
  const dictTypes = [
    { code: 'order_status', name: '订单状态', items: [
      { label: '待发货', value: '1', sort: 1, cssClass: 'orange' },
      { label: '已发货', value: '2', sort: 2, cssClass: 'blue' },
      { label: '已收货', value: '3', sort: 3, cssClass: 'cyan' },
      { label: '已完成', value: '4', sort: 4, cssClass: 'green' },
      { label: '已取消', value: '5', sort: 5, cssClass: 'red' },
    ]},
    { code: 'pay_method', name: '支付方式', items: [
      { label: '微信支付', value: 'wechat', sort: 1 },
      { label: '支付宝', value: 'alipay', sort: 2 },
      { label: '银行卡', value: 'bank', sort: 3 },
    ]},
    { code: 'ticket_priority', name: '工单优先级', items: [
      { label: '高', value: '1', sort: 1, cssClass: 'red' },
      { label: '中', value: '2', sort: 2, cssClass: 'orange' },
      { label: '低', value: '3', sort: 3, cssClass: 'green' },
    ]},
    { code: 'ticket_status', name: '工单状态', items: [
      { label: '待领取', value: '1', sort: 1, cssClass: 'orange' },
      { label: '处理中', value: '2', sort: 2, cssClass: 'blue' },
      { label: '已解决', value: '3', sort: 3, cssClass: 'green' },
      { label: '已关闭', value: '4', sort: 4, cssClass: 'gray' },
    ]},
  ];

  for (const dt of dictTypes) {
    const type = await prisma.dictType.upsert({
      where: { code: dt.code },
      update: { name: dt.name },
      create: { code: dt.code, name: dt.name },
    });
    // 清旧 items
    await prisma.dictItem.deleteMany({ where: { typeId: type.id } });
    await prisma.dictItem.createMany({
      data: dt.items.map((it) => ({ ...it, typeId: type.id })),
    });
  }
  console.log(`✅ 4 类数据字典初始化完成`);

  // ============================================
  // 5. Day 3: 3 个测试用户(客服主管 / 坐席 / 内容编辑)
  // ============================================
  const testUsers = [
    {
      username: 'agent_lead01',
      password: 'Lead@123',
      nickname: '客服主管',
      email: 'agent_lead01@example.com',
      roleCode: 'agent_lead',
      departmentId: 10,
    },
    {
      username: 'agent01',
      password: 'Agent@123',
      nickname: '客服坐席',
      email: 'agent01@example.com',
      roleCode: 'agent',
      departmentId: 10,
    },
    {
      username: 'editor01',
      password: 'Editor@123',
      nickname: '内容编辑',
      email: 'editor01@example.com',
      roleCode: 'editor',
      departmentId: 20,
    },
  ];

  for (const tu of testUsers) {
    const hash = await bcrypt.hash(tu.password, 12);
    const u = await prisma.user.upsert({
      where: { username: tu.username },
      update: { passwordHash: hash, status: 1 },
      create: {
        username: tu.username,
        passwordHash: hash,
        nickname: tu.nickname,
        email: tu.email,
        departmentId: tu.departmentId,
        status: 1,
      },
    });
    const role = await prisma.role.findUnique({ where: { code: tu.roleCode } });
    if (role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: u.id, roleId: role.id } },
        update: {},
        create: { userId: u.id, roleId: role.id },
      });
    }
  }
  console.log(`✅ Day 3 测试用户:agent_lead01 / agent01 / editor01 upsert 完成`);

  // ============================================
  // 6. Day 4: 1 个默认 AI 模型 + 2 个 Prompt 模板
  // ============================================
  // AI 模型:用 .env 里的 DASHSCOPE_API_KEY(若没配就跳过)
  // [cs-round-045] 同时把 EMBED_MODEL 写到 embed_model 字段,
  // 让 EmbeddingService 启动时直接读 DB,而不是去查 env。
  const dashscopeKey = process.env.DASHSCOPE_API_KEY;
  const embedModel = process.env.EMBED_MODEL || null;
  if (dashscopeKey && dashscopeKey !== 'sk-your-dashscope-key-here') {
    await prisma.aiModelConfig.upsert({
      where: { code: 'qwen3.7-plus' },
      update: {
        apiKey: encryptApiKey(dashscopeKey),
        provider: 'dashscope',
        modelId: 'qwen3.7-plus',
        embedModel,
        isDefault: true,
        status: 1,
      },
      create: {
        code: 'qwen3.7-plus',
        name: 'Qwen 3.7 Plus(默认)',
        provider: 'dashscope',
        modelId: 'qwen3.7-plus',
        embedModel,
        apiKey: encryptApiKey(dashscopeKey),
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        temperature: 0.7,
        topP: 0.8,
        maxTokens: 2000,
        systemPrompt: '你是一名专业的 AI 客服助手。',
        description: '阿里云百炼 Qwen 3.7 Plus,通过 OpenAI 兼容模式调用',
        isDefault: true,
        status: 1,
      },
    });
    // 把其他 isDefault 全置 false
    await prisma.aiModelConfig.updateMany({
      where: { isDefault: true, NOT: { code: 'qwen3.7-plus' }, deletedAt: null },
      data: { isDefault: false },
    });
    console.log(`✅ Day 4 默认 AI 模型 qwen3.7-plus 已 seed(apiKey 已加密,embedModel=${embedModel ?? '(null,fallback env/DEFAULT)'})`);
  } else {
    console.log('⚠️  DASHSCOPE_API_KEY 未配置,跳过 AI 模型 seed');
  }

  // 2 个 Prompt 模板
  const promptTemplates = [
    {
      code: 'customer_service',
      name: '通用客服话术',
      content:
        '你是{store_name}的 AI 客服助手,叫小服。请用亲切、专业的语气回答用户问题。' +
        '回答要简洁(<= 200 字),先给结论再给理由,无法回答时引导联系人工客服。',
      variables: '["store_name"]',
      status: 1,
    },
    {
      code: 'ticket_reply',
      name: '工单回复话术',
      content:
        '你是客服坐席,正在回复工单 #{ticket_no}。' +
        '工单标题:{ticket_title};当前状态:{ticket_status}。' +
        '请基于已知信息(如下)给出友好、专业的回复,优先解决问题,避免冗长寒暄。\n\n' +
        '工单详情:{ticket_content}',
      variables: '["ticket_no", "ticket_title", "ticket_status", "ticket_content"]',
      status: 1,
    },
  ];
  for (const t of promptTemplates) {
    await prisma.aiPromptTemplate.upsert({
      where: { code: t.code },
      update: t,
      create: t,
    });
  }
  console.log(`✅ Day 4 Prompt 模板 ${promptTemplates.length} 条 seed 完成`);

  // ============================================
  // 7. Day 5: 2 个 FAQ 文档(元数据,文件已在 data/seed-faqs/)
  //   - status=2 已发布(直接发布,便于 Day 18 ai-cs-demo 衔接测试)
  //   - chunkCount=0,Chroma 入库单独跑 scripts/seed-faq-chroma.ts
  // ============================================
  const seedFaqs = [
    {
      title: '退换货政策',
      category: '退换货',
      tags: '退换货,售后,退款',
      description: '退换货规则总览(7 天无理由 / 15 天质量问题)',
      fileName: 'return-policy.md',
    },
    {
      title: '物流与时效',
      category: '物流',
      tags: '物流,配送,时效,快递',
      description: '发货 / 运输 / 签收时效,异常情况处理',
      fileName: 'delivery-time.md',
    },
  ];

  const seedFaqDir = path.join(__dirname, '..', 'data', 'seed-faqs');
  for (const sf of seedFaqs) {
    const filePath = path.join(seedFaqDir, sf.fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  seed-faq 文件不存在: ${filePath},跳过`);
      continue;
    }
    const buf = fs.readFileSync(filePath);
    const checksum = crypto.createHash('sha256').update(buf).digest('hex');

    // 已存在则跳过(用 checksum 查重)
    const dup = await prisma.faqVersion.findFirst({ where: { checksum } });
    if (dup) {
      console.log(`⏭️  FAQ [${sf.title}] checksum 已存在,跳过`);
      continue;
    }

    // 用相对路径占位(实际服务启动后由 file_storage 重新落盘)
    const storagePath = `seed-faqs/${sf.fileName}`;

    await prisma.faqDocument.create({
      data: {
        title: sf.title,
        category: sf.category,
        tags: sf.tags,
        description: sf.description,
        uploaderId: admin.id,
        currentVersion: 1,
        status: 2, // 已发布
        versions: {
          create: {
            version: 1,
            filePath: storagePath,
            fileSize: buf.length,
            checksum,
            chunkCount: 0, // 等 Chroma 脚本写入
            changelog: 'seed 初版',
            status: 2, // 已发布
            reviewerId: admin.id,
            reviewedAt: new Date(),
          },
        },
      },
    });
  }
  const faqCount = await prisma.faqDocument.count();
  console.log(`✅ Day 5 FAQ 文档:累计 ${faqCount} 条(已发布,等 Chroma 脚本)`);

  // ============================================
  // 8. Day 6: 给 4 个测试用户设 departmentId(用于 DataScope 测试)
  //   - admin(超管,scope=1)         → dept 1
  //   - agent_lead01(scope=2)        → dept 1(同 admin)
  //   - agent01(scope=3,本人)        → dept 2
  //   - editor01(scope=1)            → dept 3
  // ============================================
  const deptUpdates: Array<{ username: string; departmentId: number }> = [
    { username: 'admin', departmentId: 1 },
    { username: 'agent_lead01', departmentId: 1 },
    { username: 'agent01', departmentId: 2 },
    { username: 'editor01', departmentId: 3 },
  ];
  for (const du of deptUpdates) {
    await prisma.user.update({
      where: { username: du.username },
      data: { departmentId: du.departmentId },
    });
  }
  console.log(`✅ Day 6 给 4 个用户设置 departmentId(1/1/2/3)`);

  // ============================================
  // 9. Day 6: 6 个不同状态的测试订单(admin 创建)
  //   - status 1..5 覆盖全状态机
  //   - payStatus 1/2 覆盖待支付 / 已支付
  // ============================================
  const orderSeed = [
    { idx: 1, status: 1, payStatus: 1, payMethod: 'wechat', amount: 99.0,  paid: false, label: '待支付' },
    { idx: 2, status: 1, payStatus: 2, payMethod: 'alipay', amount: 149.0, paid: true,  label: '待发货' },
    { idx: 3, status: 2, payStatus: 2, payMethod: 'wechat', amount: 199.0, paid: true,  label: '已发货' },
    { idx: 4, status: 3, payStatus: 2, payMethod: 'bank',   amount: 249.0, paid: true,  label: '已收货' },
    { idx: 5, status: 4, payStatus: 2, payMethod: 'alipay', amount: 299.0, paid: true,  label: '已完成' },
    { idx: 6, status: 5, payStatus: 2, payMethod: 'wechat', amount: 349.0, paid: true,  label: '已取消' },
  ];

  for (const o of orderSeed) {
    const orderNo = `ORD-${dayjs().format('YYYYMMDD')}${String(o.idx).padStart(3, '0')}`;
    // 用 orderNo 查重(支持重跑)
    const exist = await prisma.order.findUnique({ where: { orderNo } });
    if (exist) {
      console.log(`⏭️  订单 [${orderNo}] 已存在,跳过`);
      continue;
    }
    await prisma.order.create({
      data: {
        orderNo,
        userId: admin.id,
        customerName: `客户${o.idx}`,
        customerPhone: `1380013800${String(o.idx).padStart(2, '0')}`,
        customerEmail: `customer${o.idx}@example.com`,
        totalAmount: o.amount,
        payAmount: o.amount,
        payMethod: o.payMethod,
        payStatus: o.payStatus,
        orderStatus: o.status,
        shipNo: o.idx === 3 ? `SF${1000 + o.idx}` : null,
        shipCompany: o.idx === 3 ? '顺丰' : null,
        address: `北京市朝阳区某街${o.idx}号`,
        remark: `seed 订单 ${o.label}`,
        paidAt: o.paid ? new Date() : null,
        shippedAt: o.idx === 3 ? new Date() : null,
        receivedAt: o.idx === 4 ? new Date() : null,
        completedAt: o.idx === 5 ? new Date() : null,
        cancelledAt: o.idx === 6 ? new Date() : null,
        items: {
          create: [{
            productId: `PROD-00${o.idx}`,
            productName: `测试商品 ${o.idx}`,
            productSku: `SKU-${o.idx}`,
            price: o.amount,
            quantity: 1,
            subtotal: o.amount,
          }],
        },
      },
    });
  }
  const orderCount = await prisma.order.count({ where: { deletedAt: null } });
  console.log(`✅ Day 6 订单:累计 ${orderCount} 条(覆盖 5 种 orderStatus)`);

  // ============================================
  // 10. W11:给 3 个 CsCustomer 各建 2 条订单(customerId 字段)
  //   - 验证 listOrdersBySession 走 customer_id 过滤时的正确性
  //   - customer01: 已付款(待发货) + 已发货(物流中)
  //   - customer02: 已完成 + 退款中
  //   - customer03: 待支付 + 已完成
  //   - orderNo 用今天日期 + idx,跟前面 admin 6 条同前缀不冲突(用 idx 7-12)
  // ============================================
  const customers = await prisma.csCustomer.findMany({
    orderBy: { id: 'asc' },
  });
  if (customers.length === 0) {
    console.warn('⚠️  无 CsCustomer 数据,跳过顾客订单 seed');
  } else {
    const customerOrderSeed = [
      { idx: 7, status: 1, payStatus: 2, payMethod: 'alipay', amount: 89.0,  paid: true,  label: '张三-待发货' },
      { idx: 8, status: 2, payStatus: 2, payMethod: 'wechat', amount: 159.0, paid: true,  label: '张三-已发货' },
      { idx: 9, status: 4, payStatus: 2, payMethod: 'alipay', amount: 299.0, paid: true,  label: '李四-已完成' },
      { idx: 10, status: 5, payStatus: 2, payMethod: 'bank',   amount: 459.0, paid: true,  label: '李四-退款中' },
      { idx: 11, status: 1, payStatus: 1, payMethod: 'wechat', amount: 79.0,  paid: false, label: '王五-待支付' },
      { idx: 12, status: 4, payStatus: 2, payMethod: 'alipay', amount: 199.0, paid: true,  label: '王五-已完成' },
    ];
    // customer01 ← idx 7,8 / customer02 ← idx 9,10 / customer03 ← idx 11,12
    for (let i = 0; i < customerOrderSeed.length; i++) {
      const o = customerOrderSeed[i];
      const customer = customers[Math.floor(i / 2)];
      if (!customer) continue;
      const orderNo = `ORD-${dayjs().format('YYYYMMDD')}${String(o.idx).padStart(3, '0')}`;
      const exist = await prisma.order.findUnique({ where: { orderNo } });
      if (exist) {
        console.log(`⏭️  顾客订单 [${orderNo}] 已存在,跳过`);
        continue;
      }
      await prisma.order.create({
        data: {
          orderNo,
          userId: null, // W11:C 端订单,不挂内部 user
          customerId: customer.id, // ← 关键:用 customerId 区分
          customerName: customer.nickname ?? customer.email.split('@')[0],
          customerPhone: `1390013900${String(customer.id).padStart(2, '0')}`,
          customerEmail: customer.email,
          totalAmount: o.amount,
          payAmount: o.amount,
          payMethod: o.payMethod,
          payStatus: o.payStatus,
          orderStatus: o.status,
          shipNo: o.idx === 8 || o.idx === 10 ? `YT${10000 + o.idx}` : null,
          shipCompany: o.idx === 8 || o.idx === 10 ? '圆通' : null,
          address: `${customer.nickname ?? '客户'}的收货地址-${o.idx}`,
          remark: `seed 顾客订单 ${o.label}`,
          paidAt: o.paid ? new Date() : null,
          shippedAt: o.idx === 8 || o.idx === 10 ? new Date() : null,
          receivedAt: o.idx === 9 || o.idx === 12 ? new Date() : null,
          completedAt: o.idx === 9 || o.idx === 12 ? new Date() : null,
          cancelledAt: o.idx === 10 ? new Date() : null,
          items: {
            create: [{
              productId: `PROD-C${o.idx}`,
              productName: `${customer.nickname ?? customer.email}的商品 ${o.idx}`,
              productSku: `SKU-C${o.idx}`,
              price: o.amount,
              quantity: 1,
              subtotal: o.amount,
            }],
          },
        },
      });
    }
    const customerOrderCount = await prisma.order.count({
      where: { deletedAt: null, customerId: { not: null } },
    });
    console.log(`✅ W11 顾客订单:累计 ${customerOrderCount} 条(各 CsCustomer 各 2 条)`);
  }

  // ============================================
  // 10. Day 7: 5 个测试工单(覆盖各种状态 + SLA 过期 1 个)
  //   - 5 行 cs_ticket + 关联 cs_ticket_log(create / assign / status_change)
  //   - status: 1 待领取 / 2 处理中 / 3 已解决 / 4 已关闭 / SLA 过期
  //   - 客服坐席账号需要,先去查
  // ============================================
  const agentLead01 = await prisma.user.findUnique({
    where: { username: 'agent_lead01' },
  });
  const agent01 = await prisma.user.findUnique({
    where: { username: 'agent01' },
  });
  if (!agentLead01 || !agent01) {
    throw new Error('工单 seed 失败:agent_lead01 / agent01 用户不存在');
  }

  // 5 个工单的 seed 配置
  // slaHours priority 1=2h, 2=8h, 3=24h
  const ticketSeed: Array<{
    idx: number;
    status: number;
    priority: number;
    category: string;
    title: string;
    content: string;
    assigneeId: number | null;
    slaDeadline?: Date;
    resolvedAt?: Date;
  }> = [
    {
      idx: 1,
      status: 1,
      priority: 2,
      category: '退款',
      title: '客户要求退款(待领取)',
      content: '客户购买 3 天后要求退款,无质量问题,需审核是否符合 7 天无理由。',
      assigneeId: null,
    },
    {
      idx: 2,
      status: 2,
      priority: 2,
      category: '物流',
      title: '物流停滞 5 天未更新',
      content: '客户反馈快递 5 天未更新,需联系物流公司核实。',
      assigneeId: agentLead01.id,
    },
    {
      idx: 3,
      status: 3,
      priority: 1,
      category: '优惠',
      title: '优惠券未生效(高优/已解决)',
      content: '客户反馈下单时优惠券未生效,已补偿 30 元红包。',
      assigneeId: agent01.id,
      resolvedAt: new Date(Date.now() - 2 * 3600 * 1000),
    },
    {
      idx: 4,
      status: 4,
      priority: 3,
      category: '会员',
      title: '会员积分到账延迟(已关闭)',
      content: '客户反馈订单完成后积分未到账,经核实为系统延迟,7 天后自动到账。',
      assigneeId: agent01.id,
      resolvedAt: new Date(Date.now() - 24 * 3600 * 1000),
    },
    {
      idx: 5,
      status: 2,
      priority: 1,
      category: '其他',
      title: '紧急系统故障(高优/SLA 过期)',
      content: '客户反馈下单系统 502,工单处理超时未响应。',
      assigneeId: agent01.id,
      slaDeadline: new Date(Date.now() - 3600 * 1000), // 1h 前过期(priority=1 应在 2h 内)
    },
  ];

  const slaHours: Record<number, number> = { 1: 2, 2: 8, 3: 24 };

  for (const t of ticketSeed) {
    const ticketNo = `T-${dayjs().format('YYYYMMDD')}${String(t.idx).padStart(3, '0')}`;
    // 用 ticketNo 查重(支持重跑)
    const exist = await prisma.csTicket.findUnique({ where: { ticketNo } });
    if (exist) {
      console.log(`⏭️  工单 [${ticketNo}] 已存在,跳过`);
      continue;
    }

    // SLA deadline
    const slaDeadline =
      t.slaDeadline ??
      new Date(Date.now() + (slaHours[t.priority] ?? 8) * 3600 * 1000);

    // resolvedAt:状态 3 / 4 才会有
    const resolvedAt =
      t.resolvedAt ?? (t.status === 3 || t.status === 4 ? new Date() : null);

    // ticket.createdAt:已解决/已关闭的工单要早于 resolvedAt(否则 avgResolveMinutes 算成负数)
    // 简单粗暴:已解决/已关闭 → createdAt = resolvedAt - 4h;其它 → createdAt = now - 1h
    const ticketCreatedAt =
      resolvedAt != null
        ? new Date(resolvedAt.getTime() - 4 * 3600 * 1000)
        : new Date(Date.now() - 3600 * 1000);

    // 流转 log:create + (assign) + (status_change to 3)
    const logData: Array<{
      action: string;
      fromVal: string | null;
      toVal: string | null;
      comment: string | null;
      operatorId: number;
      createdAt: Date;
    }> = [
      {
        action: 'create',
        fromVal: null,
        toVal: '1',
        comment: '创建工单',
        operatorId: admin.id,
        createdAt: ticketCreatedAt,
      },
    ];
    if (t.assigneeId) {
      logData.push({
        action: 'assign',
        fromVal: null,
        toVal: t.assigneeId === agent01.id ? agent01.username : agentLead01.username,
        comment: '分配给客服',
        operatorId: admin.id,
        createdAt: new Date(Date.now() - 1800 * 1000),
      });
      logData.push({
        action: 'status_change',
        fromVal: '1',
        toVal: '2',
        comment: '待领取 → 处理中(分配触发)',
        operatorId: admin.id,
        createdAt: new Date(Date.now() - 1800 * 1000),
      });
    }
    if (t.status === 3 || t.status === 4) {
      logData.push({
        action: 'status_change',
        fromVal: '2',
        toVal: '3',
        comment: '已解决',
        operatorId: t.assigneeId ?? admin.id,
        createdAt: t.resolvedAt ?? new Date(),
      });
    }
    if (t.status === 4) {
      logData.push({
        action: 'status_change',
        fromVal: '3',
        toVal: '4',
        comment: '已关闭',
        operatorId: t.assigneeId ?? admin.id,
        createdAt: t.resolvedAt ?? new Date(),
      });
    }

    await prisma.csTicket.create({
      data: {
        ticketNo,
        title: t.title,
        content: t.content,
        priority: t.priority,
        status: t.status,
        category: t.category,
        creatorId: admin.id,
        assigneeId: t.assigneeId,
        slaDeadline,
        resolvedAt,
        createdAt: ticketCreatedAt,
        logs: {
          create: logData,
        },
      },
    });
  }
  const ticketCount = await prisma.csTicket.count({ where: { deletedAt: null } });
  const ticketLogCount = await prisma.csTicketLog.count();
  console.log(
    `✅ Day 7 工单:累计 ${ticketCount} 条(覆盖 5 种 status + SLA 过期 1 条) + ${ticketLogCount} 条流转 log`,
  );

  // ============================================
  // 7. Day 8: 3 会话 + 20 消息(覆盖 status/rating/分配)
  // ============================================
  // 取 agent / agent_lead 用户
  const sessionAgent01 = await prisma.user.findUnique({
    where: { username: 'agent01' },
  });
  const sessionAgentLead = await prisma.user.findUnique({
    where: { username: 'agent_lead01' },
  });

  const sessionSeed = [
    {
      visitorId: 'visitor_001',
      visitorName: '客户A',
      status: 1,
      messageCount: 5,
      rating: 1,
      userId: null,
      daysAgo: 0,
      endedAgo: null,
    },
    {
      visitorId: 'visitor_002',
      visitorName: '客户B',
      status: 2,
      messageCount: 12,
      rating: 2,
      userId: sessionAgent01?.id ?? null,
      daysAgo: 1,
      endedAgo: 0.5,
    },
    {
      visitorId: 'visitor_003',
      visitorName: '客户C',
      status: 2,
      messageCount: 3,
      rating: null,
      userId: sessionAgentLead?.id ?? null,
      daysAgo: 5,
      endedAgo: 4,
    },
  ];

  let newSessionCount = 0;
  for (const s of sessionSeed) {
    const sessionKey = `${s.visitorId}-${dayjs().subtract(s.daysAgo, 'day').valueOf()}`;
    const exist = await prisma.csSession.findUnique({ where: { sessionKey } });
    if (exist) {
      console.log(`⏭️  会话 [${s.visitorId}] 已存在,跳过`);
      continue;
    }
    const startedAt = new Date(Date.now() - s.daysAgo * 24 * 3600 * 1000);
    const endedAt =
      s.endedAgo != null
        ? new Date(Date.now() - s.endedAgo * 24 * 3600 * 1000)
        : null;
    const created = await prisma.csSession.create({
      data: {
        sessionKey,
        visitorId: s.visitorId,
        visitorName: s.visitorName,
        channel: 1,
        status: s.status,
        aiModelCode: 'qwen3.7-plus',
        messageCount: s.messageCount,
        rating: s.rating,
        userId: s.userId,
        startedAt,
        endedAt,
      },
    });
    // 加 N 条消息(user/assistant 交替)
    for (let i = 0; i < s.messageCount; i++) {
      const isUser = i % 2 === 0;
      await prisma.csMessage.create({
        data: {
          sessionId: created.id,
          role: isUser ? 'user' : 'assistant',
          content: isUser
            ? `${s.visitorName} 的问题 ${i + 1}:请问订单何时发货?`
            : `AI 对 ${s.visitorName} 的回答 ${i + 1}:您的订单将在 24 小时内发出。`,
          createdAt: new Date(startedAt.getTime() + i * 60000),
        },
      });
    }
    newSessionCount++;
  }
  const sessionTotal = await prisma.csSession.count({ where: { deletedAt: null } });
  const messageTotal = await prisma.csMessage.count();
  console.log(
    `✅ Day 8 会话:新增 ${newSessionCount} / 累计 ${sessionTotal} 条 + ${messageTotal} 条消息`,
  );

  // ============================================
  // 11. W11: CsCustomer 前台顾客账号
  // ============================================
  await seedCsCustomers();

  console.log('🎉 seed 全部完成');
  console.log('   - admin / Admin@123');
  console.log('   - agent_lead01 / Lead@123');
  console.log('   - agent01 / Agent@123');
  console.log('   - editor01 / Editor@123');
  console.log('   - 5 角色 / 完整菜单 / 4 类字典 / 1 AI 模型 / 2 Prompt 模板 / 2 FAQ 文档 / 6 内部订单(admin) / 5 工单 / 3 会话 / 20 消息');
  console.log('   - 3 CsCustomer:customer01/02/03@shop.com / Customer@123 + 6 顾客订单(各 2 条)');
}

// ============================================
// Step 9. W11: 3 个前台 C 端账号(CsCustomer)
//   - 与内部 User(坐席/管理员)解耦,密码独立 hash
//   - 用 upsert 幂等,支持多次重跑
// ============================================
async function seedCsCustomers() {
  const customers = [
    { email: 'customer01@shop.com', nickname: '张三' },
    { email: 'customer02@shop.com', nickname: '李四' },
    { email: 'customer03@shop.com', nickname: '王五' },
  ];
  const passwordHash = await bcrypt.hash('Customer@123', 12);
  for (const c of customers) {
    await prisma.csCustomer.upsert({
      where: { email: c.email },
      update: { passwordHash, nickname: c.nickname, status: 1 },
      create: {
        email: c.email,
        passwordHash,
        nickname: c.nickname,
        status: 1,
      },
    });
  }
  console.log(`✅ W11 CsCustomer 顾客:customer01/02/03@shop.com (pwd=Customer@123) upsert 完成`);
}

main()
  .catch((e) => {
    console.error('❌ seed 失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
