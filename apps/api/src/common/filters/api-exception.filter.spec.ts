import { ArgumentsHost } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter.js';
import { SessionInvalidException } from '../exceptions.js';

function makeHost(path = '/api/v1/roles') {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const request = { path, requestId: 'req-1' };
  const response = { status };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('ApiExceptionFilter', () => {
  it('does not log raw ORM errors containing credential values', () => {
    const spy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      const filter = new ApiExceptionFilter();
      const { host, json } = makeHost();
      filter.catch(
        new Error(
          'Invalid query: passwordHash=SECRET_HASH refreshToken=SECRET_TOKEN',
        ),
        host,
      );
      expect(JSON.stringify(spy.mock.calls)).not.toContain('SECRET');
      expect(JSON.stringify(json.mock.calls)).not.toContain('SECRET');
    } finally {
      spy.mockRestore();
    }
  });
  it('maps a bare HttpException by status code when no message is given', () => {
    const filter = new ApiExceptionFilter();
    const { host, status, json } = makeHost();
    filter.catch(new ForbiddenException(), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: 'req-1' },
    });
  });

  it('preserves a custom message on a bare exception without mistaking its string `error` description for our envelope', () => {
    const filter = new ApiExceptionFilter();
    const { host, json } = makeHost();
    filter.catch(
      new ConflictException('A role with this name already exists.'),
      host,
    );
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'CONFLICT',
        message: 'A role with this name already exists.',
        requestId: 'req-1',
      },
    });
  });

  it("passes through an ApiException's own envelope unchanged", () => {
    const filter = new ApiExceptionFilter();
    const { host, json } = makeHost();
    filter.catch(new SessionInvalidException(), host);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'SESSION_INVALID',
        message: 'Your session is no longer valid.',
        requestId: 'req-1',
      },
    });
  });
});
