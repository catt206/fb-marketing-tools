import mongoose, { type InferSchemaType } from "mongoose";

const dailyUsageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "FacebookAccount", required: true, index: true },
    dateKey: { type: String, required: true, index: true },
    postsCount: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
);

dailyUsageSchema.index({ userId: 1, accountId: 1, dateKey: 1 }, { unique: true });

export type DailyUsage = InferSchemaType<typeof dailyUsageSchema>;

export const DailyUsageModel =
  (mongoose.models.DailyUsage as mongoose.Model<DailyUsage>) ||
  mongoose.model<DailyUsage>("DailyUsage", dailyUsageSchema);

