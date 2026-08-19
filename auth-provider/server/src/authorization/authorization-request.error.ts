export type OAuthAuthorizationErrorCode =
  | 'access_denied'
  | 'invalid_request'
  | 'login_required'
  | 'unauthorized_client'
  | 'unsupported_response_type';

interface AuthorizationRequestErrorOptions {
  code: OAuthAuthorizationErrorCode;
  message: string;
  statusCode: number;
  redirectUri?: string;
  state?: string;
}

export class AuthorizationRequestError extends Error {
  readonly code: OAuthAuthorizationErrorCode;
  readonly statusCode: number;
  readonly redirectUri?: string;
  readonly state?: string;

  constructor(options: AuthorizationRequestErrorOptions) {
    super(options.message);
    this.name = 'AuthorizationRequestError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.redirectUri = options.redirectUri;
    this.state = options.state;
  }

  get redirectUrl(): string | null {
    if (!this.redirectUri) {
      return null;
    }

    const redirectUrl = new URL(this.redirectUri);
    redirectUrl.searchParams.set('error', this.code);
    redirectUrl.searchParams.set('error_description', this.message);

    if (this.state) {
      redirectUrl.searchParams.set('state', this.state);
    }

    return redirectUrl.toString();
  }
}
