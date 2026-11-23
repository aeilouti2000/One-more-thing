import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** Which icon: a category by its id, or a shop by its name. */
export class IconTargetDto {
  @IsIn(["category", "shop"])
  kind: "category" | "shop";

  /** Category id (built-in such as "meat", or a custom category's uuid). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  key?: string;

  /** Shop name, as typed on the trip. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}

export class SetEmojiDto extends IconTargetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  emoji: string;
}
