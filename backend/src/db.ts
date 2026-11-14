
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("В файле .env не указан DATABASE_URL");
}

export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
