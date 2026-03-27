import mongoose, { type InferSchemaType } from "mongoose";

export type PostTargetType = "PAGE" | "GROUP";
export type PostJobStatus = "SCHEDULED" | "READY" | "POSTING" | "POSTED" | "FAILED" | "CANCELLED";

const postJobSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "FacebookAccount", required: true, index: true },
    targetType: { type: String, required: true, enum: ["PAGE", "GROUP"] },
    targetId: { type: String, required: true, index: true },

    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "ContentTemplate", required: false },
    message: { type: String, required: true },
    imageUrl: { type: String, required: false },

    scheduledAt: { type: Date, required: true, index: true },
    nextRunAt: { type: Date, required: true, index: true },

    status: { type: String, required: true, enum: ["SCHEDULED", "READY", "POSTING", "POSTED", "FAILED", "CANCELLED"], index: true },
    postedAt: { type: Date, required: false },
    fbPostId: { type: String, required: false },

    contentHash: { type: String, required: true, index: true },
    attempts: { type: Number, required: true, default: 0 },
    lastError: { type: String, required: false }
  },
  { timestamps: true }
);

postJobSchema.index({ status: 1, nextRunAt: 1 });

export type PostJob = InferSchemaType<typeof postJobSchema> & { _id: mongoose.Types.ObjectId };

export const PostJobModel =
  (mongoose.models.PostJob as mongoose.Model<PostJob>) || mongoose.model<PostJob>("PostJob", postJobSchema);
