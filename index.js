import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// Create necessary files safely if they don't exist
function ensureFile(filePath, defaultContent = "{}") {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, defaultContent);
        console.log(`🆕 Created file: ${filePath}`);
    }
}

// Ensure all essential files exist
ensureFile("./chat_memory.json", "{}");
ensureFile("./bot_logs.txt", "");

// Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "gemini-bot" }),
    puppeteer: { headless: true },
});

// Conversation memory file
const MEMORY_FILE_PATH = "./chat_memory.json";
let chatMemory = {};

// Load memory if exists
if (fs.existsSync(MEMORY_FILE_PATH)) {
    chatMemory = JSON.parse(fs.readFileSync(MEMORY_FILE_PATH, "utf-8"));
}

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
const chatCooldowns = new Map();

// Message handler
client.on("message", async (message) => {
    if (
        !message.body ||
        message.fromMe ||
        message.isGif ||
        message.forwardingScore > 5
    ) return;

    const { canReplyNow, delay } = canReply(message.from);

    if (!canReplyNow) {
        log(`⏳ Cooldown active for ${message.from}, will reply in ${(delay / 1000).toFixed(1)}s...`);
        setTimeout(() => handleMessage(message), delay);
        return;
    }

    // Handle immediately if no cooldown
    await handleMessage(message);
});

// Logging function
function log(msg) {
    console.log(msg);
    try {
        const time = new Date().toLocaleString();
        const logMsg = `[${time}] ${msg}\n`;
        fs.appendFileSync("./bot_logs.txt", logMsg + "\n", { flag: "a" });
    } catch (e) {
        console.error("❌ Failed to write to log:", e);
    }
}

// Forward business messages to yourself
async function messageClient(message, reply) {
    try {
        const chat = await client.getChatById("2349061458909@c.us");
        const newReply = `Hey ${process.env.CLIENT_ALIAS}, you likely have a business message from ${message.from} saying... "${message}" and i replied saying... "${reply}".`
        await chat.sendMessage(newReply);
        log("✉️ Business message forwarded: " + reply);
    } catch (err) {
        log("❌ Failed to forward business message: " + err);
    }
}

function canReply(chatId) {
    const now = Date.now();
    const cooldownInfo = chatCooldowns.get(chatId);
    const randomDelay = Math.floor(Math.random() * (50000 - 20000 + 1)) + 8000; // 8–50 secs

    if (!cooldownInfo || now - cooldownInfo.lastReply > cooldownInfo.delay) {
        chatCooldowns.set(chatId, { lastReply: now, delay: randomDelay });
        return { canReplyNow: true, delay: 0 };
    }

    // Calculate remaining cooldown time
    const timeLeft = cooldownInfo.delay - (now - cooldownInfo.lastReply);
    return { canReplyNow: false, delay: timeLeft };
}

async function replyWithTyping(chat, message, reply) {
    // Simulate typing duration based on reply length
    const typingDelay = Math.floor(reply.length * (50 + Math.random() * 50));
    await new Promise(r => setTimeout(r, 1500))

    await chat.sendStateTyping();
    await new Promise(resolve => setTimeout(resolve, typingDelay));

    await chat.clearState();

    // Finally, send reply
    await message.reply(reply);
}

async function sendReaction(message, msgReaction) {
    // Simulate "seen" delay (2–5 seconds)
    const seenDelay = Math.floor(Math.random() * (5000 - 2000)) + 2000;
    await new Promise(resolve => setTimeout(resolve, seenDelay));

    await message.getChat().sendSeen;
    await new Promise(resolve => setTimeout(resolve, 1000));

    await message.react(msgReaction[0]);
    await new Promise(resolve => setTimeout(resolve, 2000));
}

async function handleMessage(message) {
    const chatId = message.from;
    log(`💬 Message from ${chatId}: ${message.body}`);

    if (!chatMemory[chatId]) chatMemory[chatId] = [];
    chatMemory[chatId].push({ role: "user", content: message.body });
    if (chatMemory[chatId].length > MAX_MEMORY) chatMemory[chatId].shift();

    try {
        const messagesForGemini = [
            {
                role: "model",
                parts: [{ text: process.env.BOT_ROLE_CONTEXT }]
            },
            ...chatMemory[chatId].slice(-MEMORY_WINDOW).map(m => ({
                role: m.role,
                parts: [{ text: m.content }]
            }))
        ];

        const result = await model.generateContent({ contents: messagesForGemini });
        let reply = result.response.text().trim();

        const msgReaction = [...reply.matchAll(/%(.*?)%/g)].map(m => m[1]);
        const isBusiness = msgReaction.includes("business");
        reply = reply.replace(/%(.*?)%/g, "").replace(/\s+/g, " ").trim();

        if (isBusiness) await messageClient(reply);
        if (msgReaction.length > 0) await sendReaction(message, msgReaction[0]);

        await replyWithTyping(await message.getChat(), message, reply);
        log(`🤖 Bot reply: ${reply}`);

        chatMemory[chatId].push({ role: "model", content: reply });
        if (chatMemory[chatId].length > MAX_MEMORY) chatMemory[chatId].shift();

        fs.writeFileSync(MEMORY_FILE_PATH, JSON.stringify(chatMemory, null, 2));
    } catch (error) {
        log("❌ Error with bot: " + error);
    }
}

// Initialize WhatsApp client
client.initialize();
