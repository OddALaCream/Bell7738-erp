/**
 * Idempotent seed entry point. Currently bootstraps the Organization Owner
 * from OWNER_* env vars (docs/DEPLOYMENT.md, docs/RBAC.md "Owner"). The RBAC
 * permission catalog is seeded starting in Phase 6.
 */
import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
    await bootstrapOwner(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
