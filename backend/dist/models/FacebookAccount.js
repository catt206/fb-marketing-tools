import mongoose from "mongoose";
const facebookAccountSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fbUserId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    userAccessToken: { type: String, required: false },
    userAccessTokenCiphertext: { type: String, required: false },
    userAccessTokenIv: { type: String, required: false },
    userAccessTokenTag: { type: String, required: false },
    tokenExpiresAt: { type: Date, required: true },
    scopes: { type: [String], required: true, default: [] }
}, { timestamps: true });
facebookAccountSchema.index({ userId: 1, fbUserId: 1 }, { unique: true });
facebookAccountSchema.set("toJSON", {
    transform(_doc, ret) {
        delete ret.userAccessToken;
        delete ret.userAccessTokenCiphertext;
        delete ret.userAccessTokenIv;
        delete ret.userAccessTokenTag;
        return ret;
    }
});
export const FacebookAccountModel = mongoose.models.FacebookAccount ||
    mongoose.model("FacebookAccount", facebookAccountSchema);
