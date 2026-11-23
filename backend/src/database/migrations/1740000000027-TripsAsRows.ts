import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Every shopping trip becomes a row in trip_receipts.
 *
 * Until now a trip was a row only once it was named or priced; the app guessed
 * the rest from the time between purchases. That guess cannot work with
 * History coming from the server one page at a time, so existing purchases are
 * grouped once here, the same way the app groups them: same home and list,
 * each bought within 90 minutes of the one before.
 *
 * The meaning of trip_receipts.total does not change: null means "no trip
 * total entered; the items' own prices count".
 */
export class TripsAsRows1740000000027 implements MigrationInterface {
  name = "TripsAsRows1740000000027";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A one-off regrouping: phones get everything fresh, so no versions are stamped.
    await queryRunner.query(`set local omt.skip_sync = 'on'`);
    await queryRunner.query(`
      alter table trip_receipts
        add column if not exists started_at     timestamptz,
        add column if not exists last_bought_at timestamptz
    `);

    // Existing invoices take their times from their items.
    await queryRunner.query(`
      update trip_receipts r
         set started_at     = coalesce(x.first_at, r.created_at),
             last_bought_at = coalesce(x.last_at,  r.created_at)
        from (select receipt_id, min(bought_at) as first_at, max(bought_at) as last_at
                from items where receipt_id is not null group by receipt_id) x
       where x.receipt_id = r.id
    `);
    await queryRunner.query(`
      update trip_receipts set started_at = created_at, last_bought_at = created_at
       where started_at is null
    `);

    await queryRunner.query(`
      create temp table trip_seed_item on commit drop as
      with loose as (
        select id, home_id, list_id, bought_at,
               case when lag(bought_at) over w is null
                      or bought_at - lag(bought_at) over w > interval '90 minutes' then 1 else 0 end as starts
          from items
         where status = 'bought' and receipt_id is null and bought_at is not null
        window w as (partition by home_id, list_id order by bought_at, id)
      )
      select id as item_id, home_id, list_id, bought_at,
             sum(starts) over (partition by home_id, list_id order by bought_at, id) as grp
        from loose
    `);
    await queryRunner.query(`
      create temp table trip_seed_trip on commit drop as
      select home_id, list_id, grp, gen_random_uuid() as trip_id,
             min(bought_at) as started_at, max(bought_at) as last_bought_at
        from trip_seed_item
       group by home_id, list_id, grp
    `);
    await queryRunner.query(`
      insert into trip_receipts (id, home_id, list_id, created_at, started_at, last_bought_at)
      select trip_id, home_id, list_id, started_at, started_at, last_bought_at from trip_seed_trip
    `);
    await queryRunner.query(`
      update items i set receipt_id = t.trip_id
        from trip_seed_item s join trip_seed_trip t using (home_id, list_id, grp)
       where i.id = s.item_id
    `);

    // Code written before this change creates trips without these times: the
    // database fills them, and newer code sets them from the items.
    await queryRunner.query(`
      alter table trip_receipts
        alter column started_at set default now(),
        alter column last_bought_at set default now(),
        alter column started_at set not null,
        alter column last_bought_at set not null
    `);
    await queryRunner.query(`
      create index if not exists trip_receipts_home_started_idx
        on trip_receipts (home_id, started_at desc, id desc)
    `);
    await queryRunner.query(`drop index if exists trip_receipts_home_idx`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create index if not exists trip_receipts_home_idx on trip_receipts (home_id, created_at desc)
    `);
    await queryRunner.query(`drop index if exists trip_receipts_home_started_idx`);
    await queryRunner.query(`
      alter table trip_receipts drop column if exists last_bought_at, drop column if exists started_at
    `);
  }
}
