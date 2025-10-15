import { Client } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// WhatsApp session
const SESSION_FILE_PATH = "./session.json";
let sessionData;
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionData = JSON.parse(fs.readFileSync(SESSION_FILE_PATH, "utf-8"));
}

const client = new Client({ session: sessionData });

// Conversation memory file
const MEMORY_FILE_PATH = "./chat_memory.json";
let chatMemory = {};

// Load memory if exists
if (fs.existsSync(MEMORY_FILE_PATH)) {
    chatMemory = JSON.parse(fs.readFileSync(MEMORY_FILE_PATH, "utf-8"));
}

// Save session after authentication
client.on("authenticated", (session) => {
    fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(session));
    log("✅ Session saved!");
});

// QR code generation
client.on("qr", (qr) => {
    console.log("Scan this QR with WhatsApp:");
    qrcode.generate(qr, { small: true });
});

// Ready
client.on("ready", () => {
    log("Your WhatsApp Gemini bot is ready and listening for messages 🤖💬...");
});

const MAX_MEMORY = 100;     // Total messages stored per chat
const MEMORY_WINDOW = 20;   // Messages sent to Gemini per request

// Message handler
client.on("message", async (message) => {
    if (!message.body || message.fromMe || message.isGif || message.forwardingScore > 5) return;

    const chatId = message.from;
    log(`💬 Message from ${chatId}: ${message.body}`);

    // Initialize memory for this chat
    if (!chatMemory[chatId]) chatMemory[chatId] = [];

    // Add user message to memory
    chatMemory[chatId].push({ role: "user", content: message.body });
    if (chatMemory[chatId].length > MAX_MEMORY) chatMemory[chatId].shift();

    try {
        // Sliding memory: send only last MEMORY_WINDOW messages to Gemini
        const messagesForGemini = [
            {
                role: "model",
                parts: [
                    {
                        text: process.env.BOT_ROLE_CONTEXT
                    }
                ]
            },
            ...chatMemory[chatId].slice(-MEMORY_WINDOW).map(m => ({
                role: m.role,
                parts: [{ text: m.content }]
            }))
        ];

        const result = await model.generateContent({ contents: messagesForGemini });
        let reply = result.response.text().trim();

        // Extract reactions & business flags
        const msgReaction = [...reply.matchAll(/%(.*?)%/g)].map(m => m[1]);
        const isBusiness = msgReaction.includes("business");
        reply = reply.replace(/%(.*?)%/g, "").replace(/\s+/g, " ").trim();

        // Forward business messages to yourself
        if (isBusiness) await messageClient(reply);

        // React first if emoji exists
        if (msgReaction.length > 0) {
            await message.react(msgReaction[0]);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        await message.reply(reply);
        log(`🤖 Bot reply: ${reply}`);

        // Add bot reply to memory
        chatMemory[chatId].push({ role: "model", content: reply });
        if (chatMemory[chatId].length > MAX_MEMORY) chatMemory[chatId].shift();

        // Persist memory
        fs.writeFileSync(MEMORY_FILE_PATH, JSON.stringify(chatMemory, null, 2));

    } catch (error) {
        log("❌ Error with bot: " + error);
        await message.reply("");
    }
});

// Logging function
function log(msg) {
    console.log(msg);
    fs.appendFileSync("./bot_logs.txt", msg + "\n");
}

// Forward business messages to yourself
async function messageClient(reply) {
    try {
        const chat = await client.getChatById("2349061458909@c.us");
        await chat.sendMessage(reply);
        log("✉️ Business message forwarded: " + reply);
    } catch (err) {
        log("❌ Failed to forward business message: " + err);
    }
}

// Initialize WhatsApp client
client.initialize();
