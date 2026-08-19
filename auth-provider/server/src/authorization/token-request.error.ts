import { HttpStatus } from '@nestjs/common';

export type TokenErrorCode =
  | 'invalid_client'
  | 'invalid_grant'
  | 'invalid_request'
  | 'unsupported_grant_type';

export class TokenRequestError extends Error {
  readonly code: TokenErrorCode;
  readonly statusCode: number;

  constructor(
    code: TokenErrorCode,
    message: string,
    statusCode = HttpStatus.BAD_REQUEST,
  ) {
    super(message);
    this.name = 'TokenRequestError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
