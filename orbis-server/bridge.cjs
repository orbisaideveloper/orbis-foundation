const express = require('express');
const router = express.Router();

router.post('/chat', async (req, res) => {
    const userMessage = req.body.message;

    try {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        // টার্মাক্সে চলা লোকাল ওলেমা সার্ভার বা টানেলের সাথে কানেকশন
        const ollamaResponse = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'tinyllama',
                prompt: userMessage,
                stream: true // টাইম-আউট এড়াতে স্ট্রিমিং অন করা হলো
            })
        });

        for await (const chunk of ollamaResponse.body) {
            res.write(chunk);
        }
        res.end();

    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ error: 'AI Server is down or unreachable.' });
    }
});

module.exports = router;
