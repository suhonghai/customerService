/**
 * @status implemented
 * @change-id cs-round-073
 *
 * cs-round-073: 把容器内 nginx 改动合并回仓库 + 契约守门(2026-08-21)
 *
 * Why:
 * 用户报告「当前 docker 部署的 nginx 文件已经不是最新,我之前改过服务器上的
 * nginx 配置」。实际查证(SSH 看 `/opt/w11-erp/deploy/nginx/prod.conf` + 容器内
 * `/etc/nginx/conf.d/default.conf`):
 *   - host `/opt/w11-erp/deploy/nginx/prod.conf` md5=b22a1317...,164 行(原仓库版本)
 *   - 容器内 `cat /etc/nginx/conf.d/default.conf` 真实大小 = 8436 bytes,221 行
 *     md5=9430ba92...
 *   - **docker cp 拉出来的是 164 行(跟 host 一致)**,这是个 docker 旧版本的怪行为
 *     (cp 走 daemon 的 tar archive 协议,而 nsenter read 走真实文件系统)
 *
 *   用 `docker exec nginx sh -c "cat ..." > /tmp/...conf` 直接走 nsenter 才能拉到
 *   真实内容(221 行)。
 *
 * 用户实际改的内容(对比 164 行 → 221 行,3 处):
 *   1. **server_name(line 34)**:`app.suhhai.cn chat.suhhai.cn api.suhhai.cn`
 *      → `app.suhhai.cn chat.suhhai.cn api.suhhai.cn suhhai.cn`(加裸域)
 *   2. **app.suhhai.cn server block**:加 `/babyTao/` 反代 → `baobaotao:8001`
 *      (baobaoTao 项目,Flask + Waitress)
 *   3. **新增 suhhai.cn server block**:443 ssl,通配证书 `suhhai.cn`,
 *      整个 server 反代 → `baobaotao:8001`(兜底 location 返 404)
 *
 * 风险:
 *   - 容器重启时,host bind mount 会覆盖容器内 in-memory 的改动
 *   - 用户改的是容器内,但仓库没 commit → git tracked version 是旧的
 *   - deploy/update.sh reload nginx 时,host 文件就是新的(reload 的是
 *     /etc/nginx/conf.d/default.conf,但实际内容来自 bind mount 也就是 host)
 *   - 容器重启 + bind mount → 当前 221 行的 in-memory 修改丢失 → 退化到 164 行
 *
 * 修法:
 *   1. 把容器内 221 行版本覆盖仓库 deploy/nginx/prod.conf,补 trailing newline
 *   2. commit 进 git,后续 rsync + docker compose up 会保持一致
 *   3. 写 spec 守门 nginx 配置契约(防止后续有人不小心删了 server block
 *      / 反代 / 通配证书)
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1: 契约 — prod.conf 必须保留 suhhai.cn 裸域配置
 *     Given deploy/nginx/prod.conf 源码
 *     Then  grep `server_name ... suhhai.cn` 在 80 端口 default_server 命中
 *     And   grep `server {` 至少有 4 个(原 3 个 + 新增 suhhai.cn)
 *     And   grep `baobaotao:8001` 至少 2 处(app.suhhai.cn + suhhai.cn 各一次)
 *     And   grep `ssl_certificate.*suhhai.cn/fullchain.pem` 命中(通配证书)
 *     And   grep `location /babyTao/` 至少 2 处
 *
 *   Scenario 2: 契约 — 不能丢原有 3 个 server block
 *     Given deploy/nginx/prod.conf 源码
 *     Then  grep `server_name app.suhhai.cn` 命中(管理后台)
 *     And   grep `server_name chat.suhhai.cn` 命中(终端客服)
 *     And   grep `server_name api.suhhai.cn` 命中(后端 API)
 *
 *   Scenario 3: 契约 — gzip 配置在新增 server block 里也得有
 *     Given deploy/nginx/prod.conf 源码
 *     Then  grep `gzip on` 至少有 4 处(3 个原 server block + 新增 suhhai.cn)
 *
 * Out of scope:
 *   - baobaotao 容器本身(不在本 monorepo,不在这次 PR 范围)
 *   - certbot 申请 suhhai.cn 证书的脚本(ssl/renewal/suhhai.cn.conf 已存在)
 *   - 容器内改动同步回 host mount 的自动化脚本(手动操作一次即可)
 *
 * 落点:跨包端到端 → tests/_specs/cs-round-073.spec.ts(验证部署配置契约),
 *      跟 cs-round-001/068 同级(放根 tests/_specs/ 而非子包内)。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const PROD_CONF = resolve(ROOT, 'deploy/nginx/prod.conf');

describe('cs-round-073: deploy/nginx/prod.conf 契约(用户改的 3 处必须保留)', () => {
  const code = readFileSync(PROD_CONF, 'utf-8');

  // ── Scenario 1: 用户新加的内容(suhhai.cn 裸域 + babyTao 反代 + 通配证书) ──
  describe('Scenario 1: 用户新增的 suhhai.cn 配置必须保留', () => {
    it('Then: server_name 含 suhhai.cn / baobaotao:8001 ≥ 2 / babyTao location ≥ 2 / 通配证书路径命中', () => {
      // 80 端口 default_server 加 suhhai.cn
      expect(code, '80 端口 server_name 必须含 suhhai.cn').toMatch(
        /server_name\s+app\.suhhai\.cn\s+chat\.suhhai\.cn\s+api\.suhhai\.cn\s+suhhai\.cn/,
      );
      // baobaotao 反代至少 2 处(app.suhhai.cn 内 + suhhai.cn 内)
      const baobaotaoMatches = code.match(/baobaotao:8001/g) || [];
      expect(baobaotaoMatches.length, 'baobaotao:8001 反代必须 ≥ 2 处').toBeGreaterThanOrEqual(2);
      // location /babyTao/ 至少 2 处
      const babyTaoMatches = code.match(/location\s+\/babyTao\//g) || [];
      expect(babyTaoMatches.length, 'location /babyTao/ 必须 ≥ 2 处').toBeGreaterThanOrEqual(2);
      // 通配证书 suhhai.cn
      expect(code, '通配证书路径 suhhai.cn/fullchain.pem 必须存在').toMatch(
        /ssl_certificate\s+\/etc\/nginx\/ssl\/live\/suhhai\.cn\/fullchain\.pem/,
      );
      // 必须有独立的 suhhai.cn server block(443 ssl)
      expect(code, '必须有独立的 server_name suhhai.cn; server block').toMatch(
        /\bserver_name\s+suhhai\.cn;/,
      );
    });
  });

  // ── Scenario 2: 原 3 个 server block 不能丢 ──
  describe('Scenario 2: 原 3 个 server block 必须保留', () => {
    it('Then: app.suhhai.cn / chat.suhhai.cn / api.suhhai.cn 都在', () => {
      expect(code, 'app.suhhai.cn server block 必须保留').toMatch(/server_name\s+app\.suhhai\.cn;/);
      expect(code, 'chat.suhhai.cn server block 必须保留').toMatch(/server_name\s+chat\.suhhai\.cn;/);
      expect(code, 'api.suhhai.cn server block 必须保留').toMatch(/server_name\s+api\.suhhai\.cn;/);
      // 总 server block 数 >= 4(原 3 + 新增 suhhai.cn)
      const serverBlockCount = (code.match(/^\s*server\s*\{/gm) || []).length;
      expect(serverBlockCount, '总 server block 必须 ≥ 4 个').toBeGreaterThanOrEqual(4);
    });
  });

  // ── Scenario 3: 新增 suhhai.cn server block 跟 app.suhhai.cn 一样有 gzip ──
  describe('Scenario 3: 新增 suhhai.cn server block 跟 app.suhhai.cn 一致有 gzip', () => {
    it('Then: gzip on 至少有 2 处(app.suhhai.cn + suhhai.cn)', () => {
      // 仓库原版 gzip 只在 app.suhhai.cn 一个 server block;chat/api 没有
      // gzip(WS + API JSON 不需要,frontend 自带 nginx 处理)。
      // 用户新增 suhhai.cn 时正确地复制了 gzip,应该 ≥ 2 处。
      const gzipOnCount = (code.match(/^\s*gzip\s+on\s*;/gm) || []).length;
      expect(gzipOnCount, 'gzip on 必须 ≥ 2 处(app.suhhai.cn + suhhai.cn)').toBeGreaterThanOrEqual(2);
    });
  });
});