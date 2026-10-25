# WhatsApp intelligence bridge — review-only implementation

Status: **staged in GitHub, not activated in n8n or WAHA**. No messages or secrets are shipped with this integration.

## Confirmed systems (25 October 2026)

- Railway project `waha-n8n-cloud`; production service `waha-test-api`, WAHA GOWS image, persistent session volume.
- Airtable base `Pipeline Management` (`appcIKW0CTw6s495D`).
- Newly created Airtable tables:
  - `WA Intelligence Messages` — `tbl4REWMukqev67H1`
  - `WA Intelligence Conversations` — `tblb0xysr9DYSx0aj`
  - `WA Intelligence Actions` — `tblgxWMIikrF5NKvy`

## Scope / authority

WAHA is a **collector**, n8n a **transport/validator**, Airtable a **retrievable work queue**, ChatGPT the **analysis and decision layer**, Hermes/ClickUp/TickTick **delegated executors only when connected and authorised**. Keystal OS remains a tracking dashboard, not a live dispatcher. No unverified claims of model connectivity or auto-execution.

This collector never sends WhatsApp messages, creates tasks, uses an LLM API, modifies WAHA sessions or reads `_data` / media URLs.

## Installation in existing n8n

1. In WAHA, verify actual session names using the authenticated dashboard or `GET /api/sessions`. Inspect existing webhook config. **Do not remove any current webhooks.**
2. Make a separate, disabled n8n workflow. Receive WAHA `message.any` in an authenticated Webhook node with a strong unpredictable path. Use your existing n8n credentials/HTTPS configuration.
3. **Verify webhook authenticity before processing** (WAHA webhook HMAC or a controlled gateway); never rely solely on client-supplied JSON. Ensure a 2xx response only after durable write, or implement queue/retry.
4. In an n8n Code node (Run Once for All Items), paste `n8n-normalize.js` and replace `new Set([])` with an explicit list of inspected session names. Empty by default deliberately prevents accidental cross-account collection.
5. Connect the Code output to an **Airtable Create or Update (upsert)** node. Use existing Airtable credentials, base `appcIKW0CTw6s495D`, table `tbl4REWMukqev67H1`. Match on **Event Key** and map the other fields by their exact names. Test that the same webhook delivered twice produces one record (idempotency). Treat any upsert mismatch/error as a blocker.
6. Send only **direct chats** by default. Group, newsletter, broadcast and status messages are excluded. Media attachments are *not* downloaded. Only up to 240 redacted text characters are stored; this is not a complete message archive.
7. Send one synthetic incoming and one synthetic outgoing fixture through the n8n test URL. Confirm `Direction`, `Event Key`, `Message Time` and redaction; confirm no messages sent back to WhatsApp. Test duplicate delivery, failed Airtable and retries.
8. Only after those tests, enable the new webhook subscriber for the exact approved WAHA session(s). Where possible add an independent webhook entry rather than replacing your chatbot's existing subscriber.

## Direct-chat normalization

- WAHA `message.any` includes both directions; an ordinary `message` event is ignored by this collector so existing inbound chatbot workflows remain unaffected.
- Event identity: `<session>|<message id>`. Conversation identity: `<session>|<chat id>`.
- Incoming chat id uses `payload.from`; outgoing uses `payload.to`.
- Source timestamps are normalised to ISO UTC for Airtable.
- NRIC-like strings, email, Singapore phone patterns and long digit sequences are masked. This is best-effort: review before wider use, and do not assume all personal or financial information is removed.
- The full private source payload must never be written to n8n execution logs, public dashboards, GitHub or model prompts. Configure n8n execution-data retention accordingly.

## ChatGPT daily review (connected Airtable)

Ask ChatGPT to read the three WA Intelligence tables, beginning with recent messages and outstanding actions.

When data is available, analyse only evidenced items. For each proposed action:
- conversation key and supporting source message IDs;
- exact action / owner / due date (only if supported);
- priority P0 (urgent risk), P1 (timely revenue or commitment), P2 (normal), P3 (informational);
- whether it is an unanswered question, explicit promise, pending external response, or tentative opportunity;
- evidence status: **observed / inferred / unknown**;
- no fabricated monetary values or completion claims.

Treat P0 as human-reviewed and never send WhatsApp or execute financial/insurance actions without authorisation. Write **suggestions** to `WA Intelligence Actions` as `Suggested` only. Do not create ClickUp/TickTick tasks or send messages until explicitly approved and the relevant connector is verified.

## Remaining blockers

- **No n8n management connector** is available in this session; the workflow cannot be installed or activated remotely from ChatGPT.
- **No WAHA message-read integration** is provided by the Railway admin connector; deployment metadata is not chat content.
- WAHA session names, actual webhook subscriptions, HMAC configuration and n8n workflow URL have not been inspected yet.
- Official ChatGPT subscription authentication inside Keystal OS is **not validated** in this branch. ChatGPT can retrieve the Airtable tables via the connected Airtable plugin in this conversation.
- Automatic scheduled ChatGPT analysis is not enabled until a live end-to-end data test succeeds.

## Safety gate / rollback

Disable only the **new** n8n webhook and its corresponding WAHA subscriber to stop collection. Existing WAHA chatbot sessions, Railway services and live n8n workflows must remain unchanged. Redacted Airtable records already captured are not automatically deleted; handle any deletion through the authorised retention process.

Synthetic tests: `node integrations/whatsapp-intelligence/test-normalize.js`.

Source references: WAHA events https://waha.devlike.pro/docs/how-to/events/ and n8n Airtable node https://n8n.io/integrations/airtable/.
