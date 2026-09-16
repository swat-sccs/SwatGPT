/**
 * Student-facing names for every hours source currently published by The Dash.
 * Keep distinct feeds distinct: for example, "mailroom" identifies the Post
 * Office, while "package room" identifies its separate Package Pickup feed.
 */
export const campusHoursAliases: Readonly<Record<string, readonly string[]>> = {
  'Black Cultural Center': ['BCC', 'black center', 'Black Cultural Center at Swarthmore'],
  'Bookstore': ['campus bookstore', 'college bookstore', 'Swarthmore store'],
  'Career Services': ['career center', 'career office', 'career counseling'],
  'Career Services – Peer Advisor Drop-Ins': ['career peer advisors', 'peer advisor drop-ins', 'career advising drop-ins'],
  'Cornell Library': ['Cornell', 'science library', 'Cornell Science Library'],
  'Counseling and Psychological Services (CAPS)': ['CAPS', 'counseling center', 'mental health services'],
  'Creative Media Commons': ['CMC', 'media commons', 'creative media lab'],
  'Crumb Cafe': ['Crumb', 'Crumb coffee shop', 'Crumb coffee bar'],
  'Dining Center': ['Sharples', 'DCC', 'dining hall', 'main dining hall'],
  "Essie's Corner": ["Essie's", 'Essies', "Essie Mae's"],
  'FMST Equipment Cage': ['FMST cage', 'film equipment cage', 'media equipment checkout'],
  'Gender & Sexuality Center': ['GSC', 'gender center', 'queer resource center'],
  'Global Engagement Office': ['GEO', 'global engagement', 'international programs office'],
  'Grab and Go at Paces (Clothier Memorial Hall)': ['Paces', 'grab and go', 'Clothier grab and go'],
  'Hormel-Nguyen Intercultural Center': ['IC', 'intercultural center', 'Hormel-Nguyen IC'],
  'ITS Help Desk - Beardsley In-Person Appointments': ['Beardsley help desk', 'in-person ITS help', 'in-person tech support'],
  'ITS Help Desk - McCabe': ['McCabe help desk', 'library tech help', 'McCabe tech support'],
  'ITS Help Desk - Remote': ['remote help desk', 'virtual ITS help', 'online tech support'],
  'Kohlberg Coffee Bar': ['Kohlberg cafe', 'Kohlberg coffee', 'Kohlberg coffee shop'],
  'Lamb-Miller Field House': ['field house', 'Lamb-Miller', 'athletics field house'],
  'Language Resource Center': ['LRC', 'language lab', 'language center'],
  'List Gallery': ['List', 'art gallery', 'List art gallery'],
  'MakerSpace': ['maker space', 'makerspace lab', 'Whittier makerspace'],
  'Matchbox Fitness Center': ['Matchbox', 'fitness center', 'campus gym'],
  'McCabe Library': ['McCabe', 'main library', 'humanities library'],
  'Mullan Tennis Center': ['Mullan', 'tennis center', 'indoor tennis center'],
  'OneCard Office': ['OneCard', 'ID card office', 'campus card office'],
  'Post Office': ['campus post office', 'mailroom', 'postal services'],
  'Post Office - Package Pickup': ['package pickup', 'package room', 'parcel pickup', 'package window'],
  'Print Services': ['printing office', 'copy center', 'campus printing'],
  'Science Center Coffee Bar': ['Sci coffee bar', 'Science Center cafe', 'science cafe'],
  'Sharples Commons': ['campus commons', 'Sharples student center', 'commons lounge'],
  'Special Collections Reading Room': ['special collections', 'rare books room', 'archives reading room'],
  'Underhill Library': ['Underhill', 'music library', 'performing arts library'],
  'Worth Health Center': ['Worth', 'health center', 'student health services'],
  'Writing Center': ['writing associates', 'writing help center', 'WA center'],
};

export function campusHoursAliasesFor(place: string): readonly string[] {
  return campusHoursAliases[place] ?? [];
}

export function campusHoursPlaceMatches(value: string, query?: string): boolean {
  if (!query) return true;
  const normalizedValue = normalizePlaceText(value);
  const normalizedQuery = normalizePlaceText(query);
  if (!normalizedQuery) return true;
  if (normalizedQuery.split(' ').every((word) => normalizedValue.includes(word))) return true;

  // A detailed source name can contain another canonical name ("Post Office -
  // Package Pickup" contains "Post Office"). Use only the longest matching
  // canonical name so aliases for the parent do not collapse separate feeds.
  const matchingPlaces = Object.keys(campusHoursAliases)
    .filter((place) => includesPhrase(normalizedValue, normalizePlaceText(place)));
  const longestNameLength = Math.max(0, ...matchingPlaces.map((place) => normalizePlaceText(place).length));
  return matchingPlaces
    .filter((place) => normalizePlaceText(place).length === longestNameLength)
    .some((place) => [place, ...campusHoursAliasesFor(place)]
      .some((alias) => includesPhrase(normalizedQuery, normalizePlaceText(alias))));
}

function normalizePlaceText(value: string): string {
  return value.toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function includesPhrase(haystack: string, needle: string): boolean {
  return needle.length > 0 && ` ${haystack} `.includes(` ${needle} `);
}
