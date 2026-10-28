# CDR API

Week 3 internship assignment: secure backend for the telecom call analytics platform. Stores 10,000 call data records (CDRs) in PostgreSQL and serves them through a REST API with JWT authentication and role-based access control.

API: https://cdr-api-u9dq.onrender.com

The frontend that uses this API is [cdr-dashboard](https://github.com/rnm35/cdr-dashboard).

## Tech stack

- Node.js and Express
- PostgreSQL (hosted on Neon), queried with `pg` using parameterised SQL
- JWT authentication (`jsonwebtoken`), passwords hashed with bcrypt (`bcryptjs`)
- `helmet` security headers, `express-rate-limit` on sign-in and sign-up
- `exceljs` to import the provided spreadsheet

## Roles

| Role | Can access |
|---|---|
| **Admin** | Everything: analytics, individual call records with full phone numbers, and user management |
| **Analyst** | Analytics only (view-only). Phone numbers in top callers are partly hidden. No access to call records or users |

New sign-ups are analysts. An admin can change anyone's role. The role is read from the database on every request, so a change takes effect immediately.

## Endpoints

All responses are JSON. Errors always have the same shape:

```json
{ "error": { "status": 400, "code": "VALIDATION_ERROR", "message": "Some of the values sent are not valid.",
             "details": [{ "field": "from", "message": "from is not a real date." }] } }
```

### Authentication

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | Public | `{ name, email, password }` creates an analyst account and signs in. **201** |
| POST | `/api/auth/login` | Public | `{ email, password }` signs in. **200** |
| POST | `/api/auth/logout` | Public | Clears the session cookie. **204** |
| GET | `/api/auth/me` | Signed in | The current user |

Signing in sets an HTTP-only cookie (`cdr_token`). The token is also returned in the response body for API tools, which can send it as `Authorization: Bearer <token>`.

### Call records (admin)

| Method | Path | Description |
|---|---|---|
| GET | `/api/calls` | Paginated call records. Query: `page` (default 1), `limit` (1 to 100, default 20), `sort` (`startTime`, `duration`, `cost`, `callerName`, `city`), `order` (`asc`/`desc`), plus the filters below |
| GET | `/api/calls/:id` | One call, or **404** |

```json
{ "data": [ { "id": 1, "callerName": "Yvonne Phillips", "callerNumber": "07387416172", "receiverNumber": "07193615979",
              "city": "South Paulaside", "direction": "outbound", "status": "failed", "durationSeconds": 438,
              "cost": 3.84, "startTime": "2025-01-15T21:13:38.132Z", "endTime": "2025-01-15T21:20:56.132Z" } ],
  "pagination": { "page": 1, "limit": 20, "totalItems": 10000, "totalPages": 500 } }
```

### Analytics (admin and analyst)

| Method | Path | Description |
|---|---|---|
| GET | `/api/analytics/summary` | Total calls, total and average duration, total and average cost, success rate, incoming/outgoing counts |
| GET | `/api/analytics/call-types` | Incoming vs outgoing distribution, with success counts for each |
| GET | `/api/analytics/top-callers` | Top callers. `by` = `duration` (default), `cost` or `calls`; `limit` 1 to 50 |
| GET | `/api/analytics/timeline` | Calls over time. `interval` = `auto` (default), `hour`, `day`, `week` or `month` |
| GET | `/api/analytics/cities` | Top cities by calls and by cost. `limit` 1 to 50 |
| GET | `/api/analytics/durations` | Calls in 10-minute duration ranges, plus the longest and shortest call |
| GET | `/api/analytics/dashboard` | All of the above in one response (used by the dashboard) |

### Users (admin)

| Method | Path | Description |
|---|---|---|
| GET | `/api/users` | All accounts |
| PATCH | `/api/users/:id` | `{ role: "admin" \| "analyst" }`. Admins can't remove their own admin role (**409**) |

### Other

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Checks the API and database are up |

### Filters

Every call records and analytics endpoint accepts the same filters:

| Parameter | Example | Matches |
|---|---|---|
| `from`, `to` | `2025-03-01` | Calls starting on or between these dates (UTC, inclusive) |
| `callerNumber`, `receiverNumber` | `07387` | Numbers containing these digits (spaces and dashes are ignored) |
| `city` | `smith` | Cities containing this text (not case-sensitive) |
| `direction` | `inbound` / `outbound` | Incoming or outgoing calls |
| `status` | `successful` / `failed` | Call outcome |

Example: `GET /api/analytics/summary?from=2025-01-01&to=2025-06-30&direction=inbound`

### Status codes used

| Code | When |
|---|---|
| 200 / 201 / 204 | Success / created / success with no content |
| 400 | Invalid input (details list each problem) |
| 401 | Not signed in, or the session is invalid or expired |
| 403 | Signed in, but the role isn't allowed |
| 404 | Record or endpoint not found |
| 409 | Email already registered, or an admin removing their own admin role |
| 415 | A request that changes data wasn't sent as JSON |
| 429 | Too many sign-in attempts |
| 500 | Unexpected server error (details are logged, never sent to the client) |

## Security

- **Passwords** are hashed with bcrypt (12 rounds) and never stored or returned in plain text.
- **Tokens** are signed with HS256 and expire after 8 hours. They're stored in an HTTP-only, `SameSite=Lax` cookie (`Secure` in production), so page scripts can't read them.
- **Every protected route** checks the token, then loads the user to confirm the account still exists and get the current role.
- **SQL injection** is prevented by sending every value as a query parameter. Sort columns come from a fixed list.
- **Input validation** rejects bad dates, unknown options, out-of-range numbers and oversized bodies (10 KB limit) with clear 400 errors.
- **CSRF** is limited by the `SameSite` cookie and by requiring JSON for any request that changes data.
- **Brute force:** sign-in and sign-up allow 10 attempts per 15 minutes per IP address. A wrong password and an unknown email return the same message and take the same time, so the API doesn't reveal which emails have accounts.

## Performance

- **Pagination and filtering happen in the database**, so only the requested page of rows is sent.
- **Indexes:** start time (date ranges) and trigram indexes on phone numbers and city, which make "contains" searches fast.
- **One request for the dashboard:** `/api/analytics/dashboard` runs its queries in parallel and returns everything at once, instead of the frontend making seven calls.
- **Caching:** analytics results are cached in memory for 60 seconds per filter combination and role.

## Data

`data/mock_call_records_10000.xlsx` (provided with the assignment) is imported by `npm run db:setup`. During import:

- `callDirection` and `callStatus` (true/false) become `inbound`/`outbound` and `successful`/`failed`
- `callCost` (stored as text in the spreadsheet) becomes a decimal number
- timestamps become proper `timestamptz` values, and durations whole seconds

Notes on this dataset: it covers December 2024 to June 2026, the call durations match the start and end times exactly, and every caller number appears only once. Because of that, ranking top callers by number of calls would be a 10,000-way tie, so they're ranked by total talk time by default.

## Running locally

Requires Node.js 18+ and a PostgreSQL database (a free [Neon](https://neon.tech) database works for development too).

```bash
npm install
cp .env.example .env
npm run db:setup
npm run dev
```

`.env` needs `DATABASE_URL`, `JWT_SECRET` (at least 32 characters) and the two account passwords. A suitable secret can be generated with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`npm run db:setup` creates the tables, imports the 10,000 calls and creates the admin and analyst accounts. `npm run dev` starts the API on http://localhost:4000 and restarts it when files change.

Check it's working: open http://localhost:4000/api/health.

## Project structure

```
db/schema.sql            tables and indexes
scripts/setup-db.js      creates tables, imports the spreadsheet, creates accounts
src/
  server.js              starts the server
  app.js                 middleware, routes and error handling
  config.js              reads and checks environment variables
  db.js                  PostgreSQL connection pool
  middleware/auth.js     requireAuth, requireRole and cookie handling
  routes/                auth, calls, analytics and users endpoints
  services/              SQL queries and business logic
  utils/                 validation, errors, formatting and caching
```

## Deployment

- **Database:** Neon (PostgreSQL). `npm run db:setup` is run once from a local machine with `DATABASE_URL` pointing at Neon.
- **API:** Render web service. Build command `npm install`, start command `npm start`, health check path `/api/health`.
- **Environment variables on Render:** `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production` and `CLIENT_ORIGIN` (the Vercel URL).

Render's free tier sleeps after 15 minutes without requests, so the first request after a quiet period can take up to a minute.
