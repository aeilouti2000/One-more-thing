import type { ItemCategory } from "../../entities/item.entity";
import type { Pin, PinInterval } from "../../entities/pin.entity";

export type NewPinInput = {
  homeId: string;
  name: string;
  quantity: number;
  category: ItemCategory;
  unit: string | null;
  urgent: boolean;
  intervalDays: PinInterval;
  nextDueAt: Date;
  createdBy: string;
};

export interface IPinsRepository {
  findByHome(homeId: string): Promise<Pin[]>;
  count(homeId: string): Promise<number>;
  insert(input: NewPinInput): Promise<Pin>;
  findInHome(pinId: string, homeId: string): Promise<Pin | null>;
  deleteById(pinId: string): Promise<void>;
  findDue(homeId: string): Promise<Pin[]>;
  findDueHomeIds(): Promise<string[]>;
  claimDue(pinId: string, nextDueAt: Date): Promise<boolean>;
  save(pin: Pin): Promise<Pin>;
  reassignCategory(homeId: string, categoryId: string, fallback: string): Promise<void>;
}

export const PINS_REPOSITORY = Symbol("PINS_REPOSITORY");
