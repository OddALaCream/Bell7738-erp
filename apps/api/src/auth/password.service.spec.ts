import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes a password and verifies the correct plaintext', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(
      service.verify(hash, 'correct horse battery staple'),
    ).resolves.toBe(true);
  });

  it('rejects an incorrect plaintext against a real hash', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(service.verify(hash, 'wrong password')).resolves.toBe(false);
  });

  it('returns false instead of throwing for a malformed hash', async () => {
    await expect(
      service.verify('not-a-real-argon2-hash', 'anything'),
    ).resolves.toBe(false);
  });

  it('produces argon2id hashes with a unique salt per call', async () => {
    const [first, second] = await Promise.all([
      service.hash('same-password'),
      service.hash('same-password'),
    ]);
    expect(first).toContain('$argon2id$');
    expect(first).not.toBe(second);
  });
});
