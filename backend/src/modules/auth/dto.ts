import { IsString, Matches, MaxLength, MinLength } from "class-validator";

const usernamePattern = /^[a-zA-Z0-9._]{3,32}$/;
const loginNamePattern = /^[a-zA-Z0-9._@+-]{3,64}$/;

export class SignUpDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsString()
  @Matches(usernamePattern, {
    message: "Use 3–32 letters, numbers, dots, or underscores.",
  })
  @MaxLength(64)
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;
}

export class LoginDto {
  @IsString()
  @Matches(loginNamePattern, {
    message: "Enter your username.",
  })
  @MaxLength(64)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
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
