import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './ChatbotUI.css'; // Assuming the CSS file exists

const ChatbotUI = () => {
  const [chatHistory, setChatHistory] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isExpanded, setIsExpanded] = useState(true); // State for chat window expansion
  const chatContainerRef = useRef(null);

  useEffect(() => {
    // Scroll to the bottom of the chat container when new messages are added
    if (isExpanded) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, isExpanded]);

  const handleUserInput = (e) => {
    setUserInput(e.target.value);
  };

  const handleSendMessage = async () => {
    if (userInput.trim() !== '') {
      const newMessage = { role: 'user', content: userInput };
      const updatedChatHistory = [...chatHistory, newMessage];
      setChatHistory(updatedChatHistory);
      setUserInput('');
      setIsLoading(true);

      try {
        const response = await axios.post('http://localhost:30080/chat', {
          chatHistory: updatedChatHistory,
          input: userInput,
        });
        const botMessage = {
          role: 'assistant',
          content: response.data.answer,
        };
        setChatHistory([...updatedChatHistory, botMessage]);
      } catch (error) {
        console.error('Error sending message:', error);
        setError('Error sending message. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const toggleChatWindow = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="chatbot-container">
      <button className="toggle-button" onClick={toggleChatWindow}>
        {isExpanded ? 'Collapse Chat' : 'Expand Chat'}
      </button>
      {isExpanded && (
        <div className="chat-container" ref={chatContainerRef}>
          {chatHistory.map((message, index) => (
            <div
              key={index}
              className={`message-container ${
                message.role === 'user' ? 'user-message' : 'bot-message'
              }`}
            >
              <div
                className={`message-bubble ${
                  message.role === 'user' ? 'user-bubble' : 'bot-bubble'
                }`}
              >
                <div className="message-content">{message.content}</div>
              </div>
            </div>
          ))}
          {error && <div className="error-message">{error}</div>}
        </div>
      )}
      <div className="input-container">
        <input
          type="text"
          placeholder="Type your message..."
          value={userInput}
          onChange={handleUserInput}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleSendMessage();
            }
          }}
          disabled={isLoading}
        />
        <button onClick={handleSendMessage} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default ChatbotUI;
