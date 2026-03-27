import { AuditLogModel } from "../models/AuditLog.js";
export async function writeAuditLog(params) {
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
