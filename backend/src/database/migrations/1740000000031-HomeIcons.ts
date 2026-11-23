import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Icons a home chose for its categories and its shops.
 *
 * A row exists only when a home changed an icon; no row means the default.
 * Each icon is one emoji or one uploaded image. A shop's icon belongs to the
 * shop name (key = the name, keyed like product names), so every trip with
 * that name shows it.
 *
 * - The whole set is small and sent with every changes answer: a change only
 *   moves the home's counter.
 * - Removing a custom category removes its icon.
 * - A removed or replaced image goes to storage_trash for the daily job.
 * - `data` holds the image while photos are still kept in Postgres
 *   (STORAGE_DRIVER=db).
 */
export class HomeIcons1740000000031 implements MigrationInterface {
  name = "HomeIcons1740000000031";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists home_icons (
        home_id     uuid not null references homes (id) on delete cascade,
        kind        text not null check (kind in ('category', 'shop')),
        key         text not null,
        label       text,
        emoji       text,
        image_id    uuid,
        image_bytes integer,
        data        bytea,
        updated_by  uuid references users (id) on delete set null,
        updated_at  timestamptz not null default now(),
        primary key (home_id, kind, key),
        check (emoji is null or image_id is null),
        check (emoji is not null or image_id is not null)
      )
    `);
    await queryRunner.query(`create unique index if not exists home_icons_image_idx on home_icons (image_id)`);
    await queryRunner.query(`drop trigger if exists home_icons_bump on home_icons`);
    await queryRunner.query(`
      create trigger home_icons_bump after insert or update or delete on home_icons
        for each row execute function omt_bump_home()
    `);

    await queryRunner.query(`
      create or replace function omt_trash_icon_file() returns trigger language plpgsql as $$
      begin
        if old.image_id is not null and old.data is null
           and (tg_op = 'DELETE' or new.image_id is distinct from old.image_id) then
          insert into storage_trash (key)
          values ('homes/' || old.home_id || '/icons/' || old.image_id || '.webp')
          on conflict do nothing;
        end if;
        return null;
      end $$
    `);
    await queryRunner.query(`drop trigger if exists home_icons_trash on home_icons`);
    await queryRunner.query(`
      create trigger home_icons_trash after update or delete on home_icons
        for each row execute function omt_trash_icon_file()
    `);

    await queryRunner.query(`
      create or replace function omt_drop_category_icon() returns trigger language plpgsql as $$
      begin
        delete from home_icons where home_id = old.home_id and kind = 'category' and key = old.id::text;
        return null;
      end $$
    `);
    await queryRunner.query(`drop trigger if exists custom_categories_icon on custom_home_categories`);
    await queryRunner.query(`
      create trigger custom_categories_icon after delete on custom_home_categories
        for each row execute function omt_drop_category_icon()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop trigger if exists custom_categories_icon on custom_home_categories`);
    await queryRunner.query(`drop function if exists omt_drop_category_icon()`);
    await queryRunner.query(`drop table if exists home_icons`);
    await queryRunner.query(`drop function if exists omt_trash_icon_file()`);
  }
}
