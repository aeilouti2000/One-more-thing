import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertSafeKey, type Storage } from "./storage";

/**
 * Files in a local folder, for development and tests. Its signed addresses
 * point at the API (`/api/local-files/...`) and carry an expiry and a
 * signature, like a bucket's do.
 */
export class FsStorage implements Storage {
  private readonly root: string;

  constructor(root: string, private readonly secret: string) {
    this.root = resolve(root);
  }

  async put(key: string, body: Buffer) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  get(key: string) {
    return readFile(this.path(key));
  }

  async delete(keys: string[]) {
    await Promise.all(keys.map((key) => rm(this.path(key), { force: true })));
  }

  async signedUrl(key: string, seconds: number) {
    assertSafeKey(key);
    const expires = Math.floor(Date.now() / 1000) + seconds;
    return `/api/local-files/${key}?e=${expires}&s=${this.sign(key, expires)}`;
  }

  /** True when the signature is right and not expired. */
  verify(key: string, expires: number, signature: string) {
    if (!Number.isFinite(expires) || expires < Date.now() / 1000) return false;
    const expected = Buffer.from(this.sign(key, expires));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private sign(key: string, expires: number) {
    return createHmac("sha256", this.secret).update(`${key}:${expires}`).digest("base64url");
  }

  private path(key: string) {
    assertSafeKey(key);
    const path = join(this.root, key);
    if (!path.startsWith(this.root)) throw new Error(`Unsafe storage key: ${key}`);
    return path;
  }
}
