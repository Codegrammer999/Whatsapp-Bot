# Whatsapp-Gemini Bot

A simple WhatsApp bot that integrates with Google Gemini (gemini-2.5-flash) using `whatsapp-web.js`. The bot keeps a short conversation memory per chat, simulates typing/seen states, supports simple "reaction" tokens, and can forward flagged "business" messages to your own number.

> Repo: Codegrammer999/Whatsapp-Bot  
> Main entry: `index.js`

---

## Features

- WhatsApp client using `whatsapp-web.js` and `LocalAuth` (persisted session).
- Uses Google Generative AI (`@google/generative-ai`) and the `gemini-2.5-flash` model.
- Per-chat memory stored in `chat_memory.json`.
- Cooldown per chat to avoid spamming replies.
- Typing simulation and reactions.
- Forward "business" messages to the configured JID/owner.
- Logs appended to `bot_logs.txt`.

---

## Requirements

- Node.js 18+ (recommended)
- npm
- A Google Generative AI API key (Gemini)
- A machine that can run a headless Chromium (puppeteer will be used by whatsapp-web.js)

---

## Installation

1. Clone the repository:
   git clone https://github.com/Codegrammer999/Whatsapp-Bot.git
   cd Whatsapp-Bot

2. Install dependencies:
   npm install

3. Create a `.env` file in the project root with the required variables (example below).

4. Start the bot:
   node index.js
   (or `npm start` if you add a start script)

5. On first run, a QR code will be printed to the console. Scan it with your WhatsApp mobile app to authenticate.

---

## Environment variables

Create a `.env` with at least the following entries:

GEMINI_API_KEY=<your-google-generative-ai-key>
BOT_ROLE_CONTEXT="You are a helpful assistant..."   # System prompt/context for the bot (string)
CLIENT_ALIAS="YourName"                            # Name used when forwarding business messages
FORWARD_TO_JID="2349061458909@c.us"                # (Recommended) Make this your JID to receive forwarded messages

Example `.env`:
```
GEMINI_API_KEY=sk-...
BOT_ROLE_CONTEXT="You are a helpful AI assistant that replies in a friendly tone."
CLIENT_ALIAS="Alice"
FORWARD_TO_JID="2349061458909@c.us"
```

Notes:
- Keep the API key secret. Do not commit `.env` to the repository.
- Update `FORWARD_TO_JID` to your phone's JID (you can find it from logs or by inspecting incoming messages).

---

## Files created at runtime

- `chat_memory.json` — conversation memory per chat.
- `bot_logs.txt` — runtime logs and errors.

The bot will create `chat_memory.json` and `bot_logs.txt` if they do not exist.

---

## How the bot decides replies

- Incoming messages are filtered (ignores messages from the bot, GIFs, and heavily-forwarded items).
- A per-chat cooldown prevents immediate replies back-to-back. Cooldown time is randomized within a configured range.
- The bot collects recent messages (MEMORY_WINDOW) and sends them along with `BOT_ROLE_CONTEXT` to Gemini.
- The bot expects Gemini responses to sometimes include tokenized actions like `%business%` or `%👍%`:
  - `%business%` triggers forwarding to the owner (FORWARD_TO_JID).
  - `%emoji%` tokens are attempted as reactions (must be valid for whatsapp-web.js).

---

## Known issues & recommended fixes

Before deploying, consider addressing the following issues in `index.js`:

1. messageClient call and signature mismatch
   - Fix call site: `await messageClient(message, reply);`
   - Use `message.body` if you want message text inside the forwarded template.

2. Hardcoded forward JID
   - Use `process.env.FORWARD_TO_JID` instead of a hardcoded number.

3. sendSeen is not invoked properly
   - Replace `await message.getChat().sendSeen;` with `await message.getChat().sendSeen();`

4. Random delay calculation
   - The code comment suggests 8–50s but number math is inconsistent. Use:
     `const randomDelay = Math.floor(Math.random() * (50000 - 8000 + 1)) + 8000;` // 8–50s

5. Gemini API shapes and role names
   - Validate `messagesForGemini` shape and role names with the official `@google/generative-ai` docs. Consider using `role: "system"` for BOT_ROLE_CONTEXT if that matches the API.

6. Reaction tokens and emoji validation
   - Ensure reactions are valid emoji strings expected by whatsapp-web.js, and guard when `msgReaction` is empty.

7. Guard against undefined model response
   - Check `result` and `result.response` exist before calling `.text()`.

If you'd like I can prepare a minimal patch with these fixes.

---

## Troubleshooting

- QR code not displayed: ensure your terminal supports the QR display; try a different terminal or increase the `qrcode-terminal` size options.
- Puppeteer errors (Chromium fails to launch): ensure necessary libraries are installed on your OS for headless Chromium.
- Gemini API errors: check `GEMINI_API_KEY` and ensure billing and access are set up for the model you intend to use.
- No forwarded messages: confirm `FORWARD_TO_JID` and that `CLIENT_ALIAS` are set correctly.

---

## Next improvements (ideas)

- Add robust rate-limiting and per-user opt-out.
- Validate and sanitize messages to avoid data leaks.
- Add configuration for memory window sizes and cooldown ranges via `.env`.
- Add tests and CI checks.
- Add a proper README badge and a license.

---

## Contributing

Feel free to open issues or PRs. If you want me to prepare a PR that:
- Fixes the issues listed above,
- Adds configurable FORWARD_TO_JID and improved logging,
I can draft the changes and a patch for you.

---

## License

This repository now includes an MIT license. See `LICENSE` for details.

---

If you want, I can:
- Open `package.json` and list exact dependencies and run scripts.
- Produce a small patch/PR that implements the fixes I recommended.
- Create an expanded README with usage examples and test commands.

Tell me which you'd like next.
