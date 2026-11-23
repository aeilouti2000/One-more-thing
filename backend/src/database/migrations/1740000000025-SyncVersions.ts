import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * A change counter per home, so a phone can ask "what changed since N".
 *
 * homes.version goes up by one on every change to anything in the home, and
 * the changed row is stamped with the new number. The database does this with
 * triggers, so no write in the code can forget it. Deleted rows leave a marker
 * in home_deletions, so phones learn about deletions too.
 *
 * Two changes in one home wait for each other (both update the same homes
 * row), so numbers are never handed out, or become visible, out of order.
 *
 * `set local omt.skip_sync = 'on'` inside a transaction turns the triggers off
 * for that transaction; only one-off data migrations and the clean-up job use it.
 */
export class SyncVersions1740000000025 implements MigrationInterface {
  name = "SyncVersions1740000000025";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table homes
        add column if not exists version bigint not null default 0,
        add column if not exists sync_floor bigint not null default 0,
        add column if not exists timezone text
    `);
    for (const table of STAMPED_TABLES) {
      await queryRunner.query(
        `alter table ${table.name} add column if not exists version bigint not null default 0`,
      );
    }
    await queryRunner.query(`
      create table if not exists home_deletions (
        home_id    uuid        not null references homes (id) on delete cascade,
        entity     text        not null,
        entity_id  uuid        not null,
        version    bigint      not null,
        deleted_at timestamptz not null default now(),
        primary key (home_id, version)
      )
    `);
    // The clean-up job removes old markers by age.
    await queryRunner.query(`
      create index if not exists home_deletions_deleted_at_idx on home_deletions (deleted_at)
    `);

    await queryRunner.query(`
      create or replace function omt_stamp_version() returns trigger language plpgsql as $$
      declare v bigint;
      begin
        if current_setting('omt.skip_sync', true) = 'on' then
          if tg_op = 'DELETE' then return old; end if;
          return new;
        end if;
        if tg_op = 'DELETE' then
          update homes set version = version + 1 where id = old.home_id returning version into v;
          -- v is null while the home itself is being deleted: no marker is needed then.
          if v is not null then
            insert into home_deletions (home_id, entity, entity_id, version)
            values (old.home_id, tg_argv[0], old.id, v);
          end if;
          return old;
        end if;
        -- An update that changes nothing is not a change: no number, nothing to send.
        if tg_op = 'UPDATE' and new is not distinct from old then
          return new;
        end if;
        update homes set version = version + 1 where id = new.home_id returning version into v;
        new.version := coalesce(v, new.version);
        return new;
      end $$
    `);
    await queryRunner.query(`
      create or replace function omt_bump_home() returns trigger language plpgsql as $$
      declare h uuid;
      begin
        if current_setting('omt.skip_sync', true) = 'on' then return null; end if;
        if tg_op = 'DELETE' then h := old.home_id; else h := new.home_id; end if;
        update homes set version = version + 1 where id = h;
        return null;
      end $$
    `);
    await queryRunner.query(`
      create or replace function omt_home_version() returns trigger language plpgsql as $$
      begin
        if new.version = old.version then new.version := old.version + 1; end if;
        return new;
      end $$
    `);

    await queryRunner.query(`drop trigger if exists homes_version on homes`);
    await queryRunner.query(`
      create trigger homes_version before update on homes
        for each row execute function omt_home_version()
    `);
    for (const table of STAMPED_TABLES) {
      await queryRunner.query(`drop trigger if exists ${table.name}_version on ${table.name}`);
      await queryRunner.query(`
        create trigger ${table.name}_version before insert or update or delete on ${table.name}
          for each row execute function omt_stamp_version('${table.entity}')
      `);
    }
    for (const table of BUMP_TABLES) {
      await queryRunner.query(`drop trigger if exists ${table.name}_bump on ${table.name}`);
      await queryRunner.query(`
        create trigger ${table.name}_bump after ${table.events} on ${table.name}
          for each row execute function omt_bump_home()
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of BUMP_TABLES) {
      await queryRunner.query(`drop trigger if exists ${table.name}_bump on ${table.name}`);
    }
    for (const table of STAMPED_TABLES) {
      await queryRunner.query(`drop trigger if exists ${table.name}_version on ${table.name}`);
      await queryRunner.query(`alter table ${table.name} drop column if exists version`);
    }
    await queryRunner.query(`drop trigger if exists homes_version on homes`);
    await queryRunner.query(`drop function if exists omt_home_version()`);
    await queryRunner.query(`drop function if exists omt_bump_home()`);
    await queryRunner.query(`drop function if exists omt_stamp_version()`);
    await queryRunner.query(`drop table if exists home_deletions`);
    await queryRunner.query(`
      alter table homes drop column if exists timezone, drop column if exists sync_floor, drop column if exists version
    `);
  }
}

/** Rows that carry their own version. `entity` is the name phones see in deletion markers. */
const STAMPED_TABLES = [
  { name: "items", entity: "item" },
  { name: "lists", entity: "list" },
  { name: "staples", entity: "pin" },
  { name: "item_sets", entity: "set" },
  { name: "custom_home_categories", entity: "category" },
  { name: "trip_receipts", entity: "trip" },
] as const;

/** Small sets that are sent whole: a change only moves the home's counter. */
const BUMP_TABLES = [
  { name: "hidden_home_categories", events: "insert or delete" },
  { name: "home_members", events: "insert or update or delete" },
  // Not on update: the heartbeat every 15 s must not count as a change.
  { name: "list_shop_locks", events: "insert or delete" },
  { name: "shop_asks", events: "insert or update or delete" },
] as const;
