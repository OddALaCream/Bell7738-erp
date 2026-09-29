import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

const OFFSETS = [1440, 60] as const;
const POLL_MS = 30_000;

/** Must run in the same transaction as the meeting mutation. */
export async function recalculateMeetingReminders(
  tx: Prisma.TransactionClient,
  meetingId: string,
  startsAt: Date,
  now = new Date(),
): Promise<void> {
  const futureOffsets = OFFSETS.filter(
    (offset) => startsAt.getTime() - offset * 60_000 > now.getTime(),
  );
  await tx.meetingReminder.deleteMany({
    where: {
      meetingId,
      deliveredAt: null,
      offsetMinutes: { notIn: [...futureOffsets] },
    },
  });
  for (const offsetMinutes of futureOffsets) {
    const scheduledFor = new Date(startsAt.getTime() - offsetMinutes * 60_000);
    const existing = await tx.meetingReminder.findUnique({
      where: { meetingId_offsetMinutes: { meetingId, offsetMinutes } },
    });
    // Participant/description changes do not resend a reminder already delivered.
    if (existing?.scheduledFor.getTime() === scheduledFor.getTime()) continue;
    await tx.meetingReminder.upsert({
      where: { meetingId_offsetMinutes: { meetingId, offsetMinutes } },
      create: { meetingId, offsetMinutes, scheduledFor },
      update: { scheduledFor, deliveredAt: null },
    });
  }
}

/** PostgreSQL owns pending work; the process timer only wakes the single V1 API. */
@Injectable()
export class MeetingRemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MeetingRemindersService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = this.deliverDue()
        .catch(() => {
          this.logger.error(
            'Meeting reminder delivery failed; pending work will be retried.',
          );
        })
        .finally(() => {
          this.running = undefined;
        });
    }, POLL_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  async deliverDue(now = new Date()): Promise<void> {
    const due = await this.prisma.meetingReminder.findMany({
      where: { deliveredAt: null, scheduledFor: { lte: now } },
      select: { id: true, meetingId: true },
      orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    for (const candidate of due) {
      await this.prisma.$transaction(async (tx) => {
        // Same lock order as meeting mutations: meeting, then reminder.
        // A reschedule or delete cannot interleave with notification delivery.
        await tx.$queryRaw`SELECT "id" FROM "meetings" WHERE "id" = ${candidate.meetingId}::uuid FOR UPDATE`;
        const reminder = await tx.meetingReminder.findFirst({
          where: {
            id: candidate.id,
            deliveredAt: null,
            scheduledFor: { lte: now },
          },
          include: { meeting: { include: { project: true } } },
        });
        if (!reminder) return;
        const meeting = reminder.meeting;
        if (
          meeting.deletedAt ||
          meeting.project.deletedAt ||
          meeting.startsAt <= now
        ) {
          await tx.meetingReminder.delete({ where: { id: reminder.id } });
          return;
        }
        const recipients = await tx.meetingParticipant.findMany({
          where: {
            meetingId: meeting.id,
            user: {
              status: 'ACTIVE',
              OR: [
                { isOwner: true },
                {
                  userRoles: {
                    some: {
                      role: {
                        rolePermissions: {
                          some: { permission: { key: 'PROJECTS_VIEW_ALL' } },
                        },
                      },
                    },
                  },
                },
                {
                  projectMemberships: {
                    some: { projectId: meeting.projectId, removedAt: null },
                  },
                  userRoles: {
                    some: {
                      role: {
                        rolePermissions: {
                          some: {
                            permission: { key: 'PROJECTS_VIEW_ASSIGNED' },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
          select: { userId: true },
        });
        await tx.notification.createMany({
          data: recipients.map(({ userId }) => ({
            userId,
            type:
              reminder.offsetMinutes === 1440
                ? ('MEETING_REMINDER_24H' as const)
                : ('MEETING_REMINDER_1H' as const),
            projectId: meeting.projectId,
            meetingId: meeting.id,
            dedupeKey: `meeting-reminder:${reminder.id}:${reminder.scheduledFor.toISOString()}:${userId}`,
          })),
          skipDuplicates: true,
        });
        await tx.meetingReminder.update({
          where: { id: reminder.id },
          data: { deliveredAt: now },
        });
      });
    }
  }
}
