require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Endpoint ya Kuanzisha Malipo (USSD Push)
app.post('/api/pay', async (req, res) => {
    const { phone, amount, packageType } = req.body;
    try {
        // Hapa tunatuma request kwenda Snippe API
        const response = await axios.post('https://api.snippe.com/v1/payment', {
            phone: phone,
            amount: amount,
            reference: `SUB_${Date.now()}`
        }, {
            headers: { 'Authorization': `Bearer ${process.env.SNIPPE_API_KEY}` }
        });
        res.json({ success: true, message: "Angalia simu yako kuweka PIN", data: response.data });
    } catch (error) {
        res.status(500).json({ success: false, error: "Malipo yamekwama" });
    }
});

// Snippe Webhook: Inapokea majibu kama malipo yamefanikiwa
app.post('/api/webhook/snippe', async (req, res) => {
    const { phone, status, packageType } = req.body;
    
    if (status === 'SUCCESS') {
        // Piga hesabu ya siku za kuongeza
        let daysToAdd = packageType === 'day' ? 1 : (packageType === 'week' ? 7 : 30);
        let expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + daysToAdd);

        // Update database ya mtumiaji
        await supabase.from('users').update({ 
            subscription_end_date: expiryDate.toISOString() 
        }).eq('phone', phone);
    }
    res.send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
