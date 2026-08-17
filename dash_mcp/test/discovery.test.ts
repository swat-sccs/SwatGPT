import { describe, expect, it } from 'vitest';
import { parseRegistry } from '../src/upstream/discovery.js';

describe('Gatsby registry discovery', () => {
  it('discovers public hours, dining, news, announcements, and resources by shape', () => {
    const registry = parseRegistry(['123'], [{ data: {
      allNodeHours: { edges: [{ node: {
        title: 'McCabe Library', field_hours_category: 'Libraries', relationships: { field_hours_feeds: {
          internal: { type: 'paragraph__libcal_feed' }, field_libcal_feed_name: 'McCabe Library',
        } },
      } }] },
      allNodeDiningMenus: { edges: [{ node: {
        title: 'Dining Center', field_display_upcoming_menu: true, field_dining_location_labels: [],
        relationships: { field_dining_menu_feeds: { field_cbord_location: 'DCC' } },
      } }] },
      allNodeAroundCampusFeeds: { edges: [{ node: {
        title: 'Campus News', field_feed_url: { uri: 'https://example.edu/feed' },
        field_label_color: { color: '#cc0000' }, sticky: true,
      } }] },
      allNodeAnnouncementSection: { edges: [{ node: { relationships: { field_feed_sources: [{
        relationships: { field_google_calendar: { field_calendar_id: 'calendar@example.com' } },
      }] } } }] },
      allNodeAppAnnouncement: { edges: [{ node: { id: 'app-1', title: 'Notice', status: true } }] },
      allNodeContentSection: { edges: [{ node: {
        title: 'Transportation', relationships: { field_secondary_content: [{ id: 'resource-1', field_links: [{ title: 'SEPTA', uri: 'https://septa.org' }] }] },
      } }] },
    } }]);

    expect(registry.hours[0]).toMatchObject({ place: 'McCabe Library', kind: 'libcal', sourceId: 'McCabe Library' });
    expect(registry.dining[0]).toMatchObject({ location: 'Dining Center', kind: 'cbord', sourceId: 'DCC' });
    expect(registry.news[0]).toMatchObject({ title: 'Campus News', sticky: true, color: '#cc0000' });
    expect(registry.announcementCalendars).toEqual(['calendar@example.com']);
    expect(registry.appAnnouncements).toHaveLength(1);
    expect(registry.resources[0]?.section).toBe('Transportation');
  });
});
