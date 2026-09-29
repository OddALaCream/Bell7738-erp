import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  MeetingRemindersService,
  recalculateMeetingReminders,
} from '../../src/meetings/meeting-reminders.service.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const worker = () =>
  new MeetingRemindersService(prisma as unknown as PrismaService);
const createdAt = new Date('2030-01-01T00:00:00Z');
const startsAt = new Date('2030-01-03T12:00:00Z');
const due24 = new Date('2030-01-02T12:00:01Z');
const due1 = new Date('2030-01-03T11:00:01Z');
let projectId: string;
let meetingId: string;
let recipientId: string;
let roleId: string;
const userIds: string[] = [];

beforeAll(async () => {
  const role = await prisma.role.create({
    data: {
      name: `reminder-${randomUUID()}`,
      color: '#336699',
      position: 1,
      rolePermissions: {
        create: { permission: { connect: { key: 'PROJECTS_VIEW_ASSIGNED' } } },
      },
    },
  });
  roleId = role.id;
  for (let i = 0; i < 4; i++) {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        firstName: 'Reminder',
        lastName: 'QA',
        status: i === 2 ? 'SUSPENDED' : 'ACTIVE',
        passwordHash: 'hash',
        ...(i === 3 ? {} : { userRoles: { create: { roleId } } }),
      },
    });
    userIds.push(user.id);
  }
  recipientId = userIds[0]!;
  const project = await prisma.project.create({
    data: {
      name: 'Reminder QA',
      status: 'ACTIVE',
      createdById: recipientId,
      members: {
        create: userIds.map((userId, i) => ({
          userId,
          role: 'MEMBER',
          addedById: recipientId,
          removedAt: i === 1 ? new Date() : null,
        })),
      },
    },
  });
  projectId = project.id;
});

beforeEach(async () => {
  const meeting = await prisma.meeting.create({
    data: {
      projectId,
      title: 'Persistent reminder',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3600000),
      organizerId: recipientId,
      participants: {
        create: userIds.map((userId) => ({ userId, addedById: recipientId })),
      },
    },
  });
  meetingId = meeting.id;
  await prisma.$transaction((tx) =>
    recalculateMeetingReminders(tx, meetingId, startsAt, createdAt),
  );
});

afterEach(async () => {
  if (!meetingId) return;
  await prisma.notification.deleteMany({ where: { meetingId } });
  await prisma.meetingReminder.deleteMany({ where: { meetingId } });
  await prisma.meetingParticipant.deleteMany({ where: { meetingId } });
  await prisma.meeting.delete({ where: { id: meetingId } });
});

afterAll(async () => {
  if (projectId) {
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
  }
  if (roleId) {
    await prisma.userRole.deleteMany({ where: { roleId } });
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    await prisma.role.delete({ where: { id: roleId } });
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('Persistent meeting reminders (PostgreSQL)', () => {
  it('persists both offsets and delivers only when due, including after restart', async () => {
    expect(await prisma.meetingReminder.count({ where: { meetingId } })).toBe(
      2,
    );
    await worker().deliverDue(createdAt);
    expect(await prisma.notification.count({ where: { meetingId } })).toBe(0);
    await worker().deliverDue(due24);
    await worker().deliverDue(due1); // new process instance, same durable data
    const notifications = await prisma.notification.findMany({
      where: { meetingId },
      orderBy: { type: 'asc' },
    });
    expect(notifications.map((n) => n.type).sort()).toEqual([
      'MEETING_REMINDER_1H',
      'MEETING_REMINDER_24H',
    ]);
    expect(notifications.every((n) => n.userId === recipientId)).toBe(true);
    expect(
      await prisma.meetingReminder.count({
        where: { meetingId, deliveredAt: null },
      }),
    ).toBe(0);
  });

  it('does not duplicate deliveries on retries or overlapping polls', async () => {
    await Promise.all([worker().deliverDue(due1), worker().deliverDue(due1)]);
    await worker().deliverDue(due1);
    expect(await prisma.notification.count({ where: { meetingId } })).toBe(2);
  });

  it('rolls back notification writes if the process fails before marking delivery', async () => {
    const failingClient = prisma.$extends({
      query: {
        meetingReminder: {
          update() {
            throw new Error('simulated crash after notification insert');
          },
        },
      },
    });
    const failingWorker = new MeetingRemindersService(
      failingClient as unknown as PrismaService,
    );
    await expect(failingWorker.deliverDue(due24)).rejects.toThrow(
      /simulated crash/,
    );
    expect(await prisma.notification.count({ where: { meetingId } })).toBe(0);
    expect(
      await prisma.meetingReminder.count({
        where: { meetingId, deliveredAt: null },
      }),
    ).toBe(2);
    await worker().deliverDue(due24);
    expect(await prisma.notification.count({ where: { meetingId } })).toBe(1);
  });

  it('recalculates a moved meeting and does not resend unchanged delivered offsets', async () => {
    await worker().deliverDue(due24);
    await prisma.$transaction((tx) =>
      recalculateMeetingReminders(tx, meetingId, startsAt, due24),
    );
    await worker().deliverDue(due24);
    expect(await prisma.notification.count({ where: { meetingId } })).toBe(1);
    const later = new Date('2030-01-05T12:00:00Z');
    await prisma.$transaction(async (tx) => {
      await tx.meeting.update({
        where: { id: meetingId },
        data: { startsAt: later, endsAt: new Date(later.getTime() + 3600000) },
      });
      await recalculateMeetingReminders(tx, meetingId, later, due24);
    });
    await worker().deliverDue(due1);
    expect(await prisma.notification.count({ where: { meetingId } })).toBe(1);
    await worker().deliverDue(new Date('2030-01-04T12:00:01Z'));
    expect(await prisma.notification.count({ where: { meetingId } })).toBe(2);
  });

  it('never sends retroactive reminders for a meeting created less than an hour before start', async () => {
    await prisma.meetingReminder.deleteMany({ where: { meetingId } });
    await prisma.$transaction((tx) =>
      recalculateMeetingReminders(
        tx,
        meetingId,
        startsAt,
        new Date('2030-01-03T11:30:00Z'),
      ),
    );
    expect(await prisma.meetingReminder.count({ where: { meetingId } })).toBe(
      0,
    );
  });

  it('cancels stale pending work when a meeting is deleted', async () => {
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { deletedAt: new Date() },
    });
    await worker().deliverDue(due1);
    expect(await prisma.notification.count({ where: { meetingId } })).toBe(0);
    expect(await prisma.meetingReminder.count({ where: { meetingId } })).toBe(
      0,
    );
  });

  it('does not send reminders for a deleted project or a meeting already started during downtime', async () => {
    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });
    try {
      await worker().deliverDue(due1);
    } finally {
      await prisma.project.update({
        where: { id: projectId },
        data: { deletedAt: null },
      });
    }
    expect(await prisma.notification.count({ where: { meetingId } })).toBe(0);
    await prisma.$transaction((tx) =>
      recalculateMeetingReminders(tx, meetingId, startsAt, createdAt),
    );
    await worker().deliverDue(new Date('2030-01-03T12:30:00Z'));
    expect(await prisma.notification.count({ where: { meetingId } })).toBe(0);
  });
});
