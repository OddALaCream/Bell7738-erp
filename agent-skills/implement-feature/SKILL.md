---
name: implement-feature
description: Implement an ERP feature through small source-aware changes, including relevant backend rules, validation, documentation, and tests.
---

# Implement a feature

1. Inspect the existing code before changing it and read only the relevant files under `docs/`.
2. Identify the affected backend, frontend, shared-contract, database, and test modules.
3. When behavior depends on current framework or library APIs, verify it with Context7.
4. Make the smallest coherent change. Keep business rules and authorization enforcement in the backend, and do not modify unrelated files.
5. Keep TypeScript strict; never use `any` merely to hide errors.
6. Add or update tests and documentation when the behavior or contract changes.
7. Run the project verification and fix root causes without disabling tests.
8. Review the final diff before reporting completion.

Do not run `git push`, introduce microservices, or add dependencies without a clear need.
