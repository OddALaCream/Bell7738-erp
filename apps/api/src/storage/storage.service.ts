import { createReadStream } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';

/**
 * Thin filesystem abstraction shared by anything that stores an uploaded
 * file (Documents now; avatars later). docs/SECURITY.md "Uploads y
 * documentos": storageKey is server-random, never derived from client input,
 * and every resolved path is verified to stay inside STORAGE_ROOT even
 * though a randomUUID() key can never itself contain a path separator —
 * defense in depth against a future caller passing something else in.
 */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(config: AppConfigService) {
    this.root = resolve(config.storage.root);
  }

  get uploadDestination(): string {
    return this.root;
  }

  generateStorageKey(): string {
    return randomUUID();
  }

  resolvePath(storageKey: string): string {
    const resolved = resolve(this.root, storageKey);
    if (resolved !== this.root && !resolved.startsWith(this.root + sep)) {
      throw new Error(
        `Refusing to resolve a storageKey outside STORAGE_ROOT: ${storageKey}`,
      );
    }
    return resolved;
  }

  /** Reads the first `length` bytes — enough for magic-byte signature checks without loading the whole file. */
  async readHead(storageKey: string, length: number): Promise<Buffer> {
    const path = this.resolvePath(storageKey);
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  createReadStream(storageKey: string) {
    return createReadStream(this.resolvePath(storageKey));
  }

  async deleteIfExists(storageKey: string): Promise<void> {
    try {
      await unlink(this.resolvePath(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
