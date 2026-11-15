import { QueryFailedError } from "typeorm";

/** Postgres refused a row that already exists (two requests raced past the check). */
export function isUniqueViolation(error: unknown) {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === "23505"
  );
}
