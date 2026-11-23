import { IsOptional, IsUUID } from "class-validator";

export class MaintenanceRunQueryDto {
  /** Continue after this home (the `next` of the previous call). */
  @IsOptional()
  @IsUUID()
  after?: string;
}
