import { IsIn, IsOptional, IsString, Matches } from "class-validator";

export class PushTokenDto {
  @IsString()
  @Matches(/^Expo(nent)?PushToken\[[^\]]+\]$/)
  token: string;

  @IsIn(["en", "ar"])
  locale: "en" | "ar";

  /** The token this phone had before; removed when it rotates. */
  @IsOptional()
  @IsString()
  @Matches(/^Expo(nent)?PushToken\[[^\]]+\]$/)
  previousToken?: string;
}

export class RemovePushTokenDto {
  @IsString()
  @Matches(/^Expo(nent)?PushToken\[[^\]]+\]$/)
  token: string;
}
