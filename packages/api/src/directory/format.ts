import type { DirectoryEntry } from '@librechat/data-schemas';
import type { DirectoryLookup } from './match';
import { MAX_PERSON_MATCHES, MAX_RESIDENTS } from './match';

const HEADING = '# Swarthmore student directory lookup';
const INSTRUCTION =
  'The user asked a housing question and this is the result from the SCCS student directory (Cygnet). ' +
  'Answer directly from it: state the dorm and room exactly as listed and do not guess or invent housing. ' +
  'If it reports no match, say the directory has no entry for that person (faculty, staff, off-campus ' +
  'students, and students who hid their profile are not listed) and suggest https://cygnet.sccs.swarthmore.edu. ' +
  'Ignore this block if the question is not about where a Swarthmore student lives.';

function classYear(entry: DirectoryEntry): string {
  return entry.gradYear ? ` '${String(entry.gradYear).slice(-2)}` : '';
}

function describeName(entry: DirectoryEntry): string {
  return `${entry.firstName} ${entry.lastName}${classYear(entry)} (${entry.uid})`;
}

function describeHousing(entry: DirectoryEntry): string {
  if (entry.dormHidden) {
    return 'dorm not shared (the student hid their room in Cygnet)';
  }
  if (!entry.dorm) {
    return 'no on-campus housing listed';
  }
  return entry.room ? `${entry.dorm} ${entry.room}` : entry.dorm;
}

function describeEntry(entry: DirectoryEntry): string {
  return `- ${describeName(entry)}: ${describeHousing(entry)}`;
}

function formatPerson(lookup: Extract<DirectoryLookup, { kind: 'person' }>): string[] {
  if (lookup.total === 0) {
    return [`No student directory entry matches "${lookup.query}".`];
  }
  if (lookup.total > MAX_PERSON_MATCHES) {
    return [
      `${lookup.total} students match "${lookup.query}", which is too many to list. ` +
        'Ask the user for the full name or Swarthmore username.',
    ];
  }
  const lines = lookup.matches.map(describeEntry);
  if (lookup.total > 1) {
    lines.unshift(
      `${lookup.total} students match "${lookup.query}"; ask which one if the user did not say.`,
    );
  }
  if (lookup.roommates === undefined) {
    return lines;
  }
  const roommates =
    lookup.roommates.length === 0
      ? ['No other student is listed in that room.']
      : ['Roommates:', ...lookup.roommates.map(describeEntry)];
  return [...lines, ...roommates];
}

function formatPlace(lookup: Extract<DirectoryLookup, { kind: 'place' }>): string[] {
  if (lookup.room !== undefined) {
    return lookup.total === 0
      ? [`No student is listed in ${lookup.dorm} ${lookup.room}.`]
      : [`Residents of ${lookup.dorm} ${lookup.room}:`, ...lookup.residents.map(describeEntry)];
  }
  if (lookup.floor !== undefined) {
    const shown =
      lookup.total > MAX_RESIDENTS ? ` (showing ${MAX_RESIDENTS} of ${lookup.total})` : '';
    return lookup.total === 0
      ? [`No student is listed on floor ${lookup.floor} of ${lookup.dorm}.`]
      : [
          `Residents on floor ${lookup.floor} of ${lookup.dorm}${shown}:`,
          ...lookup.residents.map(describeEntry),
        ];
  }
  return [
    `${lookup.dorm} has ${lookup.total} listed residents, too many to list. ` +
      'Ask the user for a room number or floor.',
  ];
}

export function formatDirectoryContext(lookup: DirectoryLookup): string {
  const body = lookup.kind === 'person' ? formatPerson(lookup) : formatPlace(lookup);
  return [HEADING, INSTRUCTION, body.join('\n')].join('\n\n');
}
