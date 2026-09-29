import { describe, expect, it } from 'vitest';
import { canAny, canManageInProject, canWriteInProject, makeCan } from './permissions';
import { visibleAdminItems, visibleMainItems } from '@/components/layout/nav-config';
import {
  canCompleteTask,
  canCreateTask,
  canDeleteTask,
  canEditTask,
  canReopenTask,
} from '@/features/tasks/permissions';

describe('makeCan', () => {
  it('is true only when every requested key is held', () => {
    const can = makeCan(['TASKS_CREATE', 'TASKS_UPDATE']);
    expect(can('TASKS_CREATE')).toBe(true);
    expect(can('TASKS_CREATE', 'TASKS_UPDATE')).toBe(true);
    expect(can('TASKS_CREATE', 'TASKS_DELETE')).toBe(false);
  });

  it('holds nothing while the permissions are unknown', () => {
    expect(makeCan(undefined)('DASHBOARD_VIEW')).toBe(false);
    expect(makeCan([])('AUDIT_VIEW')).toBe(false);
  });

  it('canAny needs just one', () => {
    expect(canAny(makeCan(['ROLES_MANAGE']), 'ROLES_VIEW', 'ROLES_MANAGE')).toBe(true);
    expect(canAny(makeCan([]), 'ROLES_VIEW', 'ROLES_MANAGE')).toBe(false);
  });
});

describe('admin navigation', () => {
  it('shows an administrator with custom roles exactly the sections they can use', () => {
    const items = visibleAdminItems(makeCan(['USERS_VIEW', 'AUDIT_VIEW']));
    expect(items.map((item) => item.to)).toEqual(['/admin/users', '/admin/audit']);
  });

  it('accepts either roles permission for the roles screen', () => {
    expect(visibleAdminItems(makeCan(['ROLES_MANAGE'])).map((item) => item.to)).toEqual(['/admin/roles']);
    expect(visibleAdminItems(makeCan(['ROLES_VIEW'])).map((item) => item.to)).toEqual(['/admin/roles']);
  });

  it('lets someone who can only invite reach the users screen', () => {
    expect(visibleAdminItems(makeCan(['USERS_CREATE'])).map((item) => item.to)).toEqual(['/admin/users']);
  });

  it('shows nothing to someone without administrative permissions', () => {
    expect(visibleAdminItems(makeCan(['TASKS_CREATE', 'PROJECTS_VIEW_ASSIGNED']))).toEqual([]);
  });

  it('shows everything to a person holding the whole catalog (the Owner)', () => {
    const all = makeCan(['USERS_VIEW', 'ROLES_VIEW', 'ROLES_MANAGE', 'AUDIT_VIEW']);
    expect(visibleAdminItems(all)).toHaveLength(3);
  });
});

describe('project-scoped hints', () => {
  it('needs the permission AND membership (or the organization-wide override)', () => {
    const member = makeCan(['TASKS_CREATE']);
    expect(canWriteInProject(member, 'TASKS_CREATE', 'MEMBER')).toBe(true);
    expect(canWriteInProject(member, 'TASKS_CREATE', 'VIEWER')).toBe(false);
    expect(canWriteInProject(member, 'TASKS_CREATE', null)).toBe(false);
    expect(canWriteInProject(makeCan([]), 'TASKS_CREATE', 'MANAGER')).toBe(false);

    const override = makeCan(['TASKS_CREATE', 'PROJECTS_VIEW_ALL']);
    expect(canWriteInProject(override, 'TASKS_CREATE', null)).toBe(true);
    // Viewing everything alone never grants a write.
    expect(canWriteInProject(makeCan(['PROJECTS_VIEW_ALL']), 'TASKS_CREATE', null)).toBe(false);
  });

  it('reserves manager actions to MANAGER or the override', () => {
    const can = makeCan(['TASKS_DELETE']);
    expect(canManageInProject(can, 'TASKS_DELETE', 'MANAGER')).toBe(true);
    expect(canManageInProject(can, 'TASKS_DELETE', 'MEMBER')).toBe(false);
    expect(canManageInProject(makeCan(['TASKS_DELETE', 'PROJECTS_VIEW_ALL']), 'TASKS_DELETE', null)).toBe(true);
  });
});

describe('task actions', () => {
  const task = { createdById: 'me', assignees: [{ userId: 'me' } as never] };
  const held = makeCan(['TASKS_CREATE', 'TASKS_UPDATE', 'TASKS_COMPLETE', 'TASKS_DELETE']);

  it('lets a MEMBER touch only their own tasks', () => {
    expect(canEditTask(task, 'me', held, 'MEMBER')).toBe(true);
    expect(canEditTask(task, 'someone-else', held, 'MEMBER')).toBe(false);
    expect(canCompleteTask(task, 'me', held, 'MEMBER')).toBe(true);
    expect(canCompleteTask(task, 'someone-else', held, 'MEMBER')).toBe(false);
    expect(canReopenTask(held, 'MEMBER')).toBe(false);
    expect(canDeleteTask(held, 'MEMBER')).toBe(false);
  });

  it('never shows write actions to a VIEWER, even for tasks they created', () => {
    expect(canEditTask(task, 'me', held, 'VIEWER')).toBe(false);
    expect(canCompleteTask(task, 'me', held, 'VIEWER')).toBe(false);
    expect(canCreateTask(held, 'VIEWER')).toBe(false);
  });

  it('lets a MANAGER act on any task, but only with the matching permission', () => {
    expect(canEditTask(task, 'other', held, 'MANAGER')).toBe(true);
    expect(canDeleteTask(held, 'MANAGER')).toBe(true);
    expect(canDeleteTask(makeCan(['TASKS_UPDATE']), 'MANAGER')).toBe(false);
  });

  it('supports an administrator with the organization-wide override and no membership', () => {
    const admin = makeCan(['PROJECTS_VIEW_ALL', 'TASKS_UPDATE', 'TASKS_DELETE', 'TASKS_COMPLETE']);
    expect(canEditTask(task, 'admin', admin, null)).toBe(true);
    expect(canReopenTask(admin, null)).toBe(true);
    expect(canDeleteTask(admin, null)).toBe(true);
  });
});

describe('main navigation', () => {
  it('hides the dashboard entry without DASHBOARD_VIEW but keeps the rest', () => {
    const items = visibleMainItems(makeCan(['PROJECTS_VIEW_ASSIGNED'])).map((item) => item.to);
    expect(items).toEqual(['/schedule', '/projects', '/team']);
  });

  it('shows the dashboard to someone holding DASHBOARD_VIEW', () => {
    expect(visibleMainItems(makeCan(['DASHBOARD_VIEW'])).map((item) => item.to)).toContain('/');
  });
});
