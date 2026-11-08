import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * One photo per item. The resized JPEG lives in its own table so item lists
 * never load image bytes; items.image_id points at the current photo and
 * changes on every replace, which also busts client caches.
 */
export class ItemImages1740000000014 implements MigrationInterface {
  name = "ItemImages1740000000014";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists item_images (
        id uuid primary key default gen_random_uuid(),
        item_id uuid not null references items(id) on delete cascade,
        home_id uuid not null references homes(id) on delete cascade,
        mime_type varchar(32) not null,
        width int not null,
        height int not null,
        data bytea not null,
        created_at timestamptz not null default now()
      )
    `);
    await queryRunner.query(`
      create index if not exists item_images_item_idx on item_images (item_id)
    `);
    await queryRunner.query(`
      alter table items
        add column if not exists image_id uuid null references item_images(id) on delete set null
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table items drop column if exists image_id`);
    await queryRunner.query(`drop table if exists item_images`);
  }
}
