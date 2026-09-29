import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMeetingWhen, meetingPhase } from './format';

// vitest.config.ts pins TZ=America/Guayaquil (UTC-5).
describe('formatMeetingWhen', () => {
  it('shows the start and end in the user zone on one line', () => {
    // 19:00Z–20:00Z is 14:00–15:00 local.
    const text = formatMeetingWhen({ startsAt: '2026-09-28T19:00:00Z', endsAt: '2026-09-28T20:00:00Z' });
    expect(text).toContain('14:00');
    expect(text).toContain('15:00');
    expect(text).toMatch(/28/);
  });

  it('files an evening meeting under its local day, not the UTC day', () => {
    // 01:00Z on the 29th is 20:00 local on the 28th.
    const text = formatMeetingWhen({ startsAt: '2026-09-29T01:00:00Z', endsAt: '2026-09-29T02:00:00Z' });
    expect(text).toMatch(/28/);
    expect(text).not.toMatch(/29/);
  });

  it('adds the end date when the meeting spans days', () => {
    const text = formatMeetingWhen({ startsAt: '2026-09-28T23:00:00Z', endsAt: '2026-09-29T15:00:00Z' });
    expect(text.split('–')[1]).toMatch(/29/);
  });
});

describe('meetingPhase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T15:30:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('classifies upcoming, live and past meetings', () => {
    expect(meetingPhase({ startsAt: '2026-09-28T16:00:00Z', endsAt: '2026-09-28T17:00:00Z' })).toBe('upcoming');
    expect(meetingPhase({ startsAt: '2026-09-28T15:00:00Z', endsAt: '2026-09-28T16:00:00Z' })).toBe('live');
    expect(meetingPhase({ startsAt: '2026-09-28T14:00:00Z', endsAt: '2026-09-28T15:30:00Z' })).toBe('past');
  });
});
