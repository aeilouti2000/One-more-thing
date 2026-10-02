import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../../common/current-user.decorator";
import { User } from "../../users/user.entity";
import {
  CreateCategoryDto,
  CreateItemDto,
  CreateListDto,
  ItemIdsDto,
  MarkBoughtDto,
  MarkBoughtItemsDto,
  UpdateItemCostDto,
  UpdateItemDto,
} from "./dto";
import { CategoriesService } from "./categories.service";
import { ItemsService } from "./items.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class ItemsController {
  constructor(
    private readonly items: ItemsService,
    private readonly categories: CategoriesService,
  ) {}

  @Get("homes/:homeId/lists")
  lists(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string) {
    return this.items.lists(user.id, homeId);
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

  @Patch("items/:itemId/cost")
  updateCost(
    @CurrentUser() user: User,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() body: UpdateItemCostDto,
  ) {
    return this.items.updateCost(user.id, itemId, body.cost);
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
}
