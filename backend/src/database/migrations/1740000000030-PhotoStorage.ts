import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Photos move out of Postgres into object storage.
 *
 * item_images keeps only facts about a photo (size, dimensions, a tiny
 * placeholder hash); `storage` says where its bytes are: 'db' (the data
 * column, as before) or 'object' (a bucket). Rows stay 'db' until the copy
 * endpoint moves them; the data column is dropped later, once every row moved.
 *
 * storage_trash: when a photo row is deleted for any reason (replaced, its
 * item or home deleted, its month cleaned), a trigger records its files here
 * and the daily job deletes exactly those, so no file is left behind.
 */
export class PhotoStorage1740000000030 implements MigrationInterface {
  name = "PhotoStorage1740000000030";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table item_images
        alter column data drop not null,
        add column if not exists storage     text not null default 'db',
        add column if not exists bytes       integer,
        add column if not exists thumb_bytes integer,
        add column if not exists thumbhash   text
    `);
    await queryRunner.query(`update item_images set bytes = octet_length(data) where data is not null and bytes is null`);
    await queryRunner.query(`create index if not exists item_images_home_idx on item_images (home_id)`);

    await queryRunner.query(`
      create table if not exists storage_trash (
        key        text primary key,
        created_at timestamptz not null default now()
      )
    `);
    await queryRunner.query(`
      create or replace function omt_trash_photo_files() returns trigger language plpgsql as $$
      begin
        if old.storage = 'object' then
          insert into storage_trash (key) values
            ('homes/' || old.home_id || '/photos/' || old.id || '/full.jpg'),
            ('homes/' || old.home_id || '/photos/' || old.id || '/thumb.jpg')
          on conflict do nothing;
        end if;
        return null;
      end $$
    `);
    await queryRunner.query(`drop trigger if exists item_images_trash on item_images`);
    await queryRunner.query(`
      create trigger item_images_trash after delete on item_images
        for each row execute function omt_trash_photo_files()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop trigger if exists item_images_trash on item_images`);
    await queryRunner.query(`drop function if exists omt_trash_photo_files()`);
    await queryRunner.query(`drop table if exists storage_trash`);
    await queryRunner.query(`drop index if exists item_images_home_idx`);
    await queryRunner.query(`
      alter table item_images
        drop column if exists thumbhash, drop column if exists thumb_bytes,
        drop column if exists bytes, drop column if exists storage
    `);
  }
}
