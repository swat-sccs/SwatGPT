import { join, relative } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import type { KnownLinks } from './links.ts';
import type { KbChunk } from './types.ts';
import { addKnownText, emptyKnownLinks } from './links.ts';
import { librechatApi } from './runtime.ts';

/** Roughly the ingest splitter's 512-token chunks with 64-token overlap, in characters. */
const CHUNK_CHARS = 1800;
const CHUNK_OVERLAP = 220;
const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

export interface KbDocument {
  path: string;
  title: string;
  source: string;
  body: string;
}

export interface Corpus {
  documents: Map<string, KbDocument>;
  chunks: KbChunk[];
  known: KnownLinks;
  index: LexicalIndex;
}

interface Posting {
  chunk: number;
  tf: number;
}

export interface LexicalIndex {
  postings: Map<string, Posting[]>;
  lengths: number[];
  averageLength: number;
}

export interface LexicalHit {
  chunk: number;
  score: number;
  rank: number;
}

/** Production's sparse-channel tokenizer (`packages/api/src/rag/lexical.ts`), so BM25 sees the same terms. */
export const { tokenize } = librechatApi;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return trimmed;
}

export function parseDocument(path: string, raw: string): KbDocument | undefined {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return undefined;
  }
  const [, frontmatter, body] = match;
  const field = (name: string): string | undefined => {
    const line = frontmatter.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
    return line ? unquote(line[1]) : undefined;
  };
  const title = field('title');
  const source = field('source');
  if (!title || !source) {
    return undefined;
  }
  return { path, title, source, body };
}

interface Section {
  heading?: string;
  text: string;
}

function splitSections(body: string): Section[] {
  const sections: Section[] = [];
  let heading: string | undefined;
  let lines: string[] = [];
  const flush = (): void => {
    const text = lines.join('\n').trim();
    if (text) {
      sections.push({ heading, text });
    }
  };
  for (const line of body.split('\n')) {
    const match = line.match(HEADING);
    if (!match) {
      lines.push(line);
      continue;
    }
    flush();
    heading = match[1];
    lines = [];
  }
  flush();
  return sections;
}

function windows(text: string): string[] {
  if (text.length <= CHUNK_CHARS) {
    return [text];
  }
  const parts: string[] = [];
  for (let start = 0; start < text.length; start += CHUNK_CHARS - CHUNK_OVERLAP) {
    parts.push(text.slice(start, start + CHUNK_CHARS));
    if (start + CHUNK_CHARS >= text.length) {
      break;
    }
  }
  return parts;
}

/** Heading-aware chunking that approximates the ingest pipeline's markdown + sentence splitter. */
export function chunkDocument(document: KbDocument, firstId: number): KbChunk[] {
  const chunks: KbChunk[] = [];
  for (const section of splitSections(document.body)) {
    const sectionName =
      section.heading && section.heading !== document.title ? section.heading : undefined;
    for (const text of windows(section.text)) {
      chunks.push({
        id: firstId + chunks.length,
        title: document.title,
        source: document.source,
        section: sectionName,
        text,
        doc: document.path,
      });
    }
  }
  return chunks;
}

export function buildIndex(chunks: KbChunk[]): LexicalIndex {
  const postings = new Map<string, Posting[]>();
  const lengths: number[] = [];
  let totalLength = 0;
  for (const chunk of chunks) {
    const tokens = tokenize(`${chunk.title} ${chunk.section ?? ''} ${chunk.text}`);
    lengths[chunk.id] = tokens.length;
    totalLength += tokens.length;
    const counts = new Map<string, number>();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    for (const [token, tf] of counts) {
      const list = postings.get(token);
      if (list) {
        list.push({ chunk: chunk.id, tf });
      } else {
        postings.set(token, [{ chunk: chunk.id, tf }]);
      }
    }
  }
  return { postings, lengths, averageLength: chunks.length ? totalLength / chunks.length : 0 };
}

/** BM25 over the local chunks; a stand-in for Qdrant's IDF-weighted sparse channel. */
export function searchLexical(
  index: LexicalIndex,
  query: string,
  limit: number,
  allowed?: Set<number>,
): LexicalHit[] {
  const total = index.lengths.length;
  const scores = new Map<number, number>();
  for (const token of new Set(tokenize(query))) {
    const list = index.postings.get(token);
    if (!list) {
      continue;
    }
    const idf = Math.log(1 + (total - list.length + 0.5) / (list.length + 0.5));
    for (const { chunk, tf } of list) {
      if (allowed && !allowed.has(chunk)) {
        continue;
      }
      const norm = 1 - BM25_B + (BM25_B * index.lengths[chunk]) / index.averageLength;
      const gain = (idf * tf * (BM25_K1 + 1)) / (tf + BM25_K1 * norm);
      scores.set(chunk, (scores.get(chunk) ?? 0) + gain);
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([chunk, score], index) => ({ chunk, score, rank: index + 1 }));
}

async function listMarkdown(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

export async function loadCorpus(root: string): Promise<Corpus> {
  const files = await listMarkdown(root);
  const documents = new Map<string, KbDocument>();
  const chunks: KbChunk[] = [];
  const known = emptyKnownLinks();
  const raws = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  files.forEach((file, position) => {
    const document = parseDocument(relative(root, file), raws[position]);
    if (!document) {
      return;
    }
    documents.set(document.path, document);
    addKnownText(known, `${document.source}\n${document.body}`);
    chunks.push(...chunkDocument(document, chunks.length));
  });
  return { documents, chunks, known, index: buildIndex(chunks) };
}
