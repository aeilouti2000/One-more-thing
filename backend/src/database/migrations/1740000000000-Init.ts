import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1740000000000 implements MigrationInterface {
  name = "Init1740000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table users (
        id uuid primary key default gen_random_uuid(),
        email text not null unique,
        password_hash text not null,
        name text not null,
        email_verified_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await queryRunner.query(`
      create table email_tokens (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users (id) on delete cascade,
        token_hash text not null unique,
        expires_at timestamptz not null,
        used_at timestamptz,
        created_at timestamptz not null default now()
      )
    `);

    await queryRunner.query(`
      create table refresh_tokens (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users (id) on delete cascade,
        token_hash text not null unique,
        expires_at timestamptz not null,
        revoked_at timestamptz,
        created_at timestamptz not null default now()
      )
    `);

    await queryRunner.query(`
      create table homes (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        invite_code text not null unique,
        created_at timestamptz not null default now()
      )
    `);

    await queryRunner.query(`
      create table home_members (
        home_id uuid not null references homes (id) on delete cascade,
        user_id uuid not null references users (id) on delete cascade,
        role text not null check (role in ('owner', 'partner')),
        created_at timestamptz not null default now(),
        primary key (home_id, user_id)
      )
    `);

    await queryRunner.query(`
      create unique index home_members_one_home_per_user on home_members (user_id)
    `);

    await queryRunner.query(`
      create table items (
        id uuid primary key default gen_random_uuid(),
        home_id uuid not null references homes (id) on delete cascade,
        name text not null,
        quantity numeric(10, 2) not null check (quantity > 0),
        unit text,
        category text not null check (
          category in ('vegetables', 'meat', 'supermarket', 'pharmacy', 'coffee', 'other')
        ),
        notes text,
        status text not null default 'needed' check (status in ('needed', 'bought')),
        added_by uuid not null references users (id),
        bought_by uuid references users (id),
        created_at timestamptz not null default now(),
        bought_at timestamptz
      )
    `);

    await queryRunner.query(`
      create index items_home_status_idx on items (home_id, status)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop table if exists items`);
    await queryRunner.query(`drop table if exists home_members`);
    await queryRunner.query(`drop table if exists homes`);
    await queryRunner.query(`drop table if exists refresh_tokens`);
    await queryRunner.query(`drop table if exists email_tokens`);
    await queryRunner.query(`drop table if exists users`);
  }
}
