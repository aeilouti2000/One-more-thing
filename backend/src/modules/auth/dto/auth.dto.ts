import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

const usernamePattern = /^[a-zA-Z0-9._]{3,32}$/;
const loginNamePattern = /^\S{3,254}$/;
const codePattern = /^\s*\d{6}\s*$/;

export class SignUpDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsString()
  @Matches(loginNamePattern, {
    message: "Use 3–32 letters, numbers, dots, or underscores.",
  })
  @MaxLength(64)
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;

  /** Real email address; optional so older app versions can still sign up. */
  @IsOptional()
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(254)
  contactEmail?: string;
}

export class LoginDto {
  /** Username or verified email. */
  @IsString()
  @Matches(loginNamePattern, {
    message: "Enter your username or email.",
  })
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}

export class DeleteAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  googleIdToken?: string;
}

export class GoogleTokenDto {
  @IsString()
  @MinLength(1)
  idToken: string;
}

export class SetEmailDto {
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(254)
  email: string;
}

export class VerifyEmailDto {
  @IsString()
  @Matches(codePattern, { message: "Enter the 6-digit code." })
  code: string;
}

export class ForgotPasswordDto {
  @IsString()
  @Matches(loginNamePattern, { message: "Enter your username or email." })
  @MaxLength(254)
  login: string;
}

export class ResetPasswordDto {
  @IsString()
  @Matches(loginNamePattern, { message: "Enter your username or email." })
  @MaxLength(254)
  login: string;

  @IsString()
  @Matches(codePattern, { message: "Enter the 6-digit code." })
  code: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  newPassword: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken: string;
}

export class ChangePasswordDto {
  /** Omitted when setting a first password on a Google-only account. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword?: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  newPassword: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(usernamePattern, {
    message: "Use 3–32 letters, numbers, dots, or underscores.",
  })
  @MaxLength(32)
  email?: string;
}
