import mongoose, { type InferSchemaType } from "mongoose";

const contentTemplateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    text: { type: String, required: true },
    imageUrl: { type: String, required: false }
  },
  { timestamps: true }
);

contentTemplateSchema.index({ userId: 1, name: 1 }, { unique: true });

export type ContentTemplate = InferSchemaType<typeof contentTemplateSchema>;

export const ContentTemplateModel =
  (mongoose.models.ContentTemplate as mongoose.Model<ContentTemplate>) ||
  mongoose.model<ContentTemplate>("ContentTemplate", contentTemplateSchema);

