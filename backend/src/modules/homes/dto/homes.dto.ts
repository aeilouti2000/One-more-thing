import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { TRIP_AUTO_END_HOURS, TRIP_COST_MODES, type TripCostMode } from "../entities/home.entity";

export const HOME_CURRENCIES = ["JOD", "USD", "EUR", "ILS", "SAR", "AED", "EGP", "GBP"] as const;
export type HomeCurrency = (typeof HOME_CURRENCIES)[number];

export class CreateHomeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  listName?: string;
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

  @IsOptional()
  @IsIn(TRIP_COST_MODES)
  tripCostMode?: TripCostMode;

  /** Null clears the budget. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999_999_999)
  monthlyBudget?: number | null;

  @IsOptional()
  @IsBoolean()
  monthlyRecap?: boolean;
}

export class UpdateTripSettingsDto {
  @IsOptional()
  @IsBoolean()
  tripAskName?: boolean;

  /** Null turns auto-end off. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn(TRIP_AUTO_END_HOURS)
  tripAutoEndHours?: number | null;

  @IsOptional()
  @IsBoolean()
  tripSummary?: boolean;

  @IsOptional()
  @IsBoolean()
  tripShopTogether?: boolean;

  @IsOptional()
  @IsBoolean()
  tripEstimate?: boolean;

  @IsOptional()
  @IsBoolean()
  tripAskHome?: boolean;
}

export class UpdateNotificationSettingsDto {
  @IsBoolean()
  notificationsEnabled: boolean;
}
