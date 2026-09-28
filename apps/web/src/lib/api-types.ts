/** Shared envelope shapes per docs/API.md. */

export interface ApiCollectionMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiCollectionResponse<T> {
  data: T[];
  meta: ApiCollectionMeta;
}

export interface ApiResourceResponse<T> {
  data: T;
}

export interface ApiErrorDetail {
  field?: string;
  code: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    requestId?: string;
    /** `REVISION_CONFLICT` only: the revision that won (docs/API.md "Concurrencia"). */
    currentRevision?: number;
    /** `REVISION_CONFLICT` only: when the winning revision was saved. */
    updatedAt?: string | null;
  };
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'SESSION_INVALID'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'REVISION_CONFLICT'
  | 'INVITATION_INVALID'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | string;

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: ApiErrorDetail[];
  readonly requestId?: string;
  readonly currentRevision?: number;
  readonly updatedAt?: string | null;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.code = body.code;
    this.status = status;
    this.details = body.details;
    this.requestId = body.requestId;
    this.currentRevision = body.currentRevision;
    this.updatedAt = body.updatedAt;
  }

  get isRevisionConflict(): boolean {
    return this.status === 409 && this.code === 'REVISION_CONFLICT';
  }

  fieldMessage(field: string): string | undefined {
    return this.details?.find((d) => d.field === field)?.message;
  }
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}
