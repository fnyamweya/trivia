/**
 * D1 Database Helpers
 * 
 * Provides type-safe query utilities and common patterns for D1.
 */

/**
 * Execute a query and return all results with type safety
 */
export async function queryAll<T>(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.results;
}

/**
 * Execute a query and return the first result
 */
export async function queryOne<T>(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const result = await db.prepare(sql).bind(...params).first<T>();
  return result ?? null;
}

/**
 * Execute a query that doesn't return results (INSERT, UPDATE, DELETE)
 */
export async function execute(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<D1Result> {
  return await db.prepare(sql).bind(...params).run();
}

/**
 * Execute multiple statements in a batch (transaction-like)
 */
export async function batch(
  db: D1Database,
  statements: D1PreparedStatement[]
): Promise<D1Result[]> {
  return await db.batch(statements);
}

/**
 * Generate a cursor for pagination
 */
export function encodeCursor(value: string | number, id: string): string {
  return Buffer.from(JSON.stringify({ v: value, id })).toString('base64url');
}

/**
 * Decode a pagination cursor
 */
export function decodeCursor(cursor: string): { v: string | number; id: string } | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString());
  } catch {
    return null;
  }
}

/**
 * Build a cursor-based pagination query
 */
export function buildPaginatedQuery(
  baseQuery: string,
  cursor: string | undefined,
  sortColumn: string,
  sortDirection: 'ASC' | 'DESC' = 'DESC',
  limit: number = 20
): { sql: string; params: unknown[] } {
  let sql = baseQuery;
  const params: unknown[] = [];

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      const operator = sortDirection === 'DESC' ? '<' : '>';
      sql += ` AND (${sortColumn}, id) ${operator} (?, ?)`;
      params.push(decoded.v, decoded.id);
    }
  }

  sql += ` ORDER BY ${sortColumn} ${sortDirection}, id ${sortDirection}`;
  sql += ` LIMIT ?`;
  params.push(limit + 1); // Fetch one extra to check if there are more

  return { sql, params };
}

/**
 * Process paginated results
 */
export function processPaginatedResults<T extends { id: string }>(
  results: T[],
  limit: number,
  sortColumn: keyof T
): { data: T[]; cursor?: string; hasMore: boolean } {
  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  
  let cursor: string | undefined;
  if (hasMore && data.length > 0) {
    const lastItem = data[data.length - 1];
    cursor = encodeCursor(String(lastItem[sortColumn]), lastItem.id);
  }

  return { data, cursor, hasMore };
}

/**
 * Generate a join code for sessions
 */
export function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Check if a join code is already in use
 */
export async function isJoinCodeAvailable(
  db: D1Database,
  joinCode: string
): Promise<boolean> {
  const existing = await queryOne<{ id: string }>(
    db,
    `SELECT id FROM sessions WHERE join_code = ? AND status NOT IN ('completed', 'cancelled')`,
    [joinCode]
  );
  return existing === null;
}

/**
 * Generate a unique join code
 */
export async function generateUniqueJoinCode(db: D1Database): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const code = generateJoinCode();
    if (await isJoinCodeAvailable(db, code)) {
      return code;
    }
    attempts++;
  }

  // Fallback: include timestamp hash for uniqueness
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  return generateJoinCode().slice(0, 2) + timestamp;
}
