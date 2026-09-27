---
name: verify-change
description: Verify code changes deterministically after implementation and before reporting them complete.
---

# Verify a change

Once the scaffold provides it, prefer:

```powershell
pnpm verify
```

If that command does not exist yet, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify.ps1
```

Stop on any failed check and repair the root cause. Do not hide errors, disable tests, or declare success while a check fails. After all checks pass, review the diff for unintended changes. Do not run destructive commands during verification.
