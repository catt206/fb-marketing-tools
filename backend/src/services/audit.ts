import type { Env } from "../config/env.js";
import { AuditLogModel } from "../models/AuditLog.js";

export type AuditStatus = "SUCCESS" | "FAIL";

export async function writeAuditLog(params: {
  env: Env;
  userId: string;
  requestId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  status: AuditStatus;
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  await AuditLogModel.create({
    userId: params.userId,
    requestId: params.requestId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    status: params.status,
    message: params.message,
    metadata: params.metadata
  });
}

