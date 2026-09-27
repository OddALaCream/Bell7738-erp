---
name: auth-rbac
description: Change authentication, sessions, JWTs, refresh tokens, cookies, users, roles, permissions, authorization, or project membership safely.
---

# Change authentication or RBAC

Read `docs/SECURITY.md` and `docs/RBAC.md` before changing this area.

- Enforce real authorization in the backend; frontend checks are UX only.
- Never trust client-supplied IDs. Verify both resource existence and the caller's access to prevent IDOR.
- Apply least privilege and review every change for privilege-escalation paths.
- Never log passwords, tokens, cookies, or secrets. Store refresh tokens only as hashes and support session revocation.
- Ensure suspended or disabled users lose access, including existing sessions.
- Protect the Owner role from invalid administrative operations.
- Add tests for both allowed and denied scenarios, then run project verification.
