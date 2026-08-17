export const domains = [
  'alerts',
  'weather',
  'hours',
  'dining',
  'events',
  'news',
  'transit',
  'sports',
  'mind_candy',
  'resources',
] as const;

export type Domain = (typeof domains)[number];
export type JsonObject = Record<string, unknown>;

export interface NormalizedRecord {
  domain: Domain;
  source: string;
  externalId: string;
  title: string;
  description?: string;
  category?: string;
  location?: string;
  url?: string;
  start?: string;
  end?: string;
  published?: string;
  searchText: string;
  payload: JsonObject;
}

export interface FeedResult<T = unknown> {
  items: T[];
  meta: {
    source: string[];
    fetched_at: string;
    data_as_of: string;
    stale: boolean;
    total: number;
    returned: number;
    truncated: boolean;
    warning?: string;
  };
}

export type FeedKind = 'google' | 'libcal' | 'cbord';

export interface HoursSource {
  place: string;
  category?: string;
  kind: FeedKind;
  sourceId: string;
  additionalInfoUrl?: string;
  locationText?: string;
  locationUrl?: string;
  announcement?: string;
  override?: unknown;
}

export interface DiningSource {
  location: string;
  kind: 'google' | 'cbord';
  sourceId: string;
  labels: string[];
  displayUpcoming: boolean;
}

export interface NewsSource {
  title: string;
  url: string;
  sticky: boolean;
  color?: string;
}

export interface ResourceSection {
  section: string;
  subtitle?: string;
  content: unknown[];
}

export interface DashboardRegistry {
  loadedAt: string;
  hashes: string[];
  hours: HoursSource[];
  dining: DiningSource[];
  news: NewsSource[];
  announcementCalendars: string[];
  appAnnouncements: JsonObject[];
  resources: ResourceSection[];
}

export interface ArchiveQuery {
  domain: Domain;
  query?: string;
  observedFrom: string;
  observedTo: string;
  limit: number;
}
