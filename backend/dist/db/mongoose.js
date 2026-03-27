import mongoose from "mongoose";
export async function connectMongo(mongodbUri) {
    mongoose.set("strictQuery", true);
    await mongoose.connect(mongodbUri);
}
