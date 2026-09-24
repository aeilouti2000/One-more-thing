import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class SignUpDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}

export class TokenDto {
  @IsString()
  @MinLength(1)
  token: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  newPassword: string;
}

export class UpdateProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

export class ResendConfirmationDto {
  @IsEmail()
  email: string;
}
