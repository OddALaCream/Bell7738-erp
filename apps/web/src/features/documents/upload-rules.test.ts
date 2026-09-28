import { describe, expect, it } from 'vitest';
import { fileExtension, validateUploadFile } from './upload-rules';

const rules = { maxBytes: 25 * 1024 * 1024, extensions: ['pdf', 'png', 'zip'] };

describe('fileExtension', () => {
  it('reads the text after the last dot, lower-cased', () => {
    expect(fileExtension('Report.Final.PDF')).toBe('pdf');
  });

  it('is empty without an extension', () => {
    expect(fileExtension('README')).toBe('');
    expect(fileExtension('trailing.')).toBe('');
  });
});

describe('validateUploadFile', () => {
  it('accepts an allowed file within the size limit', () => {
    expect(validateUploadFile({ name: 'spec.pdf', size: 1024 }, rules)).toBeNull();
    expect(validateUploadFile({ name: 'SHOT.PNG', size: rules.maxBytes }, rules)).toBeNull();
  });

  it('rejects a disallowed or missing extension', () => {
    expect(validateUploadFile({ name: 'run.exe', size: 10 }, rules)).toMatch(/\.exe/);
    expect(validateUploadFile({ name: 'noext', size: 10 }, rules)).toMatch(/extensión/);
  });

  it('rejects a file over the limit and says by how much it misses', () => {
    const reason = validateUploadFile({ name: 'big.zip', size: rules.maxBytes + 1 }, rules);
    expect(reason).toMatch(/25 MB/);
  });
});
