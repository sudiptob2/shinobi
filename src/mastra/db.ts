import { MongoClient, type ObjectId } from "mongodb";
import type { Verdict } from "./verdict.ts";

const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017");
const db = client.db(process.env.MONGODB_DB ?? "shinobi");

export type User = { _id?: ObjectId; email: string; passwordHash: string; createdAt: string };
export type Check = { userId: string; query: string; name: string; verdict: Verdict; createdAt: string };
export const users = db.collection<User>("users");
export const checks = db.collection<Check>("checks");
