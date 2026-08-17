import type { DashboardRegistry, DiningSource, HoursSource, JsonObject, NewsSource, ResourceSection } from '../types.js';
import { asObject, asObjects, cleanText, stringValue } from '../util.js';
import type { DashClient } from './client.js';

interface PageData {
  staticQueryHashes?: string[];
}

interface StaticQueryDocument {
  data?: Record<string, unknown>;
}

export class RegistryDiscovery {
  private registry?: DashboardRegistry;

  constructor(private readonly client: DashClient) {}

  current(): DashboardRegistry {
    if (!this.registry) throw new Error('Dashboard configuration has not been loaded yet');
    return this.registry;
  }

  async load(force = false): Promise<DashboardRegistry> {
    if (this.registry && !force) return this.registry;
    if (force) this.client.clearCache();
    const pageData = await this.client.getJson<PageData>('/page-data/index/page-data.json', force ? 0 : 300);
    const hashes = [...new Set(pageData.staticQueryHashes ?? [])];
    if (!hashes.length) throw new Error('Dash page data did not advertise any static queries');
    const documents = await Promise.all(hashes.map((hash) => this.client.getJson<StaticQueryDocument>(`/page-data/sq/d/${hash}.json`, force ? 0 : 300)));
    this.registry = parseRegistry(hashes, documents);
    return this.registry;
  }
}

export function parseRegistry(hashes: string[], documents: StaticQueryDocument[]): DashboardRegistry {
  const hours: HoursSource[] = [];
  const dining: DiningSource[] = [];
  const news: NewsSource[] = [];
  const announcementCalendars = new Set<string>();
  const appAnnouncements: JsonObject[] = [];
  const resources: ResourceSection[] = [];

  for (const document of documents) {
    const data = document.data ?? {};
    for (const node of nodes(data.allNodeHours)) {
      const feed = asObject(asObject(node.relationships)?.field_hours_feeds);
      const type = stringValue(asObject(feed?.internal)?.type);
      const relationships = asObject(feed?.relationships);
      const google = asObject(relationships?.field_google_calendar);
      const googleId = stringValue(google?.field_calendar_id);
      const libcalId = stringValue(feed?.field_libcal_feed_name);
      const cbordId = stringValue(feed?.field_cbord_location);
      const sourceId = googleId ?? libcalId ?? cbordId;
      if (!sourceId) continue;
      hours.push({
        place: cleanText(node.title, 300) ?? sourceId,
        category: cleanText(node.field_hours_category, 200),
        kind: type?.includes('libcal') ? 'libcal' : type?.includes('cbord') ? 'cbord' : 'google',
        sourceId,
        additionalInfoUrl: linkUri(node.field_additional_info_link),
        locationText: cleanText(node.field_location_text, 500),
        locationUrl: linkUri(node.field_location_url),
        announcement: cleanText(node.field_hours_announcement),
        override: node.field_hours_override,
      });
    }

    for (const node of nodes(data.allNodeDiningMenus)) {
      const feed = asObject(asObject(node.relationships)?.field_dining_menu_feeds);
      const google = asObject(asObject(feed?.relationships)?.field_google_calendar);
      const googleId = stringValue(google?.field_calendar_id);
      const cbordId = stringValue(feed?.field_cbord_location);
      if (!googleId && !cbordId) continue;
      dining.push({
        location: cleanText(node.title, 300) ?? cleanText(google?.title, 300) ?? cbordId ?? googleId ?? 'Dining',
        kind: cbordId ? 'cbord' : 'google',
        sourceId: cbordId ?? googleId!,
        labels: Array.isArray(node.field_dining_location_labels) ? node.field_dining_location_labels.map(String) : [],
        displayUpcoming: node.field_display_upcoming_menu !== false,
      });
    }

    for (const node of nodes(data.allNodeAroundCampusFeeds)) {
      const url = linkUri(node.field_feed_url);
      if (!url) continue;
      news.push({
        title: cleanText(node.title, 300) ?? url,
        url,
        sticky: Boolean(node.sticky),
        color: stringValue(asObject(node.field_label_color)?.color ?? node.field_label_color),
      });
    }

    for (const node of nodes(data.allNodeAnnouncementSection)) {
      const sources = asObjects(asObject(node.relationships)?.field_feed_sources);
      for (const source of sources) {
        const id = stringValue(asObject(asObject(source.relationships)?.field_google_calendar)?.field_calendar_id);
        if (id) announcementCalendars.add(id);
      }
    }

    for (const node of nodes(data.allNodeAppAnnouncement)) appAnnouncements.push(node);

    for (const node of nodes(data.allNodeContentSection)) {
      const relationships = asObject(node.relationships);
      const content = [
        ...asObjects(relationships?.field_content),
        ...asObjects(relationships?.field_secondary_content),
      ];
      if (content.length) resources.push({
        section: cleanText(node.title, 200) ?? stringValue(node.field_section_type) ?? 'Campus',
        subtitle: cleanText(node.field_subtitle, 500),
        content,
      });
    }
  }

  return {
    loadedAt: new Date().toISOString(),
    hashes,
    hours: uniqueBy(hours, (item) => `${item.place}:${item.kind}:${item.sourceId}`),
    dining: uniqueBy(dining, (item) => `${item.location}:${item.kind}:${item.sourceId}`),
    news: uniqueBy(news, (item) => item.url),
    announcementCalendars: [...announcementCalendars],
    appAnnouncements: uniqueBy(appAnnouncements, (item) => String(item.id ?? item.drupal_id ?? JSON.stringify(item))),
    resources: uniqueBy(resources, (item) => `${item.section}:${JSON.stringify(item.content)}`),
  };
}

function nodes(value: unknown): JsonObject[] {
  const edges = asObject(value)?.edges;
  if (!Array.isArray(edges)) return [];
  return edges.map((edge) => asObject(asObject(edge)?.node)).filter((node): node is JsonObject => Boolean(node));
}

function linkUri(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return stringValue(asObject(value[0])?.uri);
  return stringValue(asObject(value)?.uri);
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
