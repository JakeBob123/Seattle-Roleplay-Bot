const express = require('express');

let server = null;
const app = express();

// Render (and most PaaS hosts) assign a dynamic port via process.env.PORT
// and require something listening on it almost immediately, or the deploy
// is marked unhealthy and gets restarted in a loop. WEBHOOK_PORT is the
// local-dev fallback when PORT isn't set (e.g. running on your own machine).
const PORT = process.env.PORT || process.env.WEBHOOK_PORT || 8787;

// Health check root -- this is also what makes the server useful on Render
// even for guilds that never enable the In-Game Integration module: the
// process still binds a port and answers HTTP immediately on boot.
app.get('/', (req, res) => res.status(200).json({ status: 'ok', service: 'liberty-county-bot' }));

function getApp() {
  return app;
}

function start() {
  if (server) return server;
  server = app.listen(PORT, () => {
    console.log(`[http] Listening on port ${PORT} (health check + webhook receiver)`);
  });
  return server;
}

module.exports = { getApp, start, PORT };
