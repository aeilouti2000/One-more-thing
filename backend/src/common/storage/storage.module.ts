import { Controller, Get, Global, HttpStatus, Inject, Module, Param, Query, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import type { AppConfig } from "../../config/env";
import { DomainError } from "../domain.error";
import { FsStorage } from "./fs-storage";
import { S3Storage } from "./s3-storage";
import { STORAGE, type Storage } from "./storage";

/**
 * Provides STORAGE: the configured file store, or null while photos are still
 * kept in the database (STORAGE_DRIVER=db, the default).
 */
const storageProvider = {
  provide: STORAGE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>): Storage | null => {
    const driver = config.get("STORAGE_DRIVER", { infer: true });
    if (driver === "fs") {
      return new FsStorage(config.get("STORAGE_DIR", { infer: true }), config.get("JWT_ACCESS_SECRET", { infer: true }));
    }
    if (driver === "s3") {
      return new S3Storage(
        {
          endpoint: config.get("S3_ENDPOINT", { infer: true }),
          region: config.get("S3_REGION", { infer: true }),
          accessKeyId: config.get("S3_ACCESS_KEY_ID", { infer: true }),
          secretAccessKey: config.get("S3_SECRET_ACCESS_KEY", { infer: true }),
        },
        config.get("S3_BUCKET", { infer: true }),
      );
    }
    return null;
  },
};

/** Serves the "fs" driver's files through its signed addresses (development and tests). */
@SkipThrottle()
@Controller("local-files")
export class LocalFilesController {
  constructor(@Inject(STORAGE) private readonly storage: Storage | null) {}

  @Get("*key")
  async read(
    @Param("key") key: string | string[],
    @Query("e") expires: string,
    @Query("s") signature: string,
    @Res() res: Response,
  ) {
    const path = Array.isArray(key) ? key.join("/") : key;
    if (!(this.storage instanceof FsStorage) || !this.storage.verify(path, Number(expires), signature ?? "")) {
      throw new DomainError("NOT_FOUND", "Not found", HttpStatus.NOT_FOUND);
    }
    try {
      const body = await this.storage.get(path);
      res.set({
        "Content-Type": path.endsWith(".webp") ? "image/webp" : "image/jpeg",
        "Cache-Control": "private, max-age=3000",
      });
      res.send(body);
    } catch {
      throw new DomainError("NOT_FOUND", "Not found", HttpStatus.NOT_FOUND);
    }
  }
}

@Global()
@Module({
  controllers: [LocalFilesController],
  providers: [storageProvider],
  exports: [STORAGE],
})
export class StorageModule {}
