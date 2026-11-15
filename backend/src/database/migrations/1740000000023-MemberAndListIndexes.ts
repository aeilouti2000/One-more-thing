import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * "Which homes is this person in" and "which lists does this home have" are
 * asked on almost every request, and neither had an index to answer from.
 */
export class MemberAndListIndexes1740000000023 implements MigrationInterface {
  name = "MemberAndListIndexes1740000000023";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create index if not exists home_members_user_id_idx on home_members (user_id)
    `);
    await queryRunner.query(`
      create index if not exists lists_home_id_idx on lists (home_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop index if exists lists_home_id_idx`);
    await queryRunner.query(`drop index if exists home_members_user_id_idx`);
  }
}
