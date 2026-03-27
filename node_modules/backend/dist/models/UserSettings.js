import mongoose from "mongoose";
const userSettingsSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    postsPerDayLimit: { type: Number, required: true },
    randomDelayMinSeconds: { type: Number, required: true },
    randomDelayMaxSeconds: { type: Number, required: true }
}, { timestamps: true });
export const UserSettingsModel = mongoose.models.UserSettings ||
    mongoose.model("UserSettings", userSettingsSchema);
