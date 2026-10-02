import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export const HOME_CURRENCIES = ["JOD", "USD", "EUR", "ILS", "SAR", "AED", "EGP", "GBP"] as const;
export type HomeCurrency = (typeof HOME_CURRENCIES)[number];

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

export class UpdateCostSettingsDto {
  @IsOptional()
  @IsBoolean()
  costsEnabled?: boolean;

  @IsOptional()
  @IsIn(HOME_CURRENCIES)
  currency?: HomeCurrency;

  @IsOptional()
  @IsBoolean()
  askCostOnSingleBuy?: boolean;

  @IsOptional()
  @IsBoolean()
  askCostOnBulkBuy?: boolean;

  @IsOptional()
  @IsBoolean()
  askCostOnTripEnd?: boolean;
}
