import { describe, it, expect } from 'vitest';
import { VAR_REGEX, extractUsedVariables, parseVariableList, diffVariables } from './variables';

describe('variables utils', () => {
  describe('extractUsedVariables', () => {
    it('returns empty array for empty / undefined-ish input', () => {
      expect(extractUsedVariables('')).toEqual([]);
    });

    it('extracts a single variable', () => {
      expect(extractUsedVariables('你是 {store_name} 的 AI 助手')).toEqual(['store_name']);
    });

    it('deduplicates while preserving first-seen order', () => {
      expect(extractUsedVariables('{store_name} 您好,{store_name},再来一个 {ticket_no}')).toEqual([
        'store_name',
        'ticket_no',
      ]);
    });

    it('supports underscores + digits after the first letter/underscore', () => {
      expect(extractUsedVariables('{_x1} {v2_test} {a_b_c}')).toEqual(['_x1', 'v2_test', 'a_b_c']);
    });

    it('ignores illegal placeholders (digits / dots / spaces / CJK)', () => {
      expect(extractUsedVariables('{1bad} {has.dot} {has space} {中文} {ok_name}')).toEqual([
        'ok_name',
      ]);
    });

    it('ignores stray braces that do not form a placeholder', () => {
      // 没有匹配花括号包裹 + 合法名,不应该被捕获
      expect(extractUsedVariables('price: $5.00 — use {} or { } only')).toEqual([]);
    });

    it('VAR_REGEX is the documented pattern', () => {
      expect(VAR_REGEX.source).toBe('\\{([a-zA-Z_][a-zA-Z0-9_]*)\\}');
    });
  });

  describe('parseVariableList', () => {
    it('returns [] for null / undefined / empty string', () => {
      expect(parseVariableList(null)).toEqual([]);
      expect(parseVariableList(undefined)).toEqual([]);
      expect(parseVariableList('')).toEqual([]);
    });

    it('parses a JSON array of strings', () => {
      expect(parseVariableList('["store_name","ticket_no"]')).toEqual(['store_name', 'ticket_no']);
    });

    it('returns [] on invalid JSON without throwing', () => {
      expect(parseVariableList('not json')).toEqual([]);
      expect(parseVariableList('{broken')).toEqual([]);
    });

    it('returns [] for JSON non-array (e.g. object / number / string)', () => {
      expect(parseVariableList('{"a":1}')).toEqual([]);
      expect(parseVariableList('42')).toEqual([]);
      expect(parseVariableList('"hello"')).toEqual([]);
    });

    it('filters non-string elements out of arrays', () => {
      expect(parseVariableList('["ok",1,null,true,{"x":1}]')).toEqual(['ok']);
    });
  });

  describe('diffVariables', () => {
    it('returns both empty when used and declared are equal', () => {
      expect(diffVariables(['a', 'b'], ['a', 'b'])).toEqual({
        undeclared: [],
        unused: [],
      });
    });

    it('detects undeclared (used but not declared)', () => {
      expect(diffVariables(['a', 'b', 'c'], ['a'])).toEqual({
        undeclared: ['b', 'c'],
        unused: [],
      });
    });

    it('detects unused (declared but not used)', () => {
      expect(diffVariables(['a'], ['a', 'b', 'c'])).toEqual({
        undeclared: [],
        unused: ['b', 'c'],
      });
    });

    it('handles both sides simultaneously', () => {
      expect(diffVariables(['a', 'b'], ['a', 'c'])).toEqual({
        undeclared: ['b'],
        unused: ['c'],
      });
    });
  });
});
