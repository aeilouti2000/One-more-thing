import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Refresh tokens are replaced on every use. Each new token remembers the one
 * it came from, and a replaced token is marked, so a lost answer can be asked
 * for again while a token that was replaced long ago is refused.
 */
export class RotateRefreshTokens1740000000022 implements MigrationInterface {
  name = "RotateRefreshTokens1740000000022";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table refresh_tokens
        add column if not exists parent_id uuid null
          references refresh_tokens(id) on delete set null,
        add column if not exists superseded_at timestamptz null
    `);
    await queryRunner.query(`
      create index if not exists refresh_tokens_user_id_idx on refresh_tokens (user_id)
    `);
    await queryRunner.query(`
      create index if not exists refresh_tokens_parent_id_idx on refresh_tokens (parent_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop index if exists refresh_tokens_parent_id_idx`);
    await queryRunner.query(`drop index if exists refresh_tokens_user_id_idx`);
    await queryRunner.query(`
      alter table refresh_tokens
        drop column if exists superseded_at,
        drop column if exists parent_id
    `);
  }
}
