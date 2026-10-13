import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

// CHECK constraints are static DDL, not a parameterized query — the values
// must be inlined as SQL literals via sql.raw(), not interpolated as `${value}`
// (which drizzle would otherwise bind as a query parameter, producing an
// invalid "in ($1, $2)" CHECK clause with no way to supply the bindings).
export function enumCheck(column: AnyPgColumn, values: readonly string[]) {
  const quotedList = values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ");
  return sql`${column} in (${sql.raw(quotedList)})`;
}
