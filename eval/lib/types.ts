export type QuestionKind = 'answerable' | 'unanswerable' | 'followup';

/** One expected fact: the answer passes it when any alternative appears. */
export type Fact = string[];

export interface Question {
  id: string;
  kind: QuestionKind;
  /** User turns in order; only the last one is scored. */
  turns: string[];
  /** KB files (relative to the KB root) the expected answer is drawn from. */
  docs: string[];
  facts: Fact[];
}

export interface QuestionSet {
  version: number;
  questions: Question[];
}

export interface KbChunk {
  id: number;
  title: string;
  source: string;
  section?: string;
  text: string;
  /** KB file path relative to the KB root. */
  doc: string;
}

export type RetrievalMode = 'live' | 'local';

export type RetrievalResult = 'hit' | 'empty' | 'timeout' | 'error' | 'disabled';

export interface Retrieval {
  /** Text appended to the system prompt: KB context or the retrieval note. */
  context?: string;
  result: RetrievalResult;
  /** Source URLs of the entries in `context`, in rank order. */
  sources: string[];
  elapsedMs: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerationParams {
  model: string;
  baseUrl: string;
  temperature: number;
  top_p: number;
  top_k: number;
  max_tokens: number;
  chat_template_kwargs: { enable_thinking: boolean };
}

export interface Completion {
  text: string;
  ttftMs?: number;
  totalMs: number;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
}

export interface Score {
  factsMatched: number;
  factsTotal: number;
  /** Indexes of facts with no matching alternative. */
  missingFacts: number[];
  refused: boolean;
  urls: string[];
  inventedUrls: string[];
  emails: string[];
  inventedEmails: string[];
  phones: string[];
  inventedPhones: string[];
  /** Cites context entries as `[n]` markers, which the user cannot follow. */
  numericCitation: boolean;
  citedRetrieved: boolean;
  citedExpected: boolean;
  goldRetrieved: boolean;
  pass: boolean;
  /** Higher is worse; used to rank failures. */
  severity: number;
}

export interface TurnRecord {
  question: string;
  retrievalQuery: string;
  retrieval: Retrieval;
  completion: Completion;
}

export interface CaseRecord {
  id: string;
  kind: QuestionKind;
  expectedSources: string[];
  facts: Fact[];
  turns: TurnRecord[];
  score?: Score;
  error?: string;
}

export interface Percentiles {
  p50?: number;
  p95?: number;
}

export interface Summary {
  cases: number;
  errors: number;
  answerable: number;
  accuracy: number;
  meanFactRecall: number;
  unanswerable: number;
  refusalCorrect: number;
  falseRefusals: number;
  hallucinatedUrlRate: number;
  inventedUrlCount: number;
  inventedEmailRate: number;
  inventedPhoneRate: number;
  numericCitationRate: number;
  expectedSourceCited: number;
  citedAmongRetrieved: number;
  /** Retrieval recall of the expected sources; `undefined` in local oracle mode, where they are injected. */
  goldRetrieved?: number;
  latencyMs: Percentiles;
  ttftMs: Percentiles;
  retrievalMs: Percentiles;
  completionTokens: Percentiles;
}

export interface RunMeta {
  startedAt: string;
  finishedAt: string;
  mode: RetrievalMode;
  oracle: boolean;
  concurrency: number;
  params: Omit<GenerationParams, 'baseUrl'> & { baseUrl: string };
  questionSet: string;
  notes: string[];
}

export interface Report {
  meta: RunMeta;
  summary: Summary;
  cases: CaseRecord[];
}
