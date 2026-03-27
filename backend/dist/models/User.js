import mongoose from "mongoose";
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true }
}, { timestamps: true });
userSchema.set("toJSON", {
    transform(_doc, ret) {
        delete ret.passwordHash;
        return ret;
    }
});
export const UserModel = mongoose.models.User ||
    mongoose.model("User", userSchema);
