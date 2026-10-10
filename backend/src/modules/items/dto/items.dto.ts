import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { ItemCategory } from "../entities/item.entity";
import { PIN_INTERVALS, type PinInterval } from "../entities/pin.entity";

export class CreateItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsNumber()
  @Min(1)
  @Max(9999)
  quantity: number;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  category: ItemCategory;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  urgent?: boolean;

  @IsOptional()
  @IsUUID()
  listId?: string;
}

export class UpdateItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsNumber()
  @Min(1)
  @Max(9999)
  quantity: number;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  category: ItemCategory;

  @IsBoolean()
  urgent: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class MarkBoughtDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(999999.999)
  cost?: number | null;
}

export class MarkBoughtItemEntryDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(999999.999)
  cost?: number | null;
}

export class MarkBoughtItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MarkBoughtItemEntryDto)
  items: MarkBoughtItemEntryDto[];
}

export class UpdateItemCostDto {
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(999999.999)
  cost: number | null;
}

export class CreatePinDto extends CreateItemDto {
  @IsIn(PIN_INTERVALS)
  intervalDays: PinInterval;

  @IsOptional()
  @IsBoolean()
  addNow?: boolean;
}

export class UpdatePinDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  category: ItemCategory;

  @IsBoolean()
  urgent: boolean;

  @IsIn(PIN_INTERVALS)
  intervalDays: PinInterval;
}

export class ItemIdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("all", { each: true })
  ids: string[];
}

export class SetUrgentItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("all", { each: true })
  ids: string[];

  @IsBoolean()
  urgent: boolean;
}

export class MoveItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("all", { each: true })
  ids: string[];

  @IsUUID()
  listId: string;
}

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;
}

export class CreateListDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}
