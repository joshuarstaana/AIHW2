// JavaScript for basic chat UI interactivity
const sendButton = document.getElementById('send-button');
const userInput = document.getElementById('user-input');
const messages = document.getElementById('messages');

sendButton.addEventListener('click', () => {
    const userMessage = userInput.value.trim();
    if (userMessage) {
        const messageElement = document.createElement('div');
        messageElement.textContent = `You: ${userMessage}`;
        messages.appendChild(messageElement);
        userInput.value = '';
        messages.scrollTop = messages.scrollHeight;

        // Placeholder for AI response
        const aiMessage = document.createElement('div');
        aiMessage.textContent = 'AI: This is a placeholder response.';
        messages.appendChild(aiMessage);
        messages.scrollTop = messages.scrollHeight;
    }
});

userInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendButton.click();
    }
});