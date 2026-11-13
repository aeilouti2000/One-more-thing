import { MigrationInterface, QueryRunner } from "typeorm";

/** The host can turn list notifications off for the whole home. */
export class HomeNotifications1740000000017 implements MigrationInterface {
  name = "HomeNotifications1740000000017";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table homes
        add column if not exists notifications_enabled boolean not null default true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table homes drop column if exists notifications_enabled`);
  }
}
