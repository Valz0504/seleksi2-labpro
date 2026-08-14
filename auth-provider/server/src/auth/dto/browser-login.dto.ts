import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class BrowserLoginDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  returnTo!: string;
}
