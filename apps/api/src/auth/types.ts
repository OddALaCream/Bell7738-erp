export interface AccessTokenPayload {
  sub: string;
  sid: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  type: 'refresh';
  jti: string;
}

/** The authenticated principal attached to `request.user` by SessionAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  isOwner: boolean;
  sessionId: string;
}
