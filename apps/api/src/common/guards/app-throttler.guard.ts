import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { normalizeEmail } from '../normalize-email.js';

/**
 * docs/SECURITY.md: "Los límites por IP se combinan con email o sesión
 * cuando sea útil y no se usan como única defensa." Requests that carry an
 * `email` in the body (login) are throttled per IP+email, so a distributed
 * attacker still can't brute-force a single account past the limit just by
 * rotating source IPs; everything else falls back to plain per-IP tracking.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const body = req.body as { email?: unknown } | undefined;
    if (typeof body?.email === 'string') {
      return `${req.ip}:${normalizeEmail(body.email)}`;
    }
    return String(req.ip);
  }
}
