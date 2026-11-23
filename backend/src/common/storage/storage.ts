/**
 * Where files (photos, icons) are kept. The database stores only ids; keys are
 * always built from ids (see keys.ts), never stored, so moving storage never
 * needs a database change.
 */
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(keys: string[]): Promise<void>;
  /** An address the phone can load the file from for `seconds`. May be relative to the API. */
  signedUrl(key: string, seconds: number): Promise<string>;
}

export const STORAGE = Symbol("STORAGE");

/** "db" keeps photos in Postgres as before; a Storage is only used for "fs" and "s3". */
export type StorageDriver = "db" | "fs" | "s3";

/** A key may only contain these characters, and never ".." (no escaping the folder). */
export function assertSafeKey(key: string) {
  if (!/^[a-z0-9][a-z0-9/_.-]*$/i.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}
