import { MongoClient } from "mongodb";
import type { Verdict } from "./verdict.ts";

export type FeatureRow = {
  openalexId: string;
  name: string;
  features: Record<string, number>;
  alphabetical: boolean;
  pulledAt: string;
};

const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017");
const db = client.db(process.env.MONGODB_DB ?? "shinobi");

export const professors = db.collection<Verdict>("professors");
export const features = db.collection<FeatureRow>("features");
export const models = db.collection<{ hash: string; fittedTrainSetId: string; rows: number; fittedAt: string }>("models");
