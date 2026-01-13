import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import fs from "fs/promises";
import fsSync from "fs";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// ==================== CONFIGURATION ====================
const CONFIG = {
    MAX_MEMORY_PER_CHAT: 100,
    MEMORY_WINDOW: 20,
    
    // Rate limiting (per user)
    MIN_REPLY_DELAY: 15000,      // 15s minimum between replies
    MAX_REPLY_DELAY: 45000,      // 45s maximum between replies
    TYPING_SPEED: 40,            // ms per character (more human-like)
    
    // Daily limits per user (prevents spam/ban)
    MAX_MESSAGES_PER_USER_DAILY: 30,
    MAX_MESSAGES_PER_USER_HOURLY: 8,
    
    // Global rate limiting
    MAX_MESSAGES_PER_MINUTE: 15,
    MAX_MESSAGES_PER_HOUR: 100,
    
    // Delays (more human-like)
    MIN_SEEN_DELAY: 3000,
    MAX_SEEN_DELAY: 8000,
    MIN_REACTION_DELAY: 2000,
    MAX_REACTION_DELAY: 5000,
    
    // Memory persistence
    MEMORY_SAVE_INTERVAL: 30000, // Save every 30s instead of on every message
    
    // Files
    MEMORY_FILE: "./chat_memory.json",
    LOGS_FILE: "./bot_logs.txt",
    RATE_LIMIT_FILE: "./rate_limits.json",
    CUSTOM_CONTEXT_FILE: "./custom_contexts.json"
};

// ==================== CUSTOM CONTEXTS ====================
class CustomContextManager {
    constructor() {
        this.customContexts = {};
        this.loadContexts();
    }
    
    async loadContexts() {
        try {
            const data = await fs.readFile(CONFIG.CUSTOM_CONTEXT_FILE, "utf-8");
            this.customContexts = JSON.parse(data);
            log(`🎭 Loaded custom contexts for ${Object.keys(this.customContexts).length} numbers`);
        } catch {
            this.customContexts = {};
        }
    }
    
    getContext(phoneNumber) {
        // Check for exact match first
        if (this.customContexts[phoneNumber]) {
            return this.customContexts[phoneNumber];
        }
        
        // Check without @c.us suffix
        const cleanNumber = phoneNumber.replace('@c.us', '');
        if (this.customContexts[cleanNumber]) {
            return this.customContexts[cleanNumber];
        }
        
        // Return default context
        return process.env.BOT_ROLE_CONTEXT;
    }
    
    hasCustomContext(phoneNumber) {
        const cleanNumber = phoneNumber.replace('@c.us', '');
        return this.customContexts[phoneNumber] || this.customContexts[cleanNumber];
    }
}

// ==================== UTILITIES ====================
async function ensureFile(filePath, defaultContent = "{}") {
    try {
        await fs.access(filePath);
    } catch {
        await fs.writeFile(filePath, defaultContent);
        console.log(`🆕 Created file: ${filePath}`);
    }
}

function log(msg) {
    const time = new Date().toLocaleString();
    console.log(`[${time}] ${msg}`);
    
    // Non-blocking log write
    const logMsg = `[${time}] ${msg}\n`;
    fs.appendFile(CONFIG.LOGS_FILE, logMsg).catch(e => 
        console.error("❌ Log write failed:", e.message)
    );
}

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ==================== RATE LIMITING ====================
class RateLimiter {
    constructor() {
        this.userLimits = new Map();
        this.globalMessages = [];
        this.loadLimits();
        
        // Cleanup old entries every 5 minutes
        setInterval(() => this.cleanup(), 300000);
        
        // Save rate limit data every minute
        setInterval(() => this.saveLimits(), 60000);
    }
    
    async loadLimits() {
        try {
            const data = await fs.readFile(CONFIG.RATE_LIMIT_FILE, "utf-8");
            const parsed = JSON.parse(data);
            this.userLimits = new Map(Object.entries(parsed));
        } catch {
            // File doesn't exist or is invalid
        }
    }
    
    async saveLimits() {
        try {
            const obj = Object.fromEntries(this.userLimits);
            await fs.writeFile(CONFIG.RATE_LIMIT_FILE, JSON.stringify(obj, null, 2));
        } catch (e) {
            log("❌ Failed to save rate limits: " + e.message);
        }
    }
    
    getUserLimit(userId) {
        if (!this.userLimits.has(userId)) {
            this.userLimits.set(userId, {
                messages: [],
                lastReply: 0,
                cooldownDelay: 0
            });
        }
        return this.userLimits.get(userId);
    }
    
    canReply(userId) {
        const now = Date.now();
        const userLimit = this.getUserLimit(userId);
        
        // Check cooldown
        if (now - userLimit.lastReply < userLimit.cooldownDelay) {
            const remaining = userLimit.cooldownDelay - (now - userLimit.lastReply);
            return { allowed: false, reason: "cooldown", delay: remaining };
        }
        
        // Clean old messages
        const oneHourAgo = now - 3600000;
        const oneDayAgo = now - 86400000;
        userLimit.messages = userLimit.messages.filter(t => t > oneDayAgo);
        
        // Check hourly limit
        const messagesLastHour = userLimit.messages.filter(t => t > oneHourAgo).length;
        if (messagesLastHour >= CONFIG.MAX_MESSAGES_PER_USER_HOURLY) {
            return { 
                allowed: false, 
                reason: "hourly_limit",
                delay: 3600000 // Wait 1 hour
            };
        }
        
        // Check daily limit
        if (userLimit.messages.length >= CONFIG.MAX_MESSAGES_PER_USER_DAILY) {
            return { 
                allowed: false, 
                reason: "daily_limit",
                delay: 86400000 // Wait 24 hours
            };
        }
        
        // Check global rate limit
        if (!this.checkGlobalLimit()) {
            return { 
                allowed: false, 
                reason: "global_limit",
                delay: 60000 // Wait 1 minute
            };
        }
        
        return { allowed: true };
    }
    
    checkGlobalLimit() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const oneHourAgo = now - 3600000;
        
        // Clean old entries
        this.globalMessages = this.globalMessages.filter(t => t > oneHourAgo);
        
        const messagesLastMinute = this.globalMessages.filter(t => t > oneMinuteAgo).length;
        const messagesLastHour = this.globalMessages.length;
        
        return messagesLastMinute < CONFIG.MAX_MESSAGES_PER_MINUTE && 
               messagesLastHour < CONFIG.MAX_MESSAGES_PER_HOUR;
    }
    
    recordMessage(userId) {
        const now = Date.now();
        const userLimit = this.getUserLimit(userId);
        
        userLimit.messages.push(now);
        userLimit.lastReply = now;
        userLimit.cooldownDelay = randomDelay(
            CONFIG.MIN_REPLY_DELAY, 
            CONFIG.MAX_REPLY_DELAY
        );
        
        this.globalMessages.push(now);
    }
    
    cleanup() {
        const now = Date.now();
        const oneDayAgo = now - 86400000;
        
        // Remove users with no recent activity
        for (const [userId, data] of this.userLimits.entries()) {
            if (data.messages.length === 0 || 
                Math.max(...data.messages) < oneDayAgo) {
                this.userLimits.delete(userId);
            }
        }
        
        log(`🧹 Cleaned up rate limiter. Active users: ${this.userLimits.size}`);
    }
}

// ==================== MEMORY MANAGER ====================
class MemoryManager {
    constructor() {
        this.chatMemory = {};
        this.isDirty = false;
        this.loadMemory();
        
        // Auto-save every 30 seconds if there are changes
        setInterval(() => this.autoSave(), CONFIG.MEMORY_SAVE_INTERVAL);
    }
    
    async loadMemory() {
        try {
            const data = await fs.readFile(CONFIG.MEMORY_FILE, "utf-8");
            this.chatMemory = JSON.parse(data);
            log(`📚 Loaded memory for ${Object.keys(this.chatMemory).length} chats`);
        } catch {
            this.chatMemory = {};
        }
    }
    
    async autoSave() {
        if (!this.isDirty) return;
        
        try {
            await fs.writeFile(
                CONFIG.MEMORY_FILE, 
                JSON.stringify(this.chatMemory, null, 2)
            );
            this.isDirty = false;
            log("💾 Memory auto-saved");
        } catch (e) {
            log("❌ Failed to save memory: " + e.message);
        }
    }
    
    addMessage(chatId, role, content) {
        if (!this.chatMemory[chatId]) {
            this.chatMemory[chatId] = [];
        }
        
        this.chatMemory[chatId].push({ role, content });
        
        // Trim if exceeds max
        if (this.chatMemory[chatId].length > CONFIG.MAX_MEMORY_PER_CHAT) {
            this.chatMemory[chatId].shift();
        }
        
        this.isDirty = true;
    }
    
    getMessages(chatId) {
        return this.chatMemory[chatId] || [];
    }
    
    getRecentMessages(chatId) {
        const messages = this.getMessages(chatId);
        return messages.slice(-CONFIG.MEMORY_WINDOW);
    }
}

// ==================== INITIALIZATION ====================
await ensureFile(CONFIG.MEMORY_FILE, "{}");
await ensureFile(CONFIG.LOGS_FILE, "");
await ensureFile(CONFIG.RATE_LIMIT_FILE, "{}");
await ensureFile(CONFIG.CUSTOM_CONTEXT_FILE, "{}");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "gemini-bot" }),
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

const rateLimiter = new RateLimiter();
const memoryManager = new MemoryManager();
const contextManager = new CustomContextManager();
const pendingMessages = new Map();

// ==================== WHATSAPP HANDLERS ====================
client.on("qr", (qr) => {
    console.log("📱 Scan this QR with WhatsApp:");
    qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
    log("✅ WhatsApp Gemini bot is ready and listening 🤖💬");
});

client.on("message", async (message) => {
    // Ignore invalid messages
    if (!message.body || 
        message.fromMe || 
        message.isGif || 
        message.type === "sticker" ||
        message.forwardingScore > 5) {
        return;
    }
    
    const chatId = message.from;
    
    // Check if already processing for this user
    if (pendingMessages.has(chatId)) {
        log(`⏭️ Skipping duplicate message from ${chatId}`);
        return;
    }
    
    // Check rate limits
    const limitCheck = rateLimiter.canReply(chatId);
    
    if (!limitCheck.allowed) {
        const reasons = {
            cooldown: "⏳ Cooldown active",
            hourly_limit: "⏰ Hourly message limit reached",
            daily_limit: "📅 Daily message limit reached",
            global_limit: "🌐 Global rate limit reached"
        };
        
        log(`${reasons[limitCheck.reason]} for ${chatId}. Delay: ${(limitCheck.delay / 1000).toFixed(1)}s`);
        
        return;
    }
    
    // Handle the message
    pendingMessages.set(chatId, true);
    
    try {
        await handleMessage(message);
        rateLimiter.recordMessage(chatId);
    } finally {
        pendingMessages.delete(chatId);
    }
});

// ==================== MESSAGE HANDLING ====================
async function handleMessage(message) {
    const chatId = message.from;
    log(`💬 Message from ${chatId}: ${message.body}`);
    
    // Add user message to memory
    memoryManager.addMessage(chatId, "user", message.body);
    
    try {
        // Get custom context for this number, or use default
        const roleContext = contextManager.getContext(chatId);
        
        if (contextManager.hasCustomContext(chatId)) {
            log(`🎭 Using custom context for ${chatId}`);
        }
        
        // Prepare messages for Gemini
        const messagesForGemini = [
            {
                role: "model",
                parts: [{ text: roleContext }]
            },
            ...memoryManager.getRecentMessages(chatId).map(m => ({
                role: m.role,
                parts: [{ text: m.content }]
            }))
        ];
        
        // Generate response
        const result = await model.generateContent({ 
            contents: messagesForGemini,
            generationConfig: {
                maxOutputTokens: 500,
                temperature: 0.9
            }
        });
        
        let reply = result.response.text().trim();
        
        // Parse special markers
        const reactions = [...reply.matchAll(/%(.*?)%/g)].map(m => m[1]);
        const isBusiness = reactions.includes("business");
        
        // Clean reply
        reply = reply.replace(/%(.*?)%/g, "").replace(/\s+/g, " ").trim();
        
        // Handle business forwarding
        if (isBusiness) {
            await forwardBusinessMessage(message.body, reply);
        }
        
        // Send reaction if specified
        if (reactions.length > 0 && reactions[0] !== "business") {
            await sendReaction(message, reactions[0]);
        }
        
        // Reply with typing simulation
        await replyWithTyping(message, reply);
        
        log(`🤖 Bot replied to ${chatId}: ${reply.substring(0, 50)}...`);
        
        // Add bot reply to memory
        memoryManager.addMessage(chatId, "model", reply);
        
    } catch (error) {
        log(`❌ Error handling message from ${chatId}: ${error.message}`);
        // Silently fail - no error message sent to user
    }
}

async function replyWithTyping(message, reply) {
    try {
        const chat = await message.getChat();
        
        // Simulate seen delay (3-8 seconds)
        await new Promise(r => setTimeout(r, randomDelay(
            CONFIG.MIN_SEEN_DELAY, 
            CONFIG.MAX_SEEN_DELAY
        )));
        
        // Mark as seen
        await chat.sendSeen();
        await new Promise(r => setTimeout(r, 1000));
        
        // Show typing indicator
        await chat.sendStateTyping();
        
        // Calculate typing delay based on message length (more realistic)
        const typingDelay = Math.min(
            reply.length * CONFIG.TYPING_SPEED,
            15000 // Max 15 seconds typing
        );
        
        await new Promise(r => setTimeout(r, typingDelay));
        
        // Clear typing state
        await chat.clearState();
        
        // Send the reply
        await message.reply(reply);
        
    } catch (error) {
        log(`❌ Error in replyWithTyping: ${error.message}`);
        throw error;
    }
}

async function sendReaction(message, emoji) {
    try {
        // Random delay before reacting
        await new Promise(r => setTimeout(r, randomDelay(
            CONFIG.MIN_REACTION_DELAY,
            CONFIG.MAX_REACTION_DELAY
        )));
        
        await message.react(emoji);
        log(`👍 Reacted with ${emoji}`);
        
    } catch (error) {
        log(`❌ Error sending reaction: ${error.message}`);
    }
}

async function forwardBusinessMessage(userMessage, botReply) {
    try {
        const clientNumber = process.env.CLIENT_NUMBER || "2349061458909";
        const chat = await client.getChatById(`${clientNumber}@c.us`);
        
        const forwardMsg = `🔔 Business Message Alert\n\n` +
            `From: ${userMessage.from}\n` +
            `Message: "${userMessage}"\n\n` +
            `My Reply: "${botReply}"`;
        
        await chat.sendMessage(forwardMsg);
        log("✉️ Business message forwarded");
        
    } catch (error) {
        log(`❌ Failed to forward business message: ${error.message}`);
    }
}

// ==================== GRACEFUL SHUTDOWN ====================
async function gracefulShutdown() {
    log("🛑 Shutting down gracefully...");
    
    await memoryManager.autoSave();
    await rateLimiter.saveLimits();
    
    await client.destroy();
    process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// ==================== START ====================
client.initialize();
