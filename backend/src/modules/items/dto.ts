import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";
import { ITEM_CATEGORIES, type ItemCategory } from "./item.entity";
import { STAPLE_INTERVALS, type StapleInterval } from "./staple.entity";

export class CreateItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsNumber()
  @Min(1)
  @Max(9999)
  quantity: number;

  @IsIn(ITEM_CATEGORIES)
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

  @IsIn(ITEM_CATEGORIES)
  category: ItemCategory;

  @IsBoolean()
  urgent: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateStapleDto extends CreateItemDto {
  @IsIn(STAPLE_INTERVALS)
  intervalDays: StapleInterval;

  @IsOptional()
  @IsBoolean()
  addNow?: boolean;
}

export class ItemIdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("all", { each: true })
  ids: string[];
}
