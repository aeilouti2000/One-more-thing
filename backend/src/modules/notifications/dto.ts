import { IsIn, IsString, Matches } from "class-validator";

export class PushTokenDto {
  @IsString()
  @Matches(/^Expo(nent)?PushToken\[[^\]]+\]$/)
  token: string;

  @IsIn(["en", "ar"])
  locale: "en" | "ar";
}

export class RemovePushTokenDto {
  @IsString()
  @Matches(/^Expo(nent)?PushToken\[[^\]]+\]$/)
  token: string;
}
