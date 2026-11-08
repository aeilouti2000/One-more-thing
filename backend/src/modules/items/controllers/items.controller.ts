import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../../../common/current-user.decorator";
import { User } from "../../../users/user.entity";
import {
  CreateCategoryDto,
  CreateItemDto,
  CreateListDto,
  CreateTripReceiptDto,
  ItemIdsDto,
  MarkBoughtDto,
  MarkBoughtItemsDto,
  MoveItemsDto,
  SetUrgentItemsDto,
  UpdateItemCostDto,
  UpdateItemDto,
} from "../dto/items.dto";
import { CategoriesService } from "../services/categories.service";
import { ItemImagesService, type UploadedPhoto } from "../services/item-images.service";
import { ItemsService } from "../services/items.service";
import { ShopLocksService } from "../services/shop-locks.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class ItemsController {
  constructor(
    private readonly items: ItemsService,
    private readonly categories: CategoriesService,
    private readonly shopLocks: ShopLocksService,
    private readonly images: ItemImagesService,
  ) {}

  @Get("homes/:homeId/lists")
  lists(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string) {
    return this.items.lists(user.id, homeId);
  }

  @Get("homes/:homeId/history-lists")
  historyLists(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string) {
    return this.items.historyLists(user.id, homeId);
  }

  @Post("homes/:homeId/lists")
  createList(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Body() body: CreateListDto,
  ) {
    return this.items.createList(user.id, homeId, body.name);
  }

  @Patch("homes/:homeId/lists/:listId")
  renameList(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Param("listId", ParseUUIDPipe) listId: string,
    @Body() body: CreateListDto,
  ) {
    return this.items.renameList(user.id, homeId, listId, body.name);
  }

  @Delete("homes/:homeId/lists/:listId")
  deleteList(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Param("listId", ParseUUIDPipe) listId: string,
  ) {
    return this.items.deleteList(user.id, homeId, listId);
  }

  @Get("homes/:homeId/lists/:listId/shop-lock")
  shopLockStatus(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Param("listId", ParseUUIDPipe) listId: string,
  ) {
    return this.shopLocks.status(user.id, homeId, listId);
  }

  @Post("homes/:homeId/lists/:listId/shop-lock")
  claimShopLock(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Param("listId", ParseUUIDPipe) listId: string,
  ) {
    return this.shopLocks.claim(user.id, homeId, listId);
  }

  @Post("homes/:homeId/lists/:listId/shop-lock/heartbeat")
  heartbeatShopLock(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Param("listId", ParseUUIDPipe) listId: string,
  ) {
    return this.shopLocks.heartbeat(user.id, homeId, listId);
  }

  @Delete("homes/:homeId/lists/:listId/shop-lock")
  releaseShopLock(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Param("listId", ParseUUIDPipe) listId: string,
  ) {
    return this.shopLocks.release(user.id, homeId, listId);
  }

  @Get("homes/:homeId/categories")
  categoriesList(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string) {
    return this.categories.list(user.id, homeId);
  }

  @Post("homes/:homeId/categories")
  createCategory(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Body() body: CreateCategoryDto,
  ) {
    return this.categories.create(user.id, homeId, body.name);
  }

  @Delete("homes/:homeId/categories/:categoryId")
  removeCategory(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Param("categoryId") categoryId: string,
  ) {
    return this.categories.remove(user.id, homeId, categoryId);
  }

  @Get("homes/:homeId/items")
  list(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string) {
    return this.items.list(user.id, homeId);
  }

  @Post("homes/:homeId/items")
  add(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Body() body: CreateItemDto,
  ) {
    return this.items.add(user.id, homeId, body);
  }

  @Patch("items/:itemId")
  update(
    @CurrentUser() user: User,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() body: UpdateItemDto,
  ) {
    return this.items.updateDetails(user.id, itemId, body);
  }

  /** Multipart field "image". The server resizes it and strips metadata. */
  @Put("items/:itemId/image")
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: 15 * 1024 * 1024, files: 1 } }))
  setImage(
    @CurrentUser() user: User,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @UploadedFile() file: UploadedPhoto | undefined,
  ) {
    return this.images.set(user.id, itemId, file);
  }

  @Delete("items/:itemId/image")
  removeImage(@CurrentUser() user: User, @Param("itemId", ParseUUIDPipe) itemId: string) {
    return this.images.remove(user.id, itemId);
  }

  @Patch("items/:itemId/cost")
  updateCost(
    @CurrentUser() user: User,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() body: UpdateItemCostDto,
  ) {
    return this.items.updateCost(user.id, itemId, body.cost);
  }

  @Post("homes/:homeId/receipts")
  createReceipt(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Body() body: CreateTripReceiptDto,
  ) {
    return this.items.createReceipt(user.id, homeId, body);
  }

  @Post("items/:itemId/bought")
  markBought(
    @CurrentUser() user: User,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() body: MarkBoughtDto,
  ) {
    return this.items.markBought(user.id, itemId, body?.cost);
  }

  @Post("items/:itemId/needed")
  undoBought(@CurrentUser() user: User, @Param("itemId", ParseUUIDPipe) itemId: string) {
    return this.items.undoBought(user.id, itemId);
  }

  @Post("items/order")
  reorder(@CurrentUser() user: User, @Body() body: ItemIdsDto) {
    return this.items.reorder(user.id, body.ids);
  }

  @Post("items/bought")
  markMany(@CurrentUser() user: User, @Body() body: MarkBoughtItemsDto) {
    return this.items.markManyBought(user.id, body.items);
  }

  @Post("items/delete")
  removeMany(@CurrentUser() user: User, @Body() body: ItemIdsDto) {
    return this.items.removeMany(user.id, body.ids);
  }

  @Post("items/move")
  moveMany(@CurrentUser() user: User, @Body() body: MoveItemsDto) {
    return this.items.moveMany(user.id, body.ids, body.listId);
  }

  @Post("items/urgent")
  setUrgent(@CurrentUser() user: User, @Body() body: SetUrgentItemsDto) {
    return this.items.setManyUrgent(user.id, body.ids, body.urgent);
  }
}
