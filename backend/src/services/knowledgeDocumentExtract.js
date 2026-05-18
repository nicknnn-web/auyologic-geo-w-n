/**
 * 知识库：从 PDF / Word 二进制抽取纯文本（供 AI 分析）。
 */
import { createRequire } from 'module';
import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';

const require = createRequire(import.meta.url);

/** pdf-parse 为 CJS，在 ESM 下用 require 更稳 */
function loadPdfParse() {
  return require('pdf-parse');
}

const MAX_EXTRACT_CHARS = 2_000_000;

function normalizeExtractedText(raw) {
  let s = String(raw ?? '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (s.length > MAX_EXTRACT_CHARS) {
    s = `${s.slice(0, MAX_EXTRACT_CHARS)}\n\n[正文过长，已截断至 ${MAX_EXTRACT_CHARS} 字符]`;
  }
  return s;
}

/**
 * @param {Buffer} buffer
 * @param {string} ext 小写扩展名 pdf|docx|doc
 * @returns {Promise<string>}
 */
export async function extractKnowledgeTextFromBuffer(buffer, ext) {
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('文件内容为空');
  }
  if (e === 'pdf') {
    const pdfParse = loadPdfParse();
    const data = await pdfParse(buffer);
    return normalizeExtractedText(data?.text ?? '');
  }
  if (e === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer });
    return normalizeExtractedText(value);
  }
  if (e === 'doc') {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(buffer);
    const body = typeof doc?.getBody === 'function' ? doc.getBody() : String(doc ?? '');
    return normalizeExtractedText(body);
  }
  throw new Error(`不支持的抽取类型: ${e || '(空)'}`);
}
