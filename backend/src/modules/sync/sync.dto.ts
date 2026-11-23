import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class ChangesQueryDto {
  /** The version the phone last saw. Missing: send a full copy. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  since?: number;
}
