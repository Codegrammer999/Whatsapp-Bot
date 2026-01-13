# 🤖 WhatsApp Gemini Bot

An intelligent, human-like WhatsApp bot powered by Google's Gemini AI with advanced rate limiting, conversation memory, and ban prevention features.

## 🎯 Problem This Solves

**Manual WhatsApp management is time-consuming and inefficient.** This bot automates WhatsApp conversations while:

- **Preventing WhatsApp bans** through intelligent rate limiting and human-like behavior
- **Maintaining context** across conversations with persistent memory
- **Scaling communication** by handling multiple users simultaneously
- **Customizing responses** per contact with different personas/tones
- **Forwarding important messages** to your personal number for business inquiries
- **Simulating human behavior** with realistic typing speeds, read receipts, and delays

Perfect for business automation, customer support, personal assistants, or managing high-volume WhatsApp communications without getting flagged as spam.

## ✨ Features

### 🛡️ Ban Prevention
- **Per-user rate limits**: 8 messages/hour, 30 messages/day
- **Global rate limits**: 15 messages/minute, 100 messages/hour
- **Smart cooldowns**: 15-45 second random delays between replies
- **Human-like behavior**: Variable typing speeds, realistic seen/reaction delays
- **Automatic filtering**: Ignores GIFs, stickers, and heavily forwarded messages

### 🧠 Intelligence
- **Conversation memory**: Remembers up to 100 messages per chat
- **Context-aware responses**: Uses last 20 messages for relevant replies
- **Custom personas**: Different behavior per phone number
- **Powered by Gemini 2.0 Flash**: Fast, intelligent responses

### ⚡ Performance
- **Efficient memory management**: Batch saves every 30 seconds
- **Non-blocking I/O**: Asynchronous operations throughout
- **Auto-cleanup**: Removes old data automatically
- **Duplicate prevention**: Blocks simultaneous messages from same user
- **Graceful shutdown**: Saves state before exit

### 🎭 Special Features
- **Emoji reactions**: Bot can react to messages with emojis
- **Business message forwarding**: Auto-forward important messages to your number
- **Persistent state**: Rate limits and memory survive restarts
- **Comprehensive logging**: Track all interactions and errors

## 📋 Prerequisites

- **Node.js** 18+ (with ES modules support)
- **WhatsApp account** (for QR code authentication)
- **Google Gemini API key** ([Get one here](https://makersuite.google.com/app/apikey))

## 🚀 Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/whatsapp-gemini-bot.git
cd whatsapp-gemini-bot
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Create a `.env` file in the root directory:

```env
# Required: Your Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Required: Default bot personality/instructions
BOT_ROLE_CONTEXT=You are a helpful AI assistant. Be friendly, concise, and engaging. You can use emojis occasionally to add personality. If someone asks about business inquiries, mark your response with %business% at the start.

# Required: Your phone number (for business message forwarding)
CLIENT_NUMBER=2349061458909

# Optional: Your name/alias for forwarded messages
CLIENT_ALIAS=Boss
```

4. **Set up custom contexts** (optional)

Create a `custom_contexts.json` file for personalized responses per contact:

```json
{
  "2349012345678": "You are a professional business assistant. Be formal and concise.",
  "2348087654321": "You are a casual friend. Use slang and be playful! 😄"
}
```

5. **Run the bot**
```bash
node index.js
```

6. **Scan the QR code**

A QR code will appear in your terminal. Scan it with your WhatsApp mobile app:
- Open WhatsApp on your phone
- Go to Settings → Linked Devices
- Tap "Link a Device"
- Scan the QR code

## 📝 Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GEMINI_API_KEY` | ✅ Yes | Your Google Gemini API key | `AIzaSy...` |
| `BOT_ROLE_CONTEXT` | ✅ Yes | Default bot personality and instructions | `You are a helpful assistant...` |
| `CLIENT_NUMBER` | ✅ Yes | Your WhatsApp number (for forwarding) | `2349061458909` |
| `CLIENT_ALIAS` | ❌ No | Your name in forwarded messages | `Boss` |

## 🎛️ Configuration

Adjust rate limits and behavior in the `CONFIG` object:

```javascript
const CONFIG = {
    // Memory settings
    MAX_MEMORY_PER_CHAT: 100,        // Total messages stored per chat
    MEMORY_WINDOW: 20,               // Messages sent to Gemini per request
    
    // Rate limits (per user)
    MAX_MESSAGES_PER_USER_DAILY: 30,  // Daily message limit per user
    MAX_MESSAGES_PER_USER_HOURLY: 8,  // Hourly message limit per user
    MIN_REPLY_DELAY: 15000,           // Minimum delay between replies (15s)
    MAX_REPLY_DELAY: 45000,           // Maximum delay between replies (45s)
    
    // Global rate limits
    MAX_MESSAGES_PER_MINUTE: 15,      // Total messages per minute
    MAX_MESSAGES_PER_HOUR: 100,       // Total messages per hour
    
    // Human-like behavior
    TYPING_SPEED: 40,                 // Milliseconds per character
    MIN_SEEN_DELAY: 3000,             // Minimum seen delay (3s)
    MAX_SEEN_DELAY: 8000,             // Maximum seen delay (8s)
};
```

## 📱 Usage

### Basic Conversation
Simply send a message to the WhatsApp number where the bot is running. The bot will:
1. Mark your message as "seen" after 3-8 seconds
2. Show "typing..." indicator
3. Reply with a context-aware response
4. Remember the conversation for future messages

### Emoji Reactions
To make the bot react with an emoji, include `%emoji%` in the Gemini response:
```
Sure! I'll help you with that. %👍%
```

### Business Message Forwarding
To forward a message to your personal number, include `%business%` in the Gemini response:
```
Thank you for your inquiry! I'll have my team contact you. %business%
```

### Custom Personas
Add entries to `custom_contexts.json` to customize bot behavior per contact:
```json
{
  "2349012345678": "You are a formal business assistant.",
  "2348087654321": "You are a casual friend who loves memes!"
}
```

## 📁 File Structure

```
whatsapp-gemini-bot/
├── index.js                  # Main bot code
├── .env                      # Environment variables (create this)
├── custom_contexts.json      # Custom personas per number (optional)
├── chat_memory.json          # Conversation history (auto-generated)
├── rate_limits.json          # Rate limit tracking (auto-generated)
├── bot_logs.txt              # Activity logs (auto-generated)
├── .wwebjs_auth/             # WhatsApp session data (auto-generated)
├── package.json
└── README.md
```

## 🔧 Troubleshooting

### Bot doesn't respond
- Check `bot_logs.txt` for errors
- Verify `GEMINI_API_KEY` is valid
- Ensure rate limits aren't exceeded
- Check if WhatsApp session is still active

### "Rate limit exceeded" in logs
- This is normal! The bot is protecting you from bans
- Adjust `CONFIG` values if you need higher limits
- Consider the trade-off between speed and ban risk

### Bot disconnects frequently
- WhatsApp may be suspicious of automated behavior
- Reduce rate limits in `CONFIG`
- Increase delays between messages
- Ensure you're not running multiple instances

### QR code doesn't appear
- Check Node.js version (requires 18+)
- Delete `.wwebjs_auth` folder and try again
- Ensure no other WhatsApp Web sessions are active

## ⚠️ Important Notes

- **Ban Risk**: While this bot includes extensive ban prevention, automation always carries some risk. Use responsibly.
- **WhatsApp Terms**: Review WhatsApp's Terms of Service before deploying.
- **Rate Limits**: Conservative by default. Increase at your own risk.
- **Data Privacy**: All conversations are stored locally. Secure your server.
- **Gemini Costs**: Monitor your Gemini API usage and costs.

## 🛣️ Roadmap

- [ ] Multi-language support
- [ ] Image/document handling
- [ ] Admin dashboard
- [ ] Analytics and insights
- [ ] Group chat support
- [ ] Scheduled messages
- [ ] Webhook integrations

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚡ Credits

Built with:
- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) - WhatsApp Web API wrapper
- [Google Gemini AI](https://deepmind.google/technologies/gemini/) - Conversational AI
- [qrcode-terminal](https://github.com/gtanner/qrcode-terminal) - QR code generation

## 💬 Support

Having issues? Open an issue on GitHub or contact the maintainers.

---

**⚠️ Disclaimer**: This bot is for educational and personal use. Use responsibly and in compliance with WhatsApp's Terms of Service. The authors are not responsible for any bans or violations resulting from use of this software.