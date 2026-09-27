import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * docs/SECURITY.md: Argon2id, unique salt per hash (argon2's default),
 * parameters embedded in the encoded hash. No composition rules beyond
 * length are enforced here — that lives in the DTO.
 */
@Injectable()
export class PasswordService {
  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, { type: argon2.argon2id });
  }

  async verify(hash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainPassword);
    } catch {
      // Malformed/foreign hash format — treat as a non-match, not a crash.
      return false;
    }
  }
}
