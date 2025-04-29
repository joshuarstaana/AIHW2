require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');

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

// Store conversation histories for each socket
const conversations = new Map();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle socket connections
io.on('connection', (socket) => {
    console.log('A user connected');
    
    // Initialize conversation history for this socket
    conversations.set(socket.id, [
        {
            role: "system",
            content: "You are a helpful AI assistant. Provide clear, concise, and accurate responses."
        }
    ]);

    socket.on('chat message', async (msg) => {
        try {
            // Show typing indicator to client
            socket.emit('typing', true);

            // Get conversation history for this socket
            const conversationHistory = conversations.get(socket.id);
            
            // Add user message to history
            conversationHistory.push({ role: "user", content: msg });

            // Call OpenAI API with full conversation history
            const completion = await openai.chat.completions.create({
                messages: conversationHistory,
                model: "gpt-3.5-turbo",
                temperature: 0.7,
                max_tokens: 1000
            });

            // Get the response
            const aiResponse = completion.choices[0].message;
            
            // Add AI response to conversation history
            conversationHistory.push(aiResponse);
            
            // Update conversation history
            conversations.set(socket.id, conversationHistory);

            // Send the response back to the client
            io.emit('ai response', {
                message: aiResponse.content,
                timestamp: new Date().toISOString()
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
        // Clean up conversation history when user disconnects
        conversations.delete(socket.id);
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});