// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { ApiError } from '@/lib/api-types';
import type { ProjectDocument } from '@/types/domain';

vi.mock('./api', () => ({ uploadDocument: vi.fn() }));

import * as api from './api';
import { useDocumentUploads } from './use-document-uploads';

const stored: ProjectDocument = {
  id: 'd1',
  projectId: 'p1',
  originalName: 'spec.pdf',
  mimeType: 'application/pdf',
  size: 1,
  checksumSha256: 'x',
  uploadedById: 'u1',
  uploadedBy: { id: 'u1', firstName: 'Ana', lastName: 'Ruiz' },
  createdAt: '2026-09-28T15:00:00Z',
};

function setup() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useDocumentUploads('p1'), { wrapper });
}

function file(name: string, bytes = 10) {
  const f = new File(['x'], name);
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

describe('useDocumentUploads', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('rejects a disallowed or oversized file before sending, and still uploads the others', async () => {
    vi.mocked(api.uploadDocument).mockResolvedValue(stored);
    const { result } = setup();

    await act(async () => {
      await result.current.addFiles([file('run.exe'), file('huge.zip', 30 * 1024 * 1024), file('spec.pdf')]);
    });

    expect(api.uploadDocument).toHaveBeenCalledTimes(1);
    expect(api.uploadDocument).toHaveBeenCalledWith('p1', expect.objectContaining({ name: 'spec.pdf' }), expect.any(Function));
    const byName = Object.fromEntries(result.current.items.map((item) => [item.name, item]));
    expect(byName['run.exe']?.status).toBe('error');
    expect(byName['run.exe']?.retryable).toBe(false);
    expect(byName['huge.zip']?.error).toMatch(/25 MB/);
    expect(byName['spec.pdf']?.status).toBe('done');
  });

  it('keeps going after the server rejects one file, with a per-file reason', async () => {
    vi.mocked(api.uploadDocument)
      .mockRejectedValueOnce(new ApiError(415, { code: 'UNSUPPORTED_FILE_TYPE', message: 'x' }))
      .mockResolvedValueOnce(stored);
    const { result } = setup();

    await act(async () => {
      await result.current.addFiles([file('fake.pdf'), file('real.pdf')]);
    });

    const [first, second] = result.current.items;
    expect(first?.status).toBe('error');
    expect(first?.error).toMatch(/contenido no coincide/);
    expect(first?.retryable).toBe(false); // the file itself is the problem
    expect(second?.status).toBe('done');
  });

  it('only reports success once the API confirms, and offers retry for transient failures', async () => {
    let resolveUpload: (value: ProjectDocument) => void = () => {};
    vi.mocked(api.uploadDocument).mockReturnValueOnce(new Promise((resolve) => (resolveUpload = resolve)));
    const { result } = setup();

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.addFiles([file('spec.pdf')]);
    });
    expect(result.current.items[0]?.status).toBe('uploading'); // not "done" before the answer

    await act(async () => {
      resolveUpload(stored);
      await pending;
    });
    expect(result.current.items[0]?.status).toBe('done');
  });

  it('retries a file after a connection failure', async () => {
    vi.mocked(api.uploadDocument)
      .mockRejectedValueOnce(new ApiError(0, { code: 'NETWORK_ERROR', message: 'Network Error' }))
      .mockResolvedValueOnce(stored);
    const { result } = setup();

    await act(async () => {
      await result.current.addFiles([file('spec.pdf')]);
    });
    const failed = result.current.items[0];
    expect(failed?.status).toBe('error');
    expect(failed?.retryable).toBe(true);

    await act(async () => {
      await result.current.retry(failed!.id);
    });
    expect(result.current.items[0]?.status).toBe('done');
    expect(api.uploadDocument).toHaveBeenCalledTimes(2);
  });
});
