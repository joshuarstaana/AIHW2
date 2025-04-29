// JavaScript for basic chat UI interactivity
document.addEventListener('DOMContentLoaded', () => {
    const socket = io({
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
    });
    
    const form = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const messages = document.getElementById('messages');
    const sendButton = document.getElementById('send-button');

    let isTyping = false;

    function createMessageThread(message, isUser = true) {
        const thread = document.createElement('div');
        thread.className = `py-6 ${isUser ? 'bg-[#343541]' : 'bg-[#444654]'}`;
        
        const container = document.createElement('div');
        container.className = 'max-w-3xl mx-auto px-4 flex gap-4 items-start';
        
        // Avatar
        const avatar = document.createElement('div');
        avatar.className = `w-8 h-8 rounded-full flex items-center justify-center text-white text-sm ${isUser ? 'bg-[#19c37d]' : 'bg-[#8e8ea0]'}`;
        avatar.textContent = isUser ? 'U' : 'A';
        
        // Message content
        const content = document.createElement('div');
        content.className = 'flex-1 message-content text-white';
        content.textContent = message;
        
        container.appendChild(avatar);
        container.appendChild(content);
        thread.appendChild(container);
        
        return thread;
    }

    function addTypingIndicator() {
        const thread = document.createElement('div');
        thread.className = 'py-6 bg-[#444654]';
        thread.id = 'typing-indicator';
        
        const container = document.createElement('div');
        container.className = 'max-w-3xl mx-auto px-4 flex gap-4 items-start';
        
        const avatar = document.createElement('div');
        avatar.className = 'w-8 h-8 rounded-full flex items-center justify-center text-white text-sm bg-[#8e8ea0]';
        avatar.textContent = 'A';
        
        const content = document.createElement('div');
        content.className = 'flex-1 text-white typing-indicator';
        content.textContent = 'AI is typing';
        
        container.appendChild(avatar);
        container.appendChild(content);
        thread.appendChild(container);
        
        return thread;
    }

    function scrollToBottom() {
        window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth'
        });
    }

    // Load chat history
    socket.on('load history', (history) => {
        console.log('Received chat history:', history);
        messages.innerHTML = '';
        if (history && history.length > 0) {
            history.forEach(msg => {
                messages.appendChild(createMessageThread(msg.content, msg.role === 'user'));
            });
            // Store history in localStorage as backup
            localStorage.setItem('chatHistory', JSON.stringify(history));
            scrollToBottom();
        }
    });

    socket.on('connect', () => {
        console.log('Connected to server');
        // Request history from server
        socket.emit('request history');
        
        // If server doesn't respond with history, try loading from localStorage
        setTimeout(() => {
            if (messages.children.length === 0) {
                const savedHistory = localStorage.getItem('chatHistory');
                if (savedHistory) {
                    const history = JSON.parse(savedHistory);
                    history.forEach(msg => {
                        messages.appendChild(createMessageThread(msg.content, msg.role === 'user'));
                    });
                    scrollToBottom();
                }
            }
        }, 1000);
    });

    socket.on('ai response', (data) => {
        console.log('Received AI response:', data);
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
        
        messages.appendChild(createMessageThread(data.message, false));
        
        // Update localStorage with new message
        const savedHistory = localStorage.getItem('chatHistory');
        const history = savedHistory ? JSON.parse(savedHistory) : [];
        history.push({ role: 'assistant', content: data.message });
        localStorage.setItem('chatHistory', JSON.stringify(history));
        
        scrollToBottom();
        isTyping = false;
        userInput.disabled = false;
        sendButton.disabled = false;
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = userInput.value.trim();
        
        if (message && !isTyping) {
            userInput.disabled = true;
            sendButton.disabled = true;
            isTyping = true;

            // Add message to UI and localStorage
            messages.appendChild(createMessageThread(message, true));
            const savedHistory = localStorage.getItem('chatHistory');
            const history = savedHistory ? JSON.parse(savedHistory) : [];
            history.push({ role: 'user', content: message });
            localStorage.setItem('chatHistory', JSON.stringify(history));

            socket.emit('chat message', message);
            userInput.value = '';
            scrollToBottom();
        }
    });

    socket.on('typing', (typing) => {
        if (typing && !document.getElementById('typing-indicator')) {
            messages.appendChild(addTypingIndicator());
            scrollToBottom();
        } else if (!typing) {
            const typingIndicator = document.getElementById('typing-indicator');
            if (typingIndicator) {
                typingIndicator.remove();
            }
        }
    });

    // Enable/disable send button based on input
    userInput.addEventListener('input', () => {
        const isEmpty = userInput.value.trim() === '';
        sendButton.disabled = isEmpty;
        sendButton.className = `absolute right-2 top-1/2 -translate-y-1/2 p-2 transition-colors ${
            isEmpty ? 'text-gray-600' : 'text-gray-400 hover:text-[#19c37d]'
        }`;
    });

    // Initial button state
    sendButton.disabled = true;
});