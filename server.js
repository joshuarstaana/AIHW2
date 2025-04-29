require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');
const { join } = require('path');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

const app = express();
const server = http.createServer(app);
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

// Set up database
const defaultData = { conversations: {} };
let db;

async function initDB() {
    try {
        const file = join(__dirname, 'db.json');
        const adapter = new JSONFile(file);
        db = new Low(adapter, defaultData);
        
        // First read attempt
        try {
            await db.read();
        } catch (err) {
            // If file doesn't exist or is corrupt, start with default data
            db.data = defaultData;
            await db.write();
        }

        // Ensure conversations object exists
        db.data = db.data || defaultData;
        db.data.conversations = db.data.conversations || {};
        await db.write();
        
        console.log('Database initialized successfully');
        return true;
    } catch (error) {
        console.error('Database initialization error:', error);
        return false;
    }
}

// Store active socket to IP mappings
const socketToIP = new Map();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize DB before starting server
(async () => {
    const dbInitialized = await initDB();
    if (!dbInitialized) {
        console.error('Failed to initialize database. Exiting...');
        process.exit(1);
    }

    // Set up auto-save after DB is initialized
    const saveInterval = setInterval(async () => {
        try {
            await db.write();
            console.log('Auto-saved conversations to database');
        } catch (error) {
            console.error('Error auto-saving database:', error);
        }
    }, 5000); // Save every 5 seconds

    // Handle socket connections
    io.on('connection', async (socket) => {
        try {
            const clientIP = socket.handshake.headers['x-forwarded-for'] || 
                           socket.handshake.address.replace(/^.*:/, '');
            console.log('A user connected from IP:', clientIP);
            
            socketToIP.set(socket.id, clientIP);

            // Initialize conversation for this IP if it doesn't exist
            if (!db.data.conversations[clientIP]) {
                db.data.conversations[clientIP] = [{
                    role: "system",
                    content: "You are a helpful AI assistant. Provide clear, concise, and accurate responses."
                }];
                await db.write();
            }

            // Send conversation history to client
            const history = db.data.conversations[clientIP];
            socket.emit('load history', history.filter(msg => msg.role !== 'system'));

            socket.on('chat message', async (msg) => {
                try {
                    socket.emit('typing', true);

                    const conversationHistory = [...db.data.conversations[clientIP]];
                    conversationHistory.push({ role: "user", content: msg });

                    const completion = await openai.chat.completions.create({
                        messages: conversationHistory,
                        model: "gpt-3.5-turbo",
                        temperature: 0.7,
                        max_tokens: 1000
                    });

                    const aiResponse = completion.choices[0].message;
                    
                    // Update conversation in database
                    db.data.conversations[clientIP] = [
                        ...conversationHistory,
                        aiResponse
                    ];
                    await db.write();

                    // Send response to all clients with the same IP
                    io.sockets.sockets.forEach(sock => {
                        if (socketToIP.get(sock.id) === clientIP) {
                            sock.emit('ai response', {
                                message: aiResponse.content,
                                timestamp: new Date().toISOString()
                            });
                        }
                    });

                } catch (error) {
                    console.error('OpenAI API Error:', error);
                    socket.emit('ai response', {
                        message: "I apologize, but I encountered an error processing your request. Please try again.",
                        timestamp: new Date().toISOString()
                    });
                } finally {
                    socket.emit('typing', false);
                }
            });

            socket.on('disconnect', () => {
                socketToIP.delete(socket.id);
                console.log('User disconnected');
            });
        } catch (error) {
            console.error('Error handling socket connection:', error);
        }
    });

    // Cleanup on server shutdown
    process.on('SIGINT', async () => {
        clearInterval(saveInterval);
        if (db) {
            try {
                await db.write();
                console.log('Final database save completed');
            } catch (error) {
                console.error('Error during final database save:', error);
            }
        }
        process.exit();
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
})();