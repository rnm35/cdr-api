import pg from "pg";
import { config } from "./config.js";

// return counts and sums as numbers instead of strings
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export function query(text, params = []) {
  return pool.query(text, params);
}
