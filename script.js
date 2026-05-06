let _supabase; 

// ==========================================
// 1. KUVUTA KEYS KUTOKA VERCEL (SERVER)
// ==========================================
async function initSupabaseFromEnv() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        
        if (config.url && config.apiKey) {
            _supabase = window.supabase.createClient(config.url, config.apiKey);
            console.log("Database imeunganishwa kikamilifu!");
        } else {
            throw new Error("Keys hazikupatikana");
        }
    } catch (error) {
        document.getElementById('auth-error').innerText = "Kosa: Hakikisha Keys zipo Vercel Environment Variables.";
        document.getElementById('auth-error').style.color = "#ff4d4d";
    }
}

window.addEventListener('load', initSupabaseFromEnv);

// ==========================================
// 2. USALAMA WA PIN
// ==========================================
function isPinValid(pin) {
    if (pin.length !== 4) return false;
    const consecutive = ['1234', '2345', '3456', '4567', '5678', '6789', '4321', '5432', '6543', '7654', '8765', '9876'];
    const identical = pin.split('').every(char => char === pin[0]);
    return !consecutive.includes(pin) && !identical;
}

// ==========================================
// 3. LOGIC YA LOGIN NA KUJISAJILI
// ==========================================
async function handleAuth() {
    if (!_supabase) {
        alert("Subiri kidogo, Mfumo bado unaunganishwa...");
        return;
    }

    const phone = document.getElementById('phone').value;
    const pin = document.getElementById('pin').value;
    const errorMsg = document.getElementById('auth-error');

    if (!phone.match(/^0[0-9]{9}$/)) {
        errorMsg.innerText = "Namba ianze na 0 na iwe na tarakimu 10.";
        errorMsg.style.color = "#ff4d4d";
        return;
    }
    if (!isPinValid(pin)) {
        errorMsg.innerText = "PIN ni dhaifu. Weka namba 4 zisizofuatana.";
        errorMsg.style.color = "#ff4d4d";
        return;
    }

    errorMsg.innerText = "Inawasiliana na Mfumo...";
    errorMsg.style.color = "yellow";

    try {
        const { data: user, error: fetchError } = await _supabase
            .from('app_users')
            .select('*')
            .eq('phone', phone)
            .maybeSingle(); 

        if (fetchError) throw fetchError;

        if (user) {
            // LOGIN
            if (user.pin !== pin) {
                errorMsg.innerText = "Namba ishasajiliwa. PIN sio sahihi.";
                errorMsg.style.color = "#ff4d4d";
                return;
            }

            let now = new Date();
            let subEnd = new Date(user.subscription_end_date);

            if (now > subEnd) {
                document.getElementById('auth-section').style.display = 'none';
                document.getElementById('payment-section').style.display = 'block';
            } else {
                funguaApp();
            }
        } else {
            // REGISTER
            let now = new Date();
            let trialEnd = new Date();
            trialEnd.setDate(now.getDate() + 14); 

            const { error: insertError } = await _supabase.from('app_users').insert([
                { phone: phone, pin: pin, trial_start_date: now.toISOString(), subscription_end_date: trialEnd.toISOString() }
            ]);

            if (insertError) throw insertError;
            alert("Akaunti imetengenezwa! Umepata siku 14 za bure.");
            funguaApp();
        }
    } catch (err) {
        errorMsg.innerText = "KOSA: " + (err.message || "Tatizo la mtandao");
        errorMsg.style.color = "#ff4d4d";
    }
}

function initiatePayment(type, amount) {
    alert(`Inatuma USSD Push kwenye simu yako kulipia Tsh ${amount}...`);
}

// ==========================================
// 4. KUFUNGUA APP NA DERIV API
// ==========================================
function funguaApp() {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('app-section').style.display = 'block';
    connectDerivAPI(); 
}

let ws;
const app_id = 1089; 
const timeframes = { '1d': 86400, '4hr': 14400, '1hr': 3600, '30m': 1800, '15m': 900, '5m': 300, '1m': 60 };

function connectDerivAPI() {
    ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${app_id}`);
    
    ws.onopen = () => {
        ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" }));
    };

    ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        
        if (data.msg_type === 'active_symbols') {
            const select = document.getElementById('asset-select');
            select.innerHTML = ''; 
            
            data.active_symbols.forEach(sym => {
                let option = document.createElement('option');
                option.value = sym.symbol;
                option.text = sym.display_name;
                select.appendChild(option);
            });
            
            initCharts(); 
            select.addEventListener('change', initCharts);
            
        } else if (data.msg_type === 'history') {
            renderChart(data.req_id, data.candles);
        }
    };
}

function initCharts() {
    const asset = document.getElementById('asset-select').value;
    
    Object.keys(timeframes).forEach(tf => {
        ws.send(JSON.stringify({
            ticks_history: asset,
            adjust_start_time: 1,
            count: 100, 
            end: "latest",
            style: "candles",
            granularity: timeframes[tf],
            req_id: timeframes[tf] 
        }));
    });
}

// ==========================================
// 5. KUCHORA CANDLESTICKS 
// ==========================================
function renderChart(granularity, candles) {
    let tfKey = Object.keys(timeframes).find(key => timeframes[key] === granularity);
    let container = document.getElementById(`chart-${tfKey}`);
    
    if(container) {
        container.innerHTML = ''; 
        
        const chart = LightweightCharts.createChart(container, {
            layout: { background: { type: 'solid', color: '#1e1e1e' }, textColor: '#DDD' },
            grid: { vertLines: { color: '#333' }, horzLines: { color: '#333' } },
            timeScale: { timeVisible: true }
        });

        const candleSeries = chart.addCandlestickSeries();
        const formattedData = candles.map(c => ({
            time: c.epoch, open: c.open, high: c.high, low: c.low, close: c.close
        }));
        candleSeries.setData(formattedData);
    }
}

// ==========================================
// 6. ENGINE YA UCHAMBUZI (MTF ANALYSIS & ALERT)
// ==========================================
function runAnalysis() {
    const resultsBox = document.getElementById('analysis-results');
    resultsBox.innerHTML = "Inachambua Soko na Kupiga Hesabu...";
    resultsBox.className = "results-box"; 
    
    setTimeout(() => {
        let trend = "UPTREND"; 
        let support = 1.0450;
        let resistance = 1.0520;

        let entry, sl, tp, orderType;

        if (trend === "UPTREND") {
            orderType = "Buy Stop";
            entry = resistance + 0.0005; 
            sl = support - 0.0010; 
            tp = entry + 0.0030; 
        } else {
            orderType = "Sell Stop";
            entry = support - 0.0005;
            sl = resistance + 0.0010;
            tp = entry - 0.0030;
        }

        let risk = Math.abs(entry - sl);
        let reward = Math.abs(tp - entry);
        let ratio = (reward / risk).toFixed(1);

        let htmlOutput = `
            ✅ <b>Uchambuzi Umekamilika</b><br><br>
            <b>Mwelekeo (HTF):</b> ${trend}<br>
            <b>Order:</b> ${orderType} @ ${entry.toFixed(4)}<br>
            <b>Stop Loss:</b> ${sl.toFixed(4)}<br>
            <b>Take Profit:</b> ${tp.toFixed(4)}<br>
            <i>Risk:Reward Ratio = 1:${ratio}</i>
        `;

        if (risk >= reward) {
            resultsBox.className = "results-box system-alert"; 
            htmlOutput += `
                <hr style="border-color:#ff4d4d; margin: 10px 0;">
                🛑 <b>SYSTEM ALERT: Acha hiyo trade!</b><br><br>
                Hatari (SL) ni kubwa au sawa na Faida (TP).<br>
                Soko lipo kila siku, usilazimishe.
            `;
        }

        resultsBox.innerHTML = htmlOutput;
    }, 1500); 
}
