import { IsUrl, MaxLength } from 'class-validator';

export class CreateRedirectUriDto {
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(2048)
  redirectUri!: string;
}
