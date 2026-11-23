import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** `<ISO time>_<uuid>`, as returned in `next`. */
const CURSOR = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z_[0-9a-f-]{36}$/i;

export class PurchasesQueryDto {
  /** "YYYY-MM". Required unless `q` is given. */
  @IsOptional()
  @Matches(MONTH)
  month?: string;

  @IsOptional()
  @IsUUID()
  listId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  /** Search text: searches every kept month, `month` is ignored. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Matches(CURSOR)
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class TripsQueryDto {
  @Matches(MONTH)
  month: string;

  @IsOptional()
  @IsUUID()
  listId?: string;

  @IsOptional()
  @Matches(CURSOR)
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** The path of `months/:month` (it also carries the home). */
export class MonthParamDto {
  @IsUUID()
  homeId: string;

  @Matches(MONTH)
  month: string;
}
