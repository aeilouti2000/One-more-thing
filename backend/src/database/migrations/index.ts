import type { MigrationInterface } from "typeorm";
import { Init1740000000000 } from "./1740000000000-Init";
import { DropEmailConfirmation1740000000001 } from "./1740000000001-DropEmailConfirmation";
import { AddItemUrgent1740000000002 } from "./1740000000002-AddItemUrgent";
import { AddPushTokens1740000000003 } from "./1740000000003-AddPushTokens";
import { ShoppingTrip1740000000004 } from "./1740000000004-ShoppingTrip";
import { ManyHomes1740000000005 } from "./1740000000005-ManyHomes";
import { ItemSortOrder1740000000006 } from "./1740000000006-ItemSortOrder";
import { ShoppingLists1740000000007 } from "./1740000000007-ShoppingLists";
import { CustomCategories1740000000008 } from "./1740000000008-CustomCategories";
import { ItemCosts1740000000009 } from "./1740000000009-ItemCosts";
import { SoftDeleteLists1740000000010 } from "./1740000000010-SoftDeleteLists";
import { ListShopLocks1740000000011 } from "./1740000000011-ListShopLocks";
import { TripReceipts1740000000012 } from "./1740000000012-TripReceipts";
import { EmailAndGoogle1740000000013 } from "./1740000000013-EmailAndGoogle";
import { ItemImages1740000000014 } from "./1740000000014-ItemImages";
import { PinLists1740000000015 } from "./1740000000015-PinLists";
import { PinMonthDay1740000000016 } from "./1740000000016-PinMonthDay";
import { HomeNotifications1740000000017 } from "./1740000000017-HomeNotifications";
import { NamedInvoices1740000000018 } from "./1740000000018-NamedInvoices";
import { PrefsBudgetTrips1740000000019 } from "./1740000000019-PrefsBudgetTrips";
import { TripsTogether1740000000020 } from "./1740000000020-TripsTogether";
import { OncePinsInterval1740000000021 } from "./1740000000021-OncePinsInterval";
import { RotateRefreshTokens1740000000022 } from "./1740000000022-RotateRefreshTokens";
import { MemberAndListIndexes1740000000023 } from "./1740000000023-MemberAndListIndexes";
import { LaterAsksSets1740000000024 } from "./1740000000024-LaterAsksSets";
import { SyncVersions1740000000025 } from "./1740000000025-SyncVersions";
import { SyncAndHistoryIndexes1740000000026 } from "./1740000000026-SyncAndHistoryIndexes";
import { TripsAsRows1740000000027 } from "./1740000000027-TripsAsRows";
import { HomeProducts1740000000028 } from "./1740000000028-HomeProducts";
import { PlansAndMonthStats1740000000029 } from "./1740000000029-PlansAndMonthStats";
import { PhotoStorage1740000000030 } from "./1740000000030-PhotoStorage";
import { HomeIcons1740000000031 } from "./1740000000031-HomeIcons";

/** Every migration, oldest first. The server runs the new ones when it starts. */
export const MIGRATIONS: (new () => MigrationInterface)[] = [
  Init1740000000000,
  DropEmailConfirmation1740000000001,
  AddItemUrgent1740000000002,
  AddPushTokens1740000000003,
  ShoppingTrip1740000000004,
  ManyHomes1740000000005,
  ItemSortOrder1740000000006,
  ShoppingLists1740000000007,
  CustomCategories1740000000008,
  ItemCosts1740000000009,
  SoftDeleteLists1740000000010,
  ListShopLocks1740000000011,
  TripReceipts1740000000012,
  EmailAndGoogle1740000000013,
  ItemImages1740000000014,
  PinLists1740000000015,
  PinMonthDay1740000000016,
  HomeNotifications1740000000017,
  NamedInvoices1740000000018,
  PrefsBudgetTrips1740000000019,
  TripsTogether1740000000020,
  OncePinsInterval1740000000021,
  RotateRefreshTokens1740000000022,
  MemberAndListIndexes1740000000023,
  LaterAsksSets1740000000024,
  SyncVersions1740000000025,
  SyncAndHistoryIndexes1740000000026,
  TripsAsRows1740000000027,
  HomeProducts1740000000028,
  PlansAndMonthStats1740000000029,
  PhotoStorage1740000000030,
  HomeIcons1740000000031,
];
