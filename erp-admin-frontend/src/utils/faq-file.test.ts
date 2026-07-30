import { describe, it, expect } from 'vitest';
import { FAQ_ALLOWED_EXTENSIONS, getFileExt, isFAQAllowedFile, parseTagString } from './faq-file';

// crypto.subtle 在 jsdom 中已存在,不需要 polyfill;sha256OfFile 测试只校验格式

describe('faq-file utils', () => {
  describe('FAQ_ALLOWED_EXTENSIONS', () => {
    it('contains .md / .txt / .pdf', () => {
      expect(FAQ_ALLOWED_EXTENSIONS).toContain('.md');
      expect(FAQ_ALLOWED_EXTENSIONS).toContain('.txt');
      expect(FAQ_ALLOWED_EXTENSIONS).toContain('.pdf');
    });
  });

  describe('getFileExt', () => {
    it('returns empty for null / undefined / no extension', () => {
      expect(getFileExt(null)).toBe('');
      expect(getFileExt(undefined)).toBe('');
      expect(getFileExt('noext')).toBe('');
      expect(getFileExt('')).toBe('');
    });

    it('returns lowercased ext with dot', () => {
      expect(getFileExt('FAQ.md')).toBe('.md');
      expect(getFileExt('foo.PDF')).toBe('.pdf');
      expect(getFileExt('bar.TXT')).toBe('.txt');
    });

    it('handles dotted names (only last segment)', () => {
      expect(getFileExt('foo.bar.md')).toBe('.md');
    });
  });

  describe('isFAQAllowedFile', () => {
    it('accepts whitelisted extensions', () => {
      expect(isFAQAllowedFile('a.md')).toBe(true);
      expect(isFAQAllowedFile('a.txt')).toBe(true);
      expect(isFAQAllowedFile('a.pdf')).toBe(true);
      expect(isFAQAllowedFile('a.PDF')).toBe(true);
    });

    it('rejects others', () => {
      expect(isFAQAllowedFile('a.exe')).toBe(false);
      expect(isFAQAllowedFile('a.docx')).toBe(false);
      expect(isFAQAllowedFile('noext')).toBe(false);
      expect(isFAQAllowedFile(null)).toBe(false);
    });
  });

  describe('sha256OfFile', () => {
    it('returns 64-char hex digest', async () => {
      const { sha256OfFile } = await import('./faq-file');
      const fakeFile = { arrayBuffer: async () => new ArrayBuffer(0) } as any;
      const hash = await sha256OfFile(fakeFile);
      // jsdom 自带 crypto.subtle,SHA-256(空 buffer) = e3b0c44...
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      // 验证确定性:同样的 input 两次结果一致
      const hash2 = await sha256OfFile(fakeFile);
      expect(hash2).toBe(hash);
    });
  });

  describe('parseTagString', () => {
    it('returns [] for null / undefined / empty', () => {
      expect(parseTagString(null)).toEqual([]);
      expect(parseTagString(undefined)).toEqual([]);
      expect(parseTagString('')).toEqual([]);
    });

    it('splits by comma + trims', () => {
      expect(parseTagString('a,b,c')).toEqual(['a', 'b', 'c']);
      expect(parseTagString('a , b ,c ')).toEqual(['a', 'b', 'c']);
    });

    it('filters empty segments', () => {
      expect(parseTagString('a,,b,')).toEqual(['a', 'b']);
    });
  });
});
