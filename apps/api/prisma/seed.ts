/**
 * Idempotent seed entry point: bootstraps the Organization Owner from
 * OWNER_* env vars (docs/DEPLOYMENT.md, docs/RBAC.md "Owner") and seeds the
 * fixed RBAC permission catalog (docs/RBAC.md "Catálogo inicial de
 * permisos"). The catalog is managed by code, not the UI — see RBAC.md.
 */
import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const PERMISSION_CATALOG: Array<{ key: string; description: string }> = [
  { key: 'DASHBOARD_VIEW', description: 'View your own dashboard.' },
  {
    key: 'PROJECTS_VIEW_ASSIGNED',
    description: 'View projects you have active membership in.',
  },
  {
    key: 'PROJECTS_VIEW_ALL',
    description: 'View all projects in the organization.',
  },
  { key: 'PROJECTS_CREATE', description: 'Create projects.' },
  {
    key: 'PROJECTS_UPDATE',
    description: 'Edit data and status of authorized projects.',
  },
  {
    key: 'PROJECTS_DELETE',
    description: 'Logically delete (deactivate) authorized projects.',
  },
  {
    key: 'PROJECT_MEMBERS_MANAGE',
    description:
      'Add, change the role of, or remove project members where scope allows.',
  },
  { key: 'TASKS_CREATE', description: 'Create tasks in authorized projects.' },
  {
    key: 'TASKS_UPDATE',
    description: 'Edit content, dates, assignees, or reopen authorized tasks.',
  },
  { key: 'TASKS_DELETE', description: 'Logically delete authorized tasks.' },
  { key: 'TASKS_COMPLETE', description: 'Mark tasks as completed.' },
  { key: 'MEETINGS_CREATE', description: 'Create meetings.' },
  {
    key: 'MEETINGS_UPDATE',
    description: 'Edit meetings, participants, or notes within allowed scope.',
  },
  { key: 'MEETINGS_DELETE', description: 'Logically delete meetings.' },
  { key: 'DOCUMENTS_UPLOAD', description: 'Upload documents.' },
  {
    key: 'DOCUMENTS_DELETE',
    description: 'Delete documents according to scope.',
  },
  {
    key: 'USERS_VIEW',
    description: 'List and view administrative user profiles.',
  },
  {
    key: 'USERS_CREATE',
    description: 'Create, resend, or revoke user invitations.',
  },
  {
    key: 'USERS_UPDATE',
    description:
      'Edit user data, suspend, reactivate, or disable within administrative protections.',
  },
  { key: 'USERS_DISABLE', description: 'Suspend or disable users.' },
  { key: 'USERS_ROLES_MANAGE', description: 'Assign or remove allowed roles.' },
  { key: 'ROLES_VIEW', description: 'List roles and their permissions.' },
  {
    key: 'ROLES_MANAGE',
    description:
      'Create, edit, and delete configurable roles and change their permissions.',
  },
  { key: 'AUDIT_VIEW', description: 'View the administrative audit log.' },
];

async function seedPermissionCatalog(prisma: PrismaClient): Promise<void> {
  for (const permission of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: permission,
    });
  }
  console.log(`Permission catalog seeded (${PERMISSION_CATALOG.length} keys).`);
}

async function bootstrapOwner(prisma: PrismaClient): Promise<void> {
  const existingOwner = await prisma.user.findFirst({
    where: { isOwner: true },
  });
  if (existingOwner) {
    console.log(
      `Owner already exists (${existingOwner.id}); skipping bootstrap.`,
    );
    return;
  }

  const { OWNER_EMAIL, OWNER_PASSWORD, OWNER_FIRST_NAME, OWNER_LAST_NAME } =
    process.env;
  if (
    !OWNER_EMAIL ||
    !OWNER_PASSWORD ||
    !OWNER_FIRST_NAME ||
    !OWNER_LAST_NAME
  ) {
    console.warn(
      'OWNER_EMAIL/OWNER_PASSWORD/OWNER_FIRST_NAME/OWNER_LAST_NAME are not all set; skipping Owner bootstrap.',
    );
    return;
  }

  // Same 12–256 bounds as ChangePasswordDto — a max keeps a pathologically
  // large value from reaching Argon2 at all, not just at runtime.
  if (OWNER_PASSWORD.length < 12 || OWNER_PASSWORD.length > 256) {
    throw new Error(
      'OWNER_PASSWORD must be 12-256 characters (see docs/SECURITY.md).',
    );
  }

  const passwordHash = await argon2.hash(OWNER_PASSWORD, {
    type: argon2.argon2id,
  });
  const owner = await prisma.user.create({
    data: {
      email: normalizeEmail(OWNER_EMAIL),
      passwordHash,
      firstName: OWNER_FIRST_NAME,
      lastName: OWNER_LAST_NAME,
      status: 'ACTIVE',
      isOwner: true,
    },
  });

  // Never log the password — only confirmation that bootstrap succeeded.
  console.log(
    `Owner bootstrapped: ${owner.id} (${owner.email}). Rotate OWNER_PASSWORD after first login.`,
  );
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    await seedPermissionCatalog(prisma);
    await bootstrapOwner(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
