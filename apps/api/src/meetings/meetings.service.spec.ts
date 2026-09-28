import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MeetingsService } from './meetings.service.js';
import { MeetingNotesRevisionConflictException } from './meeting.exceptions.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EffectivePermissionsService } from '../rbac/effective-permissions.service.js';
import type { ProjectAccessService } from '../projects/project-access.service.js';
import type { AuthenticatedUser } from '../auth/types.js';

const owner: AuthenticatedUser = {
  id: 'owner-1',
  email: 'owner@example.com',
  isOwner: true,
  sessionId: 's1',
};
const actor: AuthenticatedUser = {
  id: 'actor-1',
  email: 'actor@example.com',
  isOwner: false,
  sessionId: 's2',
};

const baseMeeting = {
  id: 'meeting-1',
  projectId: 'proj-1',
  title: 'Sync',
  description: null,
  startsAt: new Date('2026-01-01T10:00:00Z'),
  endsAt: new Date('2026-01-01T11:00:00Z'),
  organizerId: 'organizer-1',
  notes: null,
  revision: 1,
  notesUpdatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  participants: [] as Array<{ userId: string; addedAt: Date; user: unknown }>,
};

function makeService(overrides?: {
  effectiveKeys?: Set<string>;
  membership?: { role: 'MANAGER' | 'MEMBER' | 'VIEWER' } | null;
  hasMemberLevelAccess?: boolean;
  meeting?: unknown;
  activeUsers?: Array<{ id: string }>;
  activeMembers?: Array<{ userId: string }>;
  updateManyCount?: number;
}) {
  const meetingCreate = vi.fn().mockResolvedValue({ id: 'meeting-1' });
  const meetingParticipantCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const meetingParticipantDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const txProjectQueryRaw = vi.fn().mockResolvedValue([{ deletedAt: null }]);
  const txMeetingFindFirst = vi
    .fn()
    .mockResolvedValue(
      overrides?.meeting !== undefined ? overrides.meeting : baseMeeting,
    );
  const txMeetingFindUniqueOrThrow = vi
    .fn()
    .mockResolvedValue(
      overrides?.meeting !== undefined ? overrides.meeting : baseMeeting,
    );

  const tx = {
    $queryRaw: txProjectQueryRaw,
    meeting: {
      create: meetingCreate,
      findFirst: txMeetingFindFirst,
      findUniqueOrThrow: txMeetingFindUniqueOrThrow,
    },
    meetingParticipant: {
      createMany: meetingParticipantCreateMany,
      deleteMany: meetingParticipantDeleteMany,
    },
  };

  const prisma = {
    meeting: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides?.meeting !== undefined ? overrides.meeting : baseMeeting,
        ),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue(
          overrides?.meeting !== undefined ? overrides.meeting : baseMeeting,
        ),
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: overrides?.updateManyCount ?? 1 }),
    },
    user: {
      findMany: vi
        .fn()
        .mockResolvedValue(overrides?.activeUsers ?? [{ id: 'participant-1' }]),
    },
    projectMember: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          overrides?.activeMembers ?? [{ userId: 'participant-1' }],
        ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as PrismaService;

  const effectivePermissions = {
    getEffectivePermissionKeys: vi
      .fn()
      .mockResolvedValue(overrides?.effectiveKeys ?? new Set<string>()),
  } as unknown as EffectivePermissionsService;

  const access = {
    assertCanViewProject: vi.fn().mockResolvedValue({ id: 'proj-1' }),
    getActiveMembership: vi
      .fn()
      .mockResolvedValue(
        overrides?.membership !== undefined ? overrides.membership : null,
      ),
    canManageProject: vi.fn().mockResolvedValue(true),
    hasMemberLevelAccess: vi
      .fn()
      .mockResolvedValue(overrides?.hasMemberLevelAccess ?? true),
  } as unknown as ProjectAccessService;

  return {
    service: new MeetingsService(prisma, effectivePermissions, access),
    prisma,
    access,
    effectivePermissions,
    tx,
  };
}

const createDto = {
  title: 'New meeting',
  startsAt: '2026-01-01T10:00:00Z',
  endsAt: '2026-01-01T11:00:00Z',
  participantIds: ['participant-1'],
};

describe('MeetingsService.create', () => {
  it('rejects when the actor lacks member-level access (MEETINGS_CREATE + MEMBER/MANAGER/override)', async () => {
    const { service } = makeService({ hasMemberLevelAccess: false });
    await expect(
      service.create('proj-1', createDto, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an endsAt at or before startsAt', async () => {
    const { service } = makeService();
    await expect(
      service.create(
        'proj-1',
        {
          ...createDto,
          startsAt: '2026-01-01T11:00:00Z',
          endsAt: '2026-01-01T10:00:00Z',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a participant who is not an active user or current project member', async () => {
    const { service } = makeService({ activeUsers: [] });
    await expect(
      service.create('proj-1', createDto, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('always includes the organizer as a participant even if omitted from the body', async () => {
    const { service, tx } = makeService({ activeUsers: [], activeMembers: [] });
    await service.create('proj-1', { ...createDto, participantIds: [] }, actor);
    expect(tx.meetingParticipant.createMany).toHaveBeenCalledWith({
      data: [{ meetingId: 'meeting-1', userId: actor.id, addedById: actor.id }],
    });
  });

  it('does not require the organizer to be a validated participant even if self-listed', async () => {
    const { service, tx } = makeService({ activeUsers: [], activeMembers: [] });
    await service.create(
      'proj-1',
      { ...createDto, participantIds: [actor.id] },
      actor,
    );
    expect(tx.meetingParticipant.createMany).toHaveBeenCalledWith({
      data: [{ meetingId: 'meeting-1', userId: actor.id, addedById: actor.id }],
    });
  });

  it('creates the meeting and its participants transactionally', async () => {
    const { service, prisma, tx } = makeService();
    await service.create('proj-1', createDto, actor);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.meetingParticipant.createMany).toHaveBeenCalledWith({
      data: [
        { meetingId: 'meeting-1', userId: actor.id, addedById: actor.id },
        {
          meetingId: 'meeting-1',
          userId: 'participant-1',
          addedById: actor.id,
        },
      ],
    });
  });

  it('allows the Owner unconditionally', async () => {
    const { service } = makeService();
    await expect(
      service.create('proj-1', createDto, owner),
    ).resolves.toBeDefined();
  });
});

describe('MeetingsService.update', () => {
  const dto = { title: 'Renamed' };

  it('rejects a non-organizer, non-manager actor without override', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['MEETINGS_UPDATE']),
      membership: { role: 'MEMBER' },
    });
    await expect(
      service.update('proj-1', 'meeting-1', dto, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the organizer with MEETINGS_UPDATE', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['MEETINGS_UPDATE']),
      meeting: { ...baseMeeting, organizerId: actor.id },
    });
    await expect(
      service.update('proj-1', 'meeting-1', dto, actor),
    ).resolves.toBeDefined();
  });

  it('allows a MANAGER with MEETINGS_UPDATE even if not the organizer', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['MEETINGS_UPDATE']),
      membership: { role: 'MANAGER' },
    });
    await expect(
      service.update('proj-1', 'meeting-1', dto, actor),
    ).resolves.toBeDefined();
  });

  it('rejects an endsAt/startsAt merge that becomes invalid', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['MEETINGS_UPDATE']),
      meeting: {
        ...baseMeeting,
        organizerId: actor.id,
        endsAt: new Date('2026-01-01T11:00:00Z'),
      },
    });
    await expect(
      service.update(
        'proj-1',
        'meeting-1',
        { startsAt: '2026-01-01T12:00:00Z' },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('conditions the write on the project also still being non-deleted', async () => {
    const { service, prisma } = makeService({
      effectiveKeys: new Set(['MEETINGS_UPDATE']),
      meeting: { ...baseMeeting, organizerId: actor.id },
    });
    await service.update('proj-1', 'meeting-1', dto, actor);
    expect(prisma.meeting.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ project: { deletedAt: null } }),
      }),
    );
  });

  it('404s if the meeting was deleted concurrently', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['MEETINGS_UPDATE']),
      meeting: { ...baseMeeting, organizerId: actor.id },
      updateManyCount: 0,
    });
    await expect(
      service.update('proj-1', 'meeting-1', dto, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MeetingsService.setParticipants', () => {
  const dto = { participantIds: ['participant-1'] };

  it('rejects a non-organizer, non-manager actor without override', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['MEETINGS_UPDATE']),
      membership: { role: 'MEMBER' },
    });
    await expect(
      service.setParticipants('proj-1', 'meeting-1', dto, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an invalid participant set', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['MEETINGS_UPDATE']),
      meeting: { ...baseMeeting, organizerId: actor.id },
      activeMembers: [],
    });
    await expect(
      service.setParticipants('proj-1', 'meeting-1', dto, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('always keeps the organizer in the replaced set, even if omitted from the body', async () => {
    const { service, tx } = makeService({
      effectiveKeys: new Set(['MEETINGS_UPDATE']),
      membership: { role: 'MANAGER' },
      meeting: { ...baseMeeting, organizerId: 'organizer-1' },
    });
    await service.setParticipants(
      'proj-1',
      'meeting-1',
      { participantIds: [] },
      actor,
    );
    expect(tx.meetingParticipant.createMany).toHaveBeenCalledWith({
      data: [
        { meetingId: 'meeting-1', userId: 'organizer-1', addedById: actor.id },
      ],
    });
  });
});

describe('MeetingsService.updateNotes', () => {
  const dto = { notes: { text: 'hello' }, expectedRevision: 1 };

  it('rejects a non-participant, non-manager actor without override', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['MEETINGS_UPDATE']),
      membership: { role: 'MEMBER' },
    });
    await expect(
      service.updateNotes('proj-1', 'meeting-1', dto, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a participant with MEETINGS_UPDATE', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['MEETINGS_UPDATE']),
      meeting: {
        ...baseMeeting,
        participants: [{ userId: actor.id, addedAt: new Date(), user: {} }],
      },
    });
    await expect(
      service.updateNotes('proj-1', 'meeting-1', dto, actor),
    ).resolves.toBeDefined();
  });

  it('allows a MANAGER with MEETINGS_UPDATE even if not a participant', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['MEETINGS_UPDATE']),
      membership: { role: 'MANAGER' },
    });
    await expect(
      service.updateNotes('proj-1', 'meeting-1', dto, actor),
    ).resolves.toBeDefined();
  });

  it('returns 409 REVISION_CONFLICT with the current revision when the expected revision is stale', async () => {
    const { service, prisma } = makeService({
      effectiveKeys: new Set(['MEETINGS_UPDATE']),
      membership: { role: 'MANAGER' },
      updateManyCount: 0,
    });
    // First call is getMeetingOrThrow's fetch; second is the post-conflict
    // "what's the current revision" lookup — these must not be conflated.
    (prisma.meeting.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(baseMeeting)
      .mockResolvedValueOnce({
        revision: 5,
        notesUpdatedAt: new Date('2026-02-01'),
      });
    const rejection = await service
      .updateNotes('proj-1', 'meeting-1', dto, actor)
      .catch((error: unknown) => error);
    expect(rejection).toBeInstanceOf(MeetingNotesRevisionConflictException);
    expect(
      (rejection as MeetingNotesRevisionConflictException).getResponse(),
    ).toMatchObject({
      error: { code: 'REVISION_CONFLICT', currentRevision: 5 },
    });
  });

  it('404s on a revision conflict against a since-deleted meeting', async () => {
    const { service, prisma } = makeService({
      effectiveKeys: new Set(['MEETINGS_UPDATE']),
      membership: { role: 'MANAGER' },
      updateManyCount: 0,
    });
    (prisma.meeting.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(baseMeeting)
      .mockResolvedValueOnce(null);
    await expect(
      service.updateNotes('proj-1', 'meeting-1', dto, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('increments the revision and stamps notesUpdatedById on success', async () => {
    const { service, prisma } = makeService({
      effectiveKeys: new Set(['MEETINGS_UPDATE']),
      membership: { role: 'MANAGER' },
    });
    await service.updateNotes('proj-1', 'meeting-1', dto, actor);
    expect(prisma.meeting.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revision: 1 }),
        data: expect.objectContaining({
          revision: { increment: 1 },
          notesUpdatedById: actor.id,
        }),
      }),
    );
  });
});

describe('MeetingsService.delete', () => {
  it('rejects a non-organizer, non-manager actor without override', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['MEETINGS_DELETE']),
      membership: { role: 'MEMBER' },
    });
    await expect(
      service.delete('proj-1', 'meeting-1', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('soft-deletes via a conditional updateMany scoped to the live project', async () => {
    const { service, prisma } = makeService({
      effectiveKeys: new Set(['MEETINGS_DELETE']),
      meeting: { ...baseMeeting, organizerId: actor.id },
    });
    await service.delete('proj-1', 'meeting-1', actor);
    expect(prisma.meeting.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'meeting-1',
        projectId: 'proj-1',
        deletedAt: null,
        project: { deletedAt: null },
      },
      data: { deletedAt: expect.any(Date), deletedById: actor.id },
    });
  });

  it('404s if already deleted concurrently', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['MEETINGS_DELETE']),
      meeting: { ...baseMeeting, organizerId: actor.id },
      updateManyCount: 0,
    });
    await expect(
      service.delete('proj-1', 'meeting-1', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MeetingsService.list', () => {
  const baseListQuery = {
    page: 1,
    pageSize: 25,
    sort: 'startsAt' as const,
    order: 'asc' as const,
  };

  it('requires visibility of the project before listing', async () => {
    const { service, access } = makeService();
    await service.list('proj-1', baseListQuery, actor);
    expect(access.assertCanViewProject).toHaveBeenCalledWith(actor, 'proj-1');
  });

  it('filters to upcoming meetings when view=upcoming', async () => {
    const { service, prisma } = makeService();
    await service.list('proj-1', { ...baseListQuery, view: 'upcoming' }, actor);
    expect(prisma.meeting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ startsAt: { gte: expect.any(Date) } }),
      }),
    );
  });
});
