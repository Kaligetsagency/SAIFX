const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// 1. KUSOMA VERCEL ENVIRONMENT VARIABLES (Tunatumia Service Role Key)
app.get('/api/config', (req, res) => {
    res.json({
        url: process.env.SUPABASE_URL,
        apiKey: process.env.SUPABASE_SERVICE_ROLE_KEY // Inachukua Service Key yako
    });
});

// 2. ENDPOINT YA MALIPO YA SNIPPE (Kwa baadaye)
app.post('/api/pay', async (req, res) => {
    const { phone, amount } = req.body;
    try {
        const response = await axios.post('https://api.snippe.com/v1/payment', {
            phone: phone,
            amount: amount,
            reference: `SUB_${Date.now()}`
        }, {
            headers: { 'Authorization': `Bearer ${process.env.SNIPPE_API_KEY}` }
        });
        res.json({ success: true, data: response.data });
    } catch (error) {
        res.status(500).json({ success: false, error: "Malipo yamekwama" });
    }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
}
