import { Mastra } from "@mastra/core/mastra";
import { MongoDBStore } from "@mastra/mongodb";

export const mastra = new Mastra({
  storage: new MongoDBStore({
    id: "shinobi",
    uri: process.env.MONGODB_URI ?? "mongodb://localhost:27017",
    dbName: process.env.MONGODB_DB ?? "shinobi",
  }),
});
