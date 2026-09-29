import { describe, expect, it } from 'vitest';
import backendSource from '../../../../api/src/audit/audit-actions.ts?raw';
import { AUDIT_ACTIONS } from './api';
import { AUDIT_ACTION_LABEL } from './labels';

/**
 * The audit filter and labels are built from a copy of the backend's action list.
 * Reading the backend source keeps the copy honest: a new action there without a
 * matching entry here (an unfilterable, unlabeled row) fails this test.
 */
describe('audit actions contract with the API', () => {
  const backend = [...backendSource.matchAll(/^\s+'([A-Z_]+)',$/gm)].map((match) => match[1]);

  it('finds the backend list', () => {
    expect(backend.length).toBeGreaterThan(20);
  });

  it('offers exactly the backend actions in the filter', () => {
    expect([...AUDIT_ACTIONS].sort()).toEqual([...backend].sort());
  });

  it('has a readable label for every action', () => {
    for (const action of backend) expect(AUDIT_ACTION_LABEL[action as keyof typeof AUDIT_ACTION_LABEL], action).toBeTruthy();
  });
});
