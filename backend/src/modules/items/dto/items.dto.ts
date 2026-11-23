import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
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
import { Trim } from "../../../common/trim.decorator";
import type { ItemCategory } from "../entities/item.entity";
import { PIN_INTERVALS, type PinInterval } from "../entities/pin.entity";

/** Most ids one bulk request may carry. */
const MAX_BULK_ITEMS = 500;

/**
 * `id` on a create: the phone made the id itself, so a change saved without
 * internet can be sent again later without making a second copy.
 */
export class CreateItemDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @Trim()
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

/** Only the fields sent are changed, so two phones editing different fields both keep theirs. */
export class UpdateItemDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(9999)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  category?: ItemCategory;

  @IsOptional()
  @IsBoolean()
  urgent?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Omit to keep the current unit; "" clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;
}

export class UndoBoughtDto {
  /** From a trip: only take back an item this person bought. */
  @IsOptional()
  @IsBoolean()
  onlyMine?: boolean;
}

export class ClaimShopLockDto {
  /** A fresh trip (not one resumed after the app closed). */
  @IsOptional()
  @IsBoolean()
  newTrip?: boolean;
}

export class MarkBoughtDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(999999.999)
  cost?: number | null;

  /** Bought outside a trip: join this invoice (the latest one this month). */
  @IsOptional()
  @IsUUID()
  receiptId?: string;
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
  @ArrayMaxSize(MAX_BULK_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => MarkBoughtItemEntryDto)
  items: MarkBoughtItemEntryDto[];

  @IsOptional()
  @IsUUID()
  receiptId?: string;
}

export class UpdateItemCostDto {
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(999999.999)
  cost: number | null;
}

export class CreateTripReceiptDto {
  /** The id a new invoice gets (made on the phone). */
  @IsOptional()
  @IsUUID()
  id?: string;

  /** Null/omitted: an invoice without a total yet (e.g. only named). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(999999.999)
  total?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  name?: string | null;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_ITEMS)
  @IsUUID("all", { each: true })
  itemIds: string[];

  @IsOptional()
  @IsUUID()
  listId?: string;
}

export class UpdateTripReceiptDto {
  /** "" or null clears the name. */
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  name: string | null;
}

export class MoveToReceiptDto {
  @IsUUID()
  receiptId: string;

  /** Device offset east of UTC, so "same month" uses the user's calendar. */
  @IsOptional()
  @IsInt()
  @Min(-840)
  @Max(840)
  utcOffsetMin?: number;
}

export class CreatePinDto extends CreateItemDto {
  @IsIn(PIN_INTERVALS)
  intervalDays: PinInterval;

  /** Monthly pins: day of the month to return on (1–31). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  monthDay?: number;

  /** Device offset east of UTC, in minutes, for monthDay. */
  @IsOptional()
  @IsInt()
  @Min(-840)
  @Max(840)
  utcOffsetMin?: number;

  @IsOptional()
  @IsBoolean()
  addNow?: boolean;

  /** The id of the item "add now" puts on the list (made on the phone). */
  @IsOptional()
  @IsUUID()
  itemId?: string;
}

export class UpdatePinDto {
  @Trim()
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

  /** Monthly pins: day of the month (1–31); null goes back to every 30 days. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(31)
  monthDay?: number | null;

  @IsOptional()
  @IsInt()
  @Min(-840)
  @Max(840)
  utcOffsetMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(9999)
  quantity?: number;

  /** Omit to keep the current unit; "" clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  /** Move the pin to another list of the home. */
  @IsOptional()
  @IsUUID()
  listId?: string;
}

export class ItemIdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_ITEMS)
  @IsUUID("all", { each: true })
  ids: string[];
}

export class SetUrgentItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_ITEMS)
  @IsUUID("all", { each: true })
  ids: string[];

  @IsBoolean()
  urgent: boolean;
}

export class SetCategoryItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_ITEMS)
  @IsUUID("all", { each: true })
  ids: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  category: ItemCategory;
}

export class SetUnitItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_ITEMS)
  @IsUUID("all", { each: true })
  ids: string[];

  /** "" clears the unit (plain pieces). */
  @Trim()
  @IsString()
  @MaxLength(40)
  unit: string;
}

export class MoveItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_ITEMS)
  @IsUUID("all", { each: true })
  ids: string[];

  @IsUUID()
  listId: string;
}

export class CreateCategoryDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;
}

export class CreateListDto {
  /** Only read when creating a list. */
  @IsOptional()
  @IsUUID()
  id?: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

export class LaterItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_ITEMS)
  @IsUUID("all", { each: true })
  ids: string[];

  /** The moment the items return by themselves; null = only by hand. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  until?: string | null;
}

export class ShopAskReplyDto {
  @IsIn(["nothing", "done"])
  reply: "nothing" | "done";
}

export class ShopAskItemDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
}

export class SetItemDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsNumber()
  @Min(1)
  @Max(9999)
  quantity: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  unit?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  category: ItemCategory;
}

export class CreateSetDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SetItemDto)
  items: SetItemDto[];
}

export class UpdateSetDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SetItemDto)
  items?: SetItemDto[];
}

export class AddSetDto {
  @IsOptional()
  @IsUUID()
  listId?: string;
}
