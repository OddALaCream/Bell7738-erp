---
name: release-check
description: Assess release readiness before a deployment by checking code quality, build artifacts, configuration, data safety, and deployment documentation.
---

# Check a release

Verify at minimum:

- lint, typecheck, tests, and build;
- Docker configuration and healthcheck behavior;
- required environment variables and that secrets are not versioned;
- pending database migrations and backup needs;
- persistent-file handling; and
- `docs/DEPLOYMENT.md` accuracy.

Report failures and unresolved risks. Do not deploy automatically, run `git push`, or access or modify the VPS. Only verify and prepare unless a later explicit instruction authorizes more.
