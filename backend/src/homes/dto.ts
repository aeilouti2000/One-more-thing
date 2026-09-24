import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateHomeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

export class JoinHomeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code: string;
}

export class UpdateHomeNameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}
