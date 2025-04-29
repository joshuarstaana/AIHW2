const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

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

    socket.on('chat message', (msg) => {
        // Echo the message back with a simulated delay
        setTimeout(() => {
            io.emit('ai response', {
                message: `Thank you for your message: "${msg}". This is a response from the AI.`,
                timestamp: new Date().toISOString()
            });
        }, 1000);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});