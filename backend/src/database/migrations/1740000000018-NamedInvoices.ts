import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Invoices (trip receipts) can be named, and can exist before a total is
 * entered (a named trip, or a trip an item was moved into).
 */
export class NamedInvoices1740000000018 implements MigrationInterface {
  name = "NamedInvoices1740000000018";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table trip_receipts
        add column if not exists name varchar(80) null,
        alter column total drop not null
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`update trip_receipts set total = 0 where total is null`);
    await queryRunner.query(`
      alter table trip_receipts
        alter column total set not null,
        drop column if exists name
    `);
  }
}
