import mongoose, { type InferSchemaType } from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requestId: { type: String, required: false, index: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: false, index: true },
    entityId: { type: String, required: false, index: true },
    status: { type: String, required: true, enum: ["SUCCESS", "FAIL"] },
    message: { type: String, required: false },
    metadata: { type: mongoose.Schema.Types.Mixed, required: false }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ userId: 1, createdAt: -1 });

export type AuditLog = InferSchemaType<typeof auditLogSchema>;

export const AuditLogModel =
  (mongoose.models.AuditLog as mongoose.Model<AuditLog>) || mongoose.model<AuditLog>("AuditLog", auditLogSchema);

