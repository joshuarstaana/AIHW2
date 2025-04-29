const fs = require('fs').promises;
const path = require('path');

class ChatStorage {
    constructor(storageDir) {
        this.storageDir = storageDir;
        this.conversations = new Map();
        this.initialize();
    }

    async initialize() {
        try {
            await fs.mkdir(this.storageDir, { recursive: true });
            console.log('Chat storage directory initialized:', this.storageDir);
            
            // Load all existing conversations
            const files = await fs.readdir(this.storageDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const clientIP = file.replace('.json', '');
                    await this.loadConversation(clientIP);
                }
            }
        } catch (error) {
            console.error('Error initializing chat storage:', error);
        }
    }

    getFilePath(clientIP) {
        // Sanitize IP for filename
        const safeIP = clientIP.replace(/[^a-zA-Z0-9]/g, '_');
        const filePath = path.join(this.storageDir, `${safeIP}.json`);
        console.log('Debug - File path for IP:', clientIP, 'is:', filePath);
        return filePath;
    }

    async loadConversation(clientIP) {
        try {
            const filePath = this.getFilePath(clientIP);
            console.log('Debug - Loading conversation from:', filePath);
            
            let conversation;
            try {
                const data = await fs.readFile(filePath, 'utf8');
                conversation = JSON.parse(data);
                console.log('Debug - Loaded existing conversation for:', clientIP);
            } catch (error) {
                // If file doesn't exist or is invalid, initialize new conversation
                conversation = [{
                    role: "system",
                    content: "You are a helpful AI assistant. Provide clear, concise, and accurate responses."
                }];
                console.log('Debug - Initialized new conversation for:', clientIP);
            }

            this.conversations.set(clientIP, conversation);
            return conversation;
        } catch (error) {
            console.error('Error in loadConversation:', error);
            throw error;
        }
    }

    async saveConversation(clientIP) {
        try {
            const conversation = this.conversations.get(clientIP);
            if (!conversation) {
                console.error('No conversation found for IP:', clientIP);
                return false;
            }

            const filePath = this.getFilePath(clientIP);
            console.log('Debug - Saving conversation to:', filePath);
            console.log('Debug - Conversation data:', JSON.stringify(conversation));

            await fs.writeFile(filePath, JSON.stringify(conversation, null, 2));
            console.log('Debug - Successfully saved conversation for:', clientIP);
            return true;
        } catch (error) {
            console.error('Error saving conversation:', error);
            return false;
        }
    }

    async addMessage(clientIP, message) {
        try {
            if (!this.conversations.has(clientIP)) {
                await this.loadConversation(clientIP);
            }

            const conversation = this.conversations.get(clientIP);
            conversation.push(message);
            
            // Save immediately after adding message
            const saved = await this.saveConversation(clientIP);
            if (!saved) {
                console.error('Failed to save conversation after adding message');
            }
            
            return conversation;
        } catch (error) {
            console.error('Error in addMessage:', error);
            throw error;
        }
    }

    async getConversation(clientIP) {
        try {
            if (!this.conversations.has(clientIP)) {
                await this.loadConversation(clientIP);
            }
            return this.conversations.get(clientIP);
        } catch (error) {
            console.error('Error in getConversation:', error);
            throw error;
        }
    }
}

module.exports = ChatStorage;