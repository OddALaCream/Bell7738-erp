/**
 * Idempotent seed entry point. Populated in later phases (RBAC catalog,
 * Owner bootstrap). Intentionally a no-op until there are models to seed.
 */
async function main(): Promise<void> {
  console.log('No seed data defined yet.');
}

await main();
