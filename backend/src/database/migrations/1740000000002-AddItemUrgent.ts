import { MigrationInterface, QueryRunner } from "typeorm";

export class AddItemUrgent1740000000002 implements MigrationInterface {
  name = "AddItemUrgent1740000000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table items
      add column if not exists urgent boolean not null default false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table items drop column if exists urgent`);
  }
}
