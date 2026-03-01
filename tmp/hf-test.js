const axios = require('axios');
require('dotenv').config({ path: 'backend/.env' });

async function testHF() {
    const apiKey = process.env.HUGGING_FACE_API_KEY;
    console.log('Using API Key:', apiKey ? 'FOUND' : 'MISSING');

    const endpoints = [
        "https://api-inference.huggingface.co/models/openai/whisper-large-v3",
        "https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3",
        "https://router.huggingface.co/hf-inference/v1/audio/transcriptions",
        "https://api-inference.huggingface.co/v1/audio/transcriptions"
    ];

    for (const url of endpoints) {
        console.log(`\nTesting: ${url}`);
        try {
            // Send an empty or small buffer just to see the response type
            const response = await axios.post(url, Buffer.alloc(100), {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "audio/webm",
                },
                validateStatus: null // Capture all statuses
            });
            console.log(`Status: ${response.status} ${response.statusText}`);
            console.log('Body:', JSON.stringify(response.data).substring(0, 200));
        } catch (err) {
            console.log(`Error: ${err.message}`);
            if (err.response) {
                console.log(`Response Status: ${err.response.status}`);
                console.log(`Response Data: ${JSON.stringify(err.response.data)}`);
            }
        }
    }
}

testHF();
