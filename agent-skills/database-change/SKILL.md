---
name: database-change
description: Change the PostgreSQL or Prisma data model safely when schema, relations, constraints, indexes, or migrations are involved.
---

# Change the database

- Inspect the existing Prisma schema, migrations, and relevant database documentation before editing.
- Preserve existing data and use migrations. Never use `prisma db push` as a substitute for production migrations.
- Analyze destructive operations and avoid irreversible changes without an explicit migration and recovery strategy.
- Review relations, foreign keys, unique constraints, indexes, nullability, and application validation.
- Update `docs/DATABASE.md` when the model changes.
- Run related tests and the project verification; do not report completion if either fails.
