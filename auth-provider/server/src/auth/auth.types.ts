export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface LoginRequirements {
  requiredRole?: SessionUser['role'];
  intent?: LoginIntent;
}

export type LoginIntent =
  { type: 'API' } | { type: 'OAUTH'; returnTo: string } | { type: 'ADMIN' };

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
}

export interface SessionDetails {
  id: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  createdAt: Date;
  expiresAt: Date;
}

export interface AuthenticatedLoginResult {
  status: 'authenticated';
  sessionToken: string;
  user: SessionUser;
  session: SessionDetails;
}

export interface PendingMfaLoginResult {
  status: 'mfa_required';
  challengeToken: string;
  expiresAt: Date;
}

export type LoginResult = AuthenticatedLoginResult | PendingMfaLoginResult;

export interface CurrentSession {
  user: SessionUser;
  session: SessionDetails & {
    lastActivityAt: Date | null;
  };
}
