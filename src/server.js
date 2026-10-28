import { app } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";

const server = app.listen(config.port, () => {
  console.log(`CDR API listening on port ${config.port}`);
});

// graceful shutdown
function shutdown() {
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
