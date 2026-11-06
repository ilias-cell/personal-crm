import "server-only";

// A failed query must not put contact data into the server log. Drizzle copies the query parameters
// (names, phones, emails, notes, search text) into its error message and into `params`, and PostgreSQL
// may quote a value in its own message, `detail` or `where`. So only what describes the failure is kept:
// the query text, where values are $1, $2 placeholders, and the error codes.

// Fields PostgreSQL fills from the schema and its own code, never from the data.
const SERVER_ERROR_FIELDS = [
  "code",
  "severity",
  "schema",
  "table",
  "column",
  "dataType",
  "constraint",
  "routine",
];

export function describeDbError(error: unknown): Record<string, unknown> {
  if (isQueryError(error)) {
    return { query: error.query, cause: describeCause(error.cause, { driverMessage: true }) };
  }
  return describeCause(error, { driverMessage: false });
}

// Recognised by its shape, not by instanceof DrizzleQueryError: a second copy of drizzle-orm
// (its ESM and CommonJS builds) has a class of its own, and the error would slip through with its message.
function isQueryError(error: unknown): error is { query: string; cause: unknown } {
  return (
    error instanceof Error &&
    typeof (error as { query?: unknown }).query === "string" &&
    Array.isArray((error as { params?: unknown }).params)
  );
}

function describeCause(
  error: unknown,
  { driverMessage }: { driverMessage: boolean },
): Record<string, unknown> {
  if (typeof error !== "object" || error === null) return { type: typeof error };
  const fields = error as Record<string, unknown>;

  // Reported by PostgreSQL itself (it always sets a severity): its message may quote a value, so codes and names only.
  if (typeof fields.severity === "string") {
    return Object.fromEntries(
      SERVER_ERROR_FIELDS.filter((key) => fields[key] !== undefined).map((key) => [
        key,
        fields[key],
      ]),
    );
  }
  // What failed under a query, the parameters already set aside: a connection or driver error
  // ("connect ECONNREFUSED 127.0.0.1:5432", "Connection terminated unexpectedly"), its message is fixed driver text.
  // Any other error may carry data in its message, so only its name and code.
  return driverMessage
    ? { name: fields.name, code: fields.code, message: fields.message }
    : { name: fields.name, code: fields.code };
}

// For reads whose errors reach Next.js, which logs an error from rendering whole: the error is replaced
// by one that keeps only the description above.
export async function withoutQueryData<T>(query: PromiseLike<T>): Promise<T> {
  try {
    return await query;
  } catch (error) {
    throw new Error("Database query failed", { cause: describeDbError(error) });
  }
}

// The PostgreSQL error code ("23505" unique violation, "23503" foreign key violation) behind a failed query, if any.
export function getDbErrorCode(error: unknown): string | undefined {
  const fields = error as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = fields?.cause?.code ?? fields?.code;
  return typeof code === "string" ? code : undefined;
}
