import { Transform } from "class-transformer";

/** Trims a string before it is validated, so "   " fails a minimum length. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value));
