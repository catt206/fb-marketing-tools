import mongoose, { type InferSchemaType } from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true }
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  transform(_doc, ret) {
    delete (ret as any).passwordHash;
    return ret;
  }
});

export type User = InferSchemaType<typeof userSchema>;

export const UserModel =
  (mongoose.models.User as mongoose.Model<User>) ||
  mongoose.model<User>("User", userSchema);
