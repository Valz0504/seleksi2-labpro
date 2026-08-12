import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const URL_OPTIONS = {
  protocols: ['http', 'https'],
  require_protocol: true,
  require_tld: false,
};

export class CreateApplicationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9._~-]+$/)
  clientId!: string;

  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  clientSecret?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUrl(URL_OPTIONS, { each: true })
  redirectUris!: string[];

  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(2048)
  launchUrl?: string;

  @IsUrl(URL_OPTIONS)
  @MaxLength(2048)
  logoutNotificationUrl!: string;
}
