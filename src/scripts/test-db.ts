import { checkDatabaseConnection } from "../lib/database.js";

const testDatabase = async (): Promise<void> => {
  try {
    await checkDatabaseConnection();

    console.log("✅ PostgreSQL connection successful");
  } catch (error) {
    console.error("❌ PostgreSQL connection failed");

    console.error(error);

    process.exitCode = 1;
  }
};

await testDatabase();