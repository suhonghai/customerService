import { describe, it, expect } from 'vitest';
import { extractScenarios } from './_spec-scenarios';

/**
 * _spec-scenarios 的回归测试。
 *
 * 这些用例全部来自 2026-08-03 审计中真实踩到的坑(见 issue #33):
 * 每一条都对应一次「扫描器少算/多算,导致守门空转」的事故。
 */
describe('extractScenarios', () => {
  it('抽得到三种引号的普通 it()', () => {
    expect(extractScenarios(`it('a'); it("b"); it(\`c\`);`)).toEqual(['a', 'b', 'c']);
  });

  it('抽得到 test()', () => {
    expect(extractScenarios(`test('t1');`)).toEqual(['t1']);
  });

  it('抽得到 only / skip / concurrent 等修饰符', () => {
    expect(extractScenarios(`it.only('o'); it.skip('s'); test.concurrent('c');`)).toEqual([
      'o',
      's',
      'c',
    ]);
  });

  it('抽得到 it.each 数组形式的参数化用例(cs-round-006 曾被报 0 scenarios)', () => {
    expect(extractScenarios(`it.each(['user','admin'])('role %s 被接受', () => {});`)).toEqual([
      'role %s 被接受',
    ]);
  });

  it('抽得到 test.each 模板字符串形式', () => {
    expect(extractScenarios('test.each`\na|b\n`(\'tpl title\', () => {});')).toEqual(['tpl title']);
  });

  it('标题内含异种引号时不截断(如 中文引述里的双引号)', () => {
    expect(extractScenarios(`it('用户问"如何退款"');`)).toEqual(['用户问"如何退款"']);
  });

  it('不把 split( 当成用例(缺 \\b 词边界会误报,order.e2e-spec 曾多算 1 条)', () => {
    expect(extractScenarios(`const x = 'a'.split('\\n');`)).toEqual([]);
  });

  it('不把 submit( 当成用例', () => {
    expect(extractScenarios(`await submit('form');`)).toEqual([]);
  });

  it('不把 describe( 当成用例', () => {
    expect(extractScenarios(`describe('d'); it('real');`)).toEqual(['real']);
  });

  it('同名用例不去重(计数必须真实)', () => {
    expect(extractScenarios(`it('dup'); it('dup');`)).toEqual(['dup', 'dup']);
  });
});
