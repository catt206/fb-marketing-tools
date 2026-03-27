import mongoose, { type InferSchemaType } from "mongoose";

const userSettingsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    postsPerDayLimit: { type: Number, required: true },
    randomDelayMinSeconds: { type: Number, required: true },
    randomDelayMaxSeconds: { type: Number, required: true }
  },
  { timestamps: true }
);

export type UserSettings = InferSchemaType<typeof userSettingsSchema>;

export const UserSettingsModel =
  (mongoose.models.UserSettings as mongoose.Model<UserSettings>) ||
  mongoose.model<UserSettings>("UserSettings", userSettingsSchema);

