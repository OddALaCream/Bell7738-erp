import { describe, expect, it } from 'vitest';
import seedSource from '../../../api/prisma/seed.ts?raw';
import schemaSource from '../../../api/prisma/schema.prisma?raw';
import activitySource from '../../../api/src/activity/activity-event-types.ts?raw';
import permissionsSource from './permissions.ts?raw';
import { ACTIVITY_TYPE_GROUPS, ACTIVITY_TYPE_LABEL } from '@/features/activity/describe';

/**
 * The frontend keeps small copies of vocabularies the backend owns. These tests
 * read the backend sources so that a value added or renamed there without the
 * matching change here fails CI instead of surfacing as a hidden control, an
 * unfilterable row or a missing label in production.
 */
const sorted = (values: Iterable<string>) => [...values].sort();

describe('permission keys', () => {
  const catalog = [...seedSource.matchAll(/key: '([A-Z_]+)'/g)].map((match) => match[1]!);
  const typed = [...permissionsSource.matchAll(/^\s+\| '([A-Z_]+)'/gm)].map((match) => match[1]!);

  it('reads the seeded catalog', () => {
    expect(catalog.length).toBeGreaterThan(20);
  });

  it('types exactly the keys the backend seeds', () => {
    expect(sorted(typed)).toEqual(sorted(catalog));
  });
});

describe('activity event types', () => {
  const backend = [...activitySource.matchAll(/^\s+'([A-Z_]+)',$/gm)].map((match) => match[1]!);

  it('lists and labels exactly the backend types', () => {
    expect(backend.length).toBeGreaterThan(15);
    expect(sorted(ACTIVITY_TYPE_GROUPS.flatMap((group) => group.types))).toEqual(sorted(backend));
    expect(sorted(Object.keys(ACTIVITY_TYPE_LABEL))).toEqual(sorted(backend));
  });
});

describe('notification types', () => {
  it('matches the Prisma enum the API emits', () => {
    const block = /enum NotificationType \{([^}]*)\}/.exec(schemaSource)?.[1] ?? '';
    const backend = block.split('\n').map((line) => line.trim()).filter(Boolean);
    expect(backend).toEqual(['TASK_ASSIGNED', 'MEETING_ADDED', 'MEETING_UPDATED', 'MEETING_REMINDER_24H', 'MEETING_REMINDER_1H']);
  });
});
