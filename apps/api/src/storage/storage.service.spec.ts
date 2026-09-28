import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorageService } from './storage.service.js';
import type { AppConfigService } from '../config/app-config.service.js';

function makeService(root: string) {
  const config = { storage: { root } } as unknown as AppConfigService;
  return new StorageService(config);
}

describe('StorageService', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'storage-service-test-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('generates a distinct storageKey on each call', () => {
    const service = makeService(root);
    const a = service.generateStorageKey();
    const b = service.generateStorageKey();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('resolves a storageKey to a path inside the configured root', () => {
    const service = makeService(root);
    const key = service.generateStorageKey();
    expect(service.resolvePath(key)).toBe(join(root, key));
  });

  it('refuses to resolve a storageKey that would escape the root', () => {
    const service = makeService(root);
    expect(() => service.resolvePath('../../etc/passwd')).toThrow(
      /outside STORAGE_ROOT/,
    );
  });

  it('reads the first N bytes of a stored file for signature checks', async () => {
    const service = makeService(root);
    const key = service.generateStorageKey();
    writeFileSync(
      service.resolvePath(key),
      Buffer.from('%PDF-1.7 the rest of a much longer file body'),
    );

    const head = await service.readHead(key, 4);
    expect(head.toString('ascii')).toBe('%PDF');
  });

  it('returns a shorter buffer when the file itself is shorter than requested', async () => {
    const service = makeService(root);
    const key = service.generateStorageKey();
    writeFileSync(service.resolvePath(key), Buffer.from('hi'));

    const head = await service.readHead(key, 16);
    expect(head.length).toBe(2);
  });

  it('deletes an existing file', async () => {
    const service = makeService(root);
    const key = service.generateStorageKey();
    const path = service.resolvePath(key);
    writeFileSync(path, 'content');

    await service.deleteIfExists(key);
    expect(existsSync(path)).toBe(false);
  });

  it('is a no-op (does not throw) when deleting a file that does not exist', async () => {
    const service = makeService(root);
    const key = service.generateStorageKey();
    await expect(service.deleteIfExists(key)).resolves.toBeUndefined();
  });

  it('creates a readable stream over a stored file', async () => {
    const service = makeService(root);
    const key = service.generateStorageKey();
    writeFileSync(service.resolvePath(key), 'stream me');

    const chunks: Buffer[] = [];
    for await (const chunk of service.createReadStream(key)) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).toString('utf8')).toBe('stream me');
  });
});
