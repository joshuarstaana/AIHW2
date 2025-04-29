require('dotenv').config();
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const requestIp = require('request-ip');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');
const fs = require('fs').promises;

const app = express();
const server = http.createServer(app);

// Session middleware setup
const sessionMiddleware = session({
    store: new FileStore({
        path: path.join(__dirname, 'sessions')
    }),
    secret: 'chat-session-secret',
    resave: true,
    saveUninitialized: true,
    cookie: { secure: false }
});

app.use(sessionMiddleware);
app.use(requestIp.mw());

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Chat storage setup
const CHAT_DIR = path.join(__dirname, 'chat_data');

// Ensure chat directory exists
async function ensureChatDir() {
    try {
        await fs.mkdir(CHAT_DIR, { recursive: true });
        console.log('Chat directory initialized:', CHAT_DIR);
    } catch (err) {
        console.error('Error creating chat directory:', err);
    }
}

// Get normalized IP address
function normalizeIP(ip) {
    return ip.replace(/[^a-zA-Z0-9]/g, '_');
}

// Load chat history for an IP
async function loadChatHistory(clientIp) {
    const normalizedIP = normalizeIP(clientIp);
    const filePath = path.join(CHAT_DIR, `${normalizedIP}.json`);
    console.log('Loading chat history from:', filePath);
    
    try {
        const data = await fs.readFile(filePath, 'utf8');
        const history = JSON.parse(data);
        console.log('Successfully loaded history for IP:', clientIp);
        return history;
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('No existing history for IP:', clientIp, 'creating new history file');
            const initialHistory = [{
                role: "system",
                content: "You are a helpful AI assistant. Provide clear, concise, and accurate responses."
            }];
            await saveChatHistory(clientIp, initialHistory);
            return initialHistory;
        }
        console.error('Error loading chat history:', err);
        return [{
            role: "system",
            content: "You are a helpful AI assistant. Provide clear, concise, and accurate responses."
        }];
    }
}

// Save chat history for an IP
async function saveChatHistory(clientIp, history) {
    const normalizedIP = normalizeIP(clientIp);
    const filePath = path.join(CHAT_DIR, `${normalizedIP}.json`);
    console.log('Saving chat history to:', filePath);
    
    try {
        await fs.writeFile(filePath, JSON.stringify(history, null, 2));
        console.log('Successfully saved chat history for IP:', clientIp);
        return true;
    } catch (err) {
        console.error('Error saving chat history:', err);
        return false;
    }
}

// Initialize storage
ensureChatDir();

// Store socket to IP mappings
const socketToIP = new Map();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Handle socket connections
io.on('connection', async (socket) => {
    try {
        // Get client IP with better fallback handling
        let clientIp = requestIp.getClientIp(socket.request);
        
        // Handle localhost/IPv6 cases
        if (!clientIp || clientIp === '::1' || clientIp === '127.0.0.1') {
            clientIp = 'localhost';
        } else if (clientIp.includes(':')) {
            clientIp = clientIp.split(':').pop();
        }
        
        console.log('Client connected with IP:', clientIp);
        socketToIP.set(socket.id, clientIp);

        socket.on('request history', async () => {
            const currentIp = socketToIP.get(socket.id);
            if (currentIp) {
                const history = await loadChatHistory(currentIp);
                const visibleHistory = history.filter(msg => msg.role !== 'system');
                console.log('Sending history to client:', currentIp);
                socket.emit('load history', visibleHistory);
            }
        });

        socket.on('chat message', async (msg) => {
            try {
                const currentIp = socketToIP.get(socket.id);
                if (!currentIp) {
                    throw new Error('No IP address found for socket');
                }

                socket.emit('typing', true);
                
                // Load current history
                const history = await loadChatHistory(currentIp);
                const userMessage = { role: "user", content: msg };
                history.push(userMessage);

                // Get AI response
                const completion = await openai.chat.completions.create({
                    messages: history,
                    model: "gpt-3.5-turbo",
                    temperature: 0.7,
                    max_tokens: 1000
                });

                const aiResponse = completion.choices[0].message;
                history.push(aiResponse);

                // Save updated history immediately
                await saveChatHistory(currentIp, history);

                // Send response to all clients with same IP
                const clients = await io.fetchSockets();
                for (const client of clients) {
                    if (socketToIP.get(client.id) === currentIp) {
                        client.emit('ai response', {
                            message: aiResponse.content,
                            timestamp: new Date().toISOString()
                        });
                    }
                }

            } catch (error) {
                console.error('Chat message error:', error);
                socket.emit('ai response', {
                    message: "I apologize, but I encountered an error processing your request. Please try again.",
                    timestamp: new Date().toISOString()
                });
            } finally {
                socket.emit('typing', false);
            }
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socketToIP.get(socket.id));
            socketToIP.delete(socket.id);
        });

    } catch (error) {
        console.error('Socket connection error:', error);
    }
});

// Serve index.html
app.get('/', (req, res) => {
    const clientIp = requestIp.getClientIp(req);
    console.log('Client accessing homepage with IP:', clientIp);
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});