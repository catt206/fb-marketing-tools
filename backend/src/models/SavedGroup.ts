import mongoose, { type InferSchemaType } from "mongoose";

const savedGroupSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    groupId: { type: String, required: true, index: true },
    name: { type: String, required: false }
  },
  { timestamps: true }
);

savedGroupSchema.index({ userId: 1, groupId: 1 }, { unique: true });

export type SavedGroup = InferSchemaType<typeof savedGroupSchema>;

export const SavedGroupModel =
  (mongoose.models.SavedGroup as mongoose.Model<SavedGroup>) || mongoose.model<SavedGroup>("SavedGroup", savedGroupSchema);

