import { MongoClient, type ObjectId } from "mongodb";
import type { Verdict } from "./verdict.ts";
import type { Grant } from "./tools/grants.ts";

export type FeatureRow = {
  openalexId: string;
  name: string;
  features: Record<string, number>;
  alphabetical: boolean;
  status?: "recruiting" | "not_recruiting" | "unstated" | null; // the hand label, when this professor is in the labeled table
  works?: number;
  grants?: Grant[];
  pulledAt: string;
};

const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017");
const db = client.db(process.env.MONGODB_DB ?? "shinobi");

export const features = db.collection<FeatureRow>("features");
export type User = { _id?: ObjectId; email: string; passwordHash: string; createdAt: string };
export type Check = { userId: string; query: string; name: string; verdict: Verdict; createdAt: string };
export const users = db.collection<User>("users");
export const checks = db.collection<Check>("checks");
export const models = db.collection<{ hash: string; fittedTrainSetId: string; rows: number; fittedAt: string }>("models");
