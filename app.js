const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');
const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');
const client = new Client();

const genAI = new GoogleGenerativeAI('API_KEY'); // Replace with your valid API key
let waitForImage = false;

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('Client is ready!');
});

client.on('message', async msg => {
  const userMessage = msg.body.toLowerCase();

  // Initial greeting and purpose explanation
  if (isGreeting(userMessage)) {
    msg.reply('Hello! I am an interview bot. I can also help you with medical image analysis and provide symptom descriptions. Are you ready to start?');
    return;
  }

  // Check for request to send an image
  if (userMessage.includes('send image')) {
    msg.reply('Great! Please send the medical image you want me to analyze.');
    waitForImage = true;
    return;
  }

  // Process messages when waiting for an image
  if (waitForImage && msg.hasMedia) {
    try {
      // Download and save the image
      const media = await msg.downloadMedia();
      const extension = path.extname(media.mimetype); 
      const fileName = `user_image_${Date.now()}${extension}`;
      fs.writeFileSync(fileName, media.data, 'base64');

      // Send image to backend for classification
      const formData = new FormData();
      formData.append('file', fs.createReadStream(fileName));
      const response = await fetch('http://127.0.0.1:5000/classify_image', {
        method: 'POST',
        body: formData,
      });

      // Handle backend response and send to Gemini
      if (response.ok) {
        const data = await response.json();
        const alzheimerType = data.result.alzheimersType;

        
        if (!alzheimerType) {
          throw new Error("Backend response didn't include Alzheimer's type.");
        }

        const model = genAI.getGenerativeModel({ model: "gemini-pro" }); // Use text model
        const result = await model.generateContent({
          prompt: `Describe the symptoms of the ${alzheimerType} type of Alzheimer's disease.`,
        });
        const geminiResponse = await result.response;

        msg.reply(`**Based on the image:**\n${data.result.message}\n\n**the patient with the scan image have ${alzheimerType} Alzheimer's:**\n${geminiResponse.text()}`);
      } else {
        console.error('Backend error:', response.statusText);
        msg.reply('Error during image classification. Please try again.');
      }
    } catch (error) {
      console.error('Error:', error);
      msg.reply('An error occurred. Please try again later.');
    } finally {
      waitForImage = false; // Reset flag
    }
  }
});

client.initialize();

// Helper function to check for greeting messages
function isGreeting(message) {
  return message.includes('hello') || message.includes('hi') || message.includes('how are you') ||
   message.includes('what is your purpose') || message.includes('can you help me');
}
