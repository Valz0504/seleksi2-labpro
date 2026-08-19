import { HttpStatus } from '@nestjs/common';

export class UserInfoError extends Error {
  readonly code = 'invalid_token';
  readonly statusCode = HttpStatus.UNAUTHORIZED;

  constructor() {
    super('Access token tidak valid atau telah berakhir');
    this.name = 'UserInfoError';
  }
}
