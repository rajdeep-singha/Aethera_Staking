/**
 * Neon (Postgres) connection.
 *
 * Uses @neondatabase/serverless's HTTP query function (`neon()`), which returns a
 * tagged-template `sql` helper. This is ideal for the registration tracker: queries
 * are small and infrequent, and it needs no long-lived connection pool.
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "[db.config] DATABASE_URL is not set. Add your Neon connection string to server/.env",
  );
}

export const sql = neon(DATABASE_URL);
