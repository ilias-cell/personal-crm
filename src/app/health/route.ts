import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";

// Smoke-test endpoint for the deploy: 200 only when the app is running and the database answers.
// "version" is the commit the image was built from, so a deploy can tell the new version from the old one.
export async function GET() {
  // Read at request time: the answer must describe the running process, never a build-time snapshot.
  await connection();

  const headers = { "Cache-Control": "no-store" };
  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ status: "error" }, { status: 503, headers });
  }

  return Response.json({ status: "ok", version: process.env.APP_VERSION ?? "dev" }, { headers });
}
