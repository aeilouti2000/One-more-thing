import { MigrationInterface, QueryRunner } from "typeorm";

export class ManyHomes1740000000005 implements MigrationInterface {
  name = "ManyHomes1740000000005";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop index if exists home_members_one_home_per_user`);
    await queryRunner.query(`
      alter table users
      add column if not exists active_home_id uuid references homes (id) on delete set null
    `);
    await queryRunner.query(`
      update users as account
      set active_home_id = member.home_id
      from home_members as member
      where member.user_id = account.id
        and account.active_home_id is null
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table users drop column if exists active_home_id`);
    await queryRunner.query(`
      create unique index if not exists home_members_one_home_per_user on home_members (user_id)
    `);
  }
}
