import { badRequest } from "../utils/errors.js";
import { isoDate, oneOf, optional, phoneSearch, text, validate } from "../utils/validate.js";

const filterRules = {
  from: optional(isoDate()),
  to: optional(isoDate()),
  callerNumber: optional(phoneSearch()),
  receiverNumber: optional(phoneSearch()),
  city: optional(text({ min: 1, max: 80 })),
  direction: optional(oneOf(["inbound", "outbound"])),
  status: optional(oneOf(["successful", "failed"])),
};

export function parseFilters(query) {
  const filters = validate(query, filterRules);
  if (filters.from && filters.to && filters.from > filters.to) {
    throw badRequest("Some of the values sent are not valid.", [
      { field: "from", message: "from must be on or before to." },
    ]);
  }
  return filters;
}

// treat % and _ in searches as literal characters
const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

// builds a parameterised WHERE clause from the filters
export function buildWhere(filters, startIndex = 1) {
  const conditions = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    conditions.push(sql.replace("?", `$${startIndex + params.length - 1}`));
  };

  // whole days in UTC
  if (filters.from) add("start_time >= (?::date)::timestamp AT TIME ZONE 'UTC'", filters.from);
  if (filters.to) add("start_time < (?::date + 1)::timestamp AT TIME ZONE 'UTC'", filters.to);
  if (filters.callerNumber) add("caller_number LIKE ?", `%${filters.callerNumber}%`);
  if (filters.receiverNumber) add("receiver_number LIKE ?", `%${filters.receiverNumber}%`);
  if (filters.city) add("city ILIKE ?", `%${escapeLike(filters.city)}%`);
  if (filters.direction) add("direction = ?", filters.direction);
  if (filters.status) add("status = ?", filters.status);

  return {
    clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

// cache key
export function filtersKey(filters) {
  return Object.keys(filters)
    .sort()
    .map((key) => `${key}=${filters[key]}`)
    .join("&");
}
