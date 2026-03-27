import mongoose from "mongoose";

export async function connectMongo(mongodbUri: string): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongodbUri);
}

