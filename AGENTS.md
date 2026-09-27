# Project

Internal ERP for a small software-development company.

## Target stack

- TypeScript strict
- React + Vite
- NestJS
- Prisma
- PostgreSQL
- pnpm workspaces
- Docker Compose

The application scaffold may not exist yet.

## Repository structure

- apps/api: backend
- apps/web: frontend
- packages/shared: shared contracts/utilities
- docs: product and architecture documentation
- agent-skills: canonical shared Agent Skills

## Source of truth

- Business rules belong in the backend.
- PostgreSQL will be the source of truth.
- Frontend authorization is UX only.
- Backend authorization is mandatory.
- Read only the relevant documentation before implementing a feature.

## Documentation

Use the relevant files under `docs/`.

Do not load every document unnecessarily.

Use Context7 when current framework or library behavior needs verification.

## Required verification

Once the application scaffold provides it, prefer:

`pnpm verify`

Do not report a code change as complete if verification fails.

## Git

- Never run git push unless explicitly requested.
- Never rewrite Git history unless explicitly requested.
- Do not modify unrelated files.
- Never commit secrets.

## Engineering

- Keep TypeScript strict.
- Do not use `any` merely to hide type errors.
- Do not disable tests to make them pass.
- Prefer small coherent changes.
- Avoid unnecessary dependencies.
- Do not introduce microservices without an explicit architectural decision.

## Agent collaboration

- Claude may delegate independent investigation or review to Codex.
- Do not let two writing agents modify the same files simultaneously.
- Reviews from another agent should be read-only unless implementation was explicitly delegated.
- For parallel writing, use isolated Git worktrees.
