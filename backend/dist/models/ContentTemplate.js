import mongoose from "mongoose";
const contentTemplateSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    text: { type: String, required: true },
    imageUrl: { type: String, required: false }
}, { timestamps: true });
contentTemplateSchema.index({ userId: 1, name: 1 }, { unique: true });
export const ContentTemplateModel = mongoose.models.ContentTemplate ||
    mongoose.model("ContentTemplate", contentTemplateSchema);
