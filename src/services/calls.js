import { query } from "../db.js";
import { toCall } from "../utils/format.js";
import { buildWhere } from "./filters.js";

// whitelist of sortable columns
export const SORT_COLUMNS = {
  startTime: "start_time",
  duration: "duration_seconds",
  cost: "cost",
  callerName: "caller_name",
  city: "city",
};

export async function listCalls({ filters, page, limit, sort, order }) {
  const { clause, params } = buildWhere(filters);
  const column = SORT_COLUMNS[sort];
  const direction = order === "asc" ? "ASC" : "DESC";
  const offset = (page - 1) * limit;

  const [countResult, rowsResult] = await Promise.all([
    query(`SELECT count(*) AS total FROM calls ${clause}`, params),
    query(
      `SELECT * FROM calls ${clause}
       ORDER BY ${column} ${direction}, id ${direction}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
  ]);

  const totalItems = countResult.rows[0].total;
  return {
    data: rowsResult.rows.map(toCall),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    },
  };
}

export async function getCall(id) {
  const result = await query("SELECT * FROM calls WHERE id = $1", [id]);
  return result.rows[0] ? toCall(result.rows[0]) : null;
}
