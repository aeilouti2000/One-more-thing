import { MigrationInterface, QueryRunner } from "typeorm";

export class SoftDeleteLists1740000000010 implements MigrationInterface {
  name = "SoftDeleteLists1740000000010";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table lists
        add column if not exists deleted_at timestamptz null
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table lists drop column if exists deleted_at`);
  }
}
