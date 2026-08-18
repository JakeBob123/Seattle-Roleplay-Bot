/**
 * Receives ER:LC event webhooks (https://apidocs.erlc.gg/event-webhooks.md).
 *
 * As of the current docs, the game only sends webhooks for two event types:
 *   - in-game messages starting with ";" (custom in-game commands)
 *   - Emergency Calls
 * The docs do not publish a formal JSON schema for either payload beyond
 * the signing requirements, so this handler verifies the signature (that
 * part IS fully specified and implemented exactly per spec), logs the full
 * raw payload for every event, and does best-effort field detection for
 * routing to Discord. If your server starts receiving payloads with a
 * different shape than expected, the raw payload is always in
 * erlc_webhook_events.payload for inspection — nothing is dropped silently.
 *
 * Because ER:LC lets you configure exactly one webhook URL per private
 * server (no server identifier in the payload itself), each guild gets a
 * unique URL: POST /webhooks/erlc/:guildId. Generate/view yours from
 * /config -> In-Game Integration.
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../../database/db');

const ERLC_PUBLIC_KEY_SPKI_B64 = 'MCowBQYDK2VwAyEAjSICb9pp0kHizGQtdG8ySWsDChfGqi+gyFCttigBNOA=';
const publicKey = crypto.createPublicKey({
  key: Buffer.from(ERLC_PUBLIC_KEY_SPKI_B64, 'base64'),
  format: 'der',
  type: 'spki',
});

const insertEvent = db.prepare(`
  INSERT INTO erlc_webhook_events (guild_id, event_hash, event_type, payload)
  VALUES (?, ?, ?, ?)
`);
const eventExists = db.prepare(`SELECT 1 FROM erlc_webhook_events WHERE event_hash = ?`);

function verifySignature(timestamp, rawBody, signatureHex) {
  const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]);
  const signature = Buffer.from(signatureHex, 'hex');
  try {
    return crypto.verify(null, message, publicKey, signature);
  } catch {
    return false;
  }
}

function classifyEvent(payload) {
  if (payload?.Description !== undefined || payload?.CallNumber !== undefined || payload?.Team !== undefined && payload?.Position) {
    return 'emergency_call';
  }
  if (typeof payload?.Message === 'string' && payload.Message.startsWith(';')) {
    return 'ingame_command';
  }
  return 'unknown';
}

/**
 * @param onEvent async ({ guildId, eventType, payload }) => void
 *   called for every newly-received, signature-valid, non-duplicate event.
 *   The ingame module wires this to Discord routing.
 */
function createWebhookRouter(onEvent) {
  const router = express.Router();

  // Raw body is required to verify the signature byte-for-byte.
  router.post('/webhooks/erlc/:guildId', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
    const timestamp = req.header('X-Signature-Timestamp');
    const signature = req.header('X-Signature-Ed25519');
    const rawBody = req.body; // Buffer, thanks to express.raw

    if (!timestamp || !signature || !Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ error: 'Missing signature headers or body.' });
    }

    if (!verifySignature(timestamp, rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid signature.' });
    }

    const eventHash = crypto.createHash('sha256').update(timestamp).update(rawBody).digest('hex');
    if (eventExists.get(eventHash)) {
      // Valid, already-processed event — ack without reprocessing.
      return res.status(200).json({ ok: true, duplicate: true });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Body is not valid JSON.' });
    }

    const guildId = req.params.guildId;
    const eventType = classifyEvent(payload);

    try {
      insertEvent.run(guildId, eventHash, eventType, JSON.stringify(payload));
    } catch (err) {
      console.error('[erlc-webhook] Failed to persist event:', err);
    }

    // Ack immediately, process asynchronously so ER:LC never sees a slow
    // response because a Discord API call is in flight.
    res.status(200).json({ ok: true });

    try {
      await onEvent({ guildId, eventType, payload });
    } catch (err) {
      console.error('[erlc-webhook] onEvent handler failed:', err);
    }
  });

  return router;
}

module.exports = { createWebhookRouter, verifySignature };
