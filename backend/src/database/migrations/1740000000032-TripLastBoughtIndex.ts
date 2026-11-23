import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Finds a home's trips by their last purchase time. Two frequent queries need it:
 *
 * - Every purchase looks for the open trip of its list: a trip whose last
 *   purchase was at most 90 minutes ago (TripsService.attachNewPurchases).
 * - Every changes answer with rows sends the trips of the phone's window
 *   (last_bought_at >= start of last month) that changed (SyncRepository.trips).
 *
 * Without it both read every trip the home ever had through
 * trip_receipts_home_started_idx and throw nearly all away. Measured on the
 * lab (step 12, 4.3 million trips): the trip lookup on purchase went from 658
 * pages to 3, the changes trip read from 655 pages to 105 (busy home), and
 * from 1,881 to 3 and 98 for a home with three years of history.
 *
 * Built in the migration's transaction: trip_receipts is small in production.
 */
export class TripLastBoughtIndex1740000000032 implements MigrationInterface {
  name = "TripLastBoughtIndex1740000000032";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create index if not exists trip_receipts_home_last_idx
        on trip_receipts (home_id, last_bought_at desc)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop index if exists trip_receipts_home_last_idx`);
  }
}
