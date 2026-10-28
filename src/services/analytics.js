import { query } from "../db.js";
import { badRequest } from "../utils/errors.js";
import { maskNumber, round2 } from "../utils/format.js";
import { buildWhere } from "./filters.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const INTERVAL_MS = { hour: HOUR_MS, day: DAY_MS, week: 7 * DAY_MS, month: 30 * DAY_MS };
const MAX_TIMELINE_POINTS = 1000;

const DURATION_BUCKET_SECONDS = 600; // 10-minute ranges
const DURATION_BUCKETS = 9; // 0-10, 10-20, ... 70-80, then 80+ minutes

const percent = (part, whole) => (whole ? round2((part / whole) * 100) : 0);

export async function getSummary(filters) {
  const { clause, params } = buildWhere(filters);
  const { rows } = await query(
    `SELECT count(*) AS total_calls,
            coalesce(sum(duration_seconds), 0) AS total_duration,
            coalesce(avg(duration_seconds), 0) AS average_duration,
            coalesce(sum(cost), 0) AS total_cost,
            coalesce(avg(cost), 0) AS average_cost,
            count(*) FILTER (WHERE status = 'successful') AS successful,
            count(*) FILTER (WHERE status = 'failed') AS failed,
            count(*) FILTER (WHERE direction = 'inbound') AS inbound,
            count(*) FILTER (WHERE direction = 'outbound') AS outbound,
            min(start_time) AS first_call,
            max(start_time) AS last_call
     FROM calls ${clause}`,
    params
  );
  const row = rows[0];
  const totalCalls = Number(row.total_calls);
  return {
    totalCalls,
    totalDurationSeconds: Number(row.total_duration),
    averageDurationSeconds: round2(row.average_duration),
    totalCost: round2(row.total_cost),
    averageCost: round2(row.average_cost),
    successfulCalls: Number(row.successful),
    failedCalls: Number(row.failed),
    successRate: percent(Number(row.successful), totalCalls),
    inboundCalls: Number(row.inbound),
    outboundCalls: Number(row.outbound),
    firstCall: row.first_call ? new Date(row.first_call).toISOString() : null,
    lastCall: row.last_call ? new Date(row.last_call).toISOString() : null,
  };
}

export async function getCallTypes(filters) {
  const { clause, params } = buildWhere(filters);
  const { rows } = await query(
    `SELECT direction,
            count(*) AS calls,
            count(*) FILTER (WHERE status = 'successful') AS successful
     FROM calls ${clause}
     GROUP BY direction`,
    params
  );
  const total = rows.reduce((sum, row) => sum + Number(row.calls), 0);
  return ["inbound", "outbound"].map((type) => {
    const row = rows.find((r) => r.direction === type);
    const calls = row ? Number(row.calls) : 0;
    const successful = row ? Number(row.successful) : 0;
    return { type, calls, successful, failed: calls - successful, percentage: percent(calls, total) };
  });
}

const TOP_CALLER_ORDER = {
  calls: "calls DESC, total_duration DESC",
  duration: "total_duration DESC, calls DESC",
  cost: "total_cost DESC, calls DESC",
};

export async function getTopCallers(filters, { by = "duration", limit = 10 } = {}, role = "admin") {
  const { clause, params } = buildWhere(filters);
  const { rows } = await query(
    `SELECT caller_number, caller_name,
            count(*) AS calls,
            sum(duration_seconds) AS total_duration,
            sum(cost) AS total_cost
     FROM calls ${clause}
     GROUP BY caller_number, caller_name
     ORDER BY ${TOP_CALLER_ORDER[by]}, caller_number
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );
  return rows.map((row) => ({
    callerName: row.caller_name,
    callerNumber: role === "admin" ? row.caller_number : maskNumber(row.caller_number),
    calls: Number(row.calls),
    totalDurationSeconds: Number(row.total_duration),
    totalCost: round2(row.total_cost),
  }));
}

function autoInterval(spanMs) {
  if (spanMs <= 3 * DAY_MS) return "hour";
  if (spanMs <= 92 * DAY_MS) return "day";
  if (spanMs <= 400 * DAY_MS) return "week";
  return "month";
}

export async function getTimeline(filters, { interval = "auto" } = {}, bounds) {
  const { clause, params } = buildWhere(filters);

  let first = bounds?.firstCall;
  let last = bounds?.lastCall;
  if (bounds === undefined) {
    const { rows } = await query(
      `SELECT min(start_time) AS first_call, max(start_time) AS last_call FROM calls ${clause}`,
      params
    );
    first = rows[0].first_call;
    last = rows[0].last_call;
  }
  if (!first || !last) return { interval: interval === "auto" ? "day" : interval, points: [] };

  const spanMs = new Date(last) - new Date(first);
  const unit = interval === "auto" ? autoInterval(spanMs) : interval;
  if (spanMs / INTERVAL_MS[unit] > MAX_TIMELINE_POINTS) {
    throw badRequest(`Grouping by ${unit} would return too many points. Choose a larger interval or a shorter date range.`, [
      { field: "interval", message: "Too many points for this date range." },
    ]);
  }

  const u = params.length + 1; // the interval name
  const a = params.length + 2; // first call time
  const b = params.length + 3; // last call time
  // generate_series fills empty buckets with 0
  const { rows } = await query(
    `WITH counts AS (
       SELECT date_trunc($${u}, start_time AT TIME ZONE 'UTC') AS bucket,
              count(*) AS calls, sum(cost) AS cost, sum(duration_seconds) AS duration
       FROM calls ${clause}
       GROUP BY 1
     ),
     series AS (
       SELECT generate_series(
         date_trunc($${u}, $${a}::timestamptz AT TIME ZONE 'UTC'),
         date_trunc($${u}, $${b}::timestamptz AT TIME ZONE 'UTC'),
         ('1 ' || $${u})::interval
       ) AS bucket
     )
     SELECT to_char(s.bucket, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS bucket,
            coalesce(c.calls, 0) AS calls,
            coalesce(c.cost, 0) AS cost,
            coalesce(c.duration, 0) AS duration
     FROM series s LEFT JOIN counts c ON c.bucket = s.bucket
     ORDER BY s.bucket`,
    [...params, unit, new Date(first).toISOString(), new Date(last).toISOString()]
  );

  return {
    interval: unit,
    points: rows.map((row) => ({
      bucket: row.bucket,
      calls: Number(row.calls),
      totalCost: round2(row.cost),
      totalDurationSeconds: Number(row.duration),
    })),
  };
}

export async function getCities(filters, { limit = 10 } = {}) {
  const { clause, params } = buildWhere(filters);
  const limitParam = `$${params.length + 1}`;
  const [distinct, byCalls, byCost] = await Promise.all([
    query(`SELECT count(DISTINCT city) AS cities FROM calls ${clause}`, params),
    query(
      `SELECT city, count(*) AS calls, sum(cost) AS cost FROM calls ${clause}
       GROUP BY city ORDER BY calls DESC, cost DESC, city LIMIT ${limitParam}`,
      [...params, limit]
    ),
    query(
      `SELECT city, count(*) AS calls, sum(cost) AS cost FROM calls ${clause}
       GROUP BY city ORDER BY cost DESC, city LIMIT ${limitParam}`,
      [...params, limit]
    ),
  ]);
  const toRow = (row) => ({ city: row.city, calls: Number(row.calls), totalCost: round2(row.cost) });
  return {
    distinctCities: Number(distinct.rows[0].cities),
    byCalls: byCalls.rows.map(toRow),
    byCost: byCost.rows.map(toRow),
  };
}

export async function getDurations(filters) {
  const { clause, params } = buildWhere(filters);
  const last = DURATION_BUCKETS - 1;
  const [buckets, longest, shortest] = await Promise.all([
    query(
      `SELECT least(duration_seconds / ${DURATION_BUCKET_SECONDS}, ${last}) AS bucket, count(*) AS calls
       FROM calls ${clause}
       GROUP BY 1`,
      params
    ),
    query(`SELECT caller_name, duration_seconds FROM calls ${clause} ORDER BY duration_seconds DESC, id LIMIT 1`, params),
    query(`SELECT caller_name, duration_seconds FROM calls ${clause} ORDER BY duration_seconds ASC, id LIMIT 1`, params),
  ]);

  const minutes = DURATION_BUCKET_SECONDS / 60;
  const toCall = (row) => (row ? { callerName: row.caller_name, durationSeconds: Number(row.duration_seconds) } : null);
  return {
    longest: toCall(longest.rows[0]),
    shortest: toCall(shortest.rows[0]),
    buckets: Array.from({ length: DURATION_BUCKETS }, (_, index) => ({
      label: index === last ? `${index * minutes}+ min` : `${index * minutes}-${(index + 1) * minutes} min`,
      minSeconds: index * DURATION_BUCKET_SECONDS,
      maxSeconds: index === last ? null : (index + 1) * DURATION_BUCKET_SECONDS,
      calls: Number(buckets.rows.find((row) => Number(row.bucket) === index)?.calls ?? 0),
    })),
  };
}

// everything the dashboard needs in one request
export async function getDashboard(filters, role) {
  const summary = await getSummary(filters);
  const [callTypes, timeline, cities, durations, topCallers] = await Promise.all([
    getCallTypes(filters),
    getTimeline(filters, { interval: "auto" }, { firstCall: summary.firstCall, lastCall: summary.lastCall }),
    getCities(filters, { limit: 10 }),
    getDurations(filters),
    getTopCallers(filters, { by: "duration", limit: 10 }, role),
  ]);
  return { summary, callTypes, timeline, cities, durations, topCallers };
}
