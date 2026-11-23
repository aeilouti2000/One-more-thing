# Performance lab

A separate test database (`omt_perf`) in the local Docker Postgres, filled with fake data at the size of a large app. The development database (`omt`) is not touched.

| File | What it does |
| --- | --- |
| `seed.sql` | Empties `omt_perf` and fills it: 30,000 homes, about 5 million items. Takes about 2 minutes. |
| `d3-history.sql` | Runs one History page without and with its index, and prints both query plans. |

Create and fill the database (once):

```sh
docker exec backend-db-1 psql -U omt -d postgres -c "create database omt_perf"
docker exec backend-db-1 sh -c "pg_dump -U omt --schema-only omt | psql -q -U omt omt_perf"
docker exec -i backend-db-1 psql -q -U omt -d omt_perf < docs/perf-lab/seed.sql
```

Run a lesson:

```sh
docker exec -i backend-db-1 psql -U omt -d omt_perf < docs/perf-lab/d3-history.sql
```

Remove the test database (frees about 1.8 GB):

```sh
docker exec backend-db-1 psql -U omt -d postgres -c "drop database omt_perf"
```
