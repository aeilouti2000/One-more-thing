import { Global, Module } from "@nestjs/common";
import { JobLock } from "./job-lock";

/** Helpers every module may use. */
@Global()
@Module({
  providers: [JobLock],
  exports: [JobLock],
})
export class CommonModule {}
