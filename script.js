let _supabase; 
let marketData = {}; // Hapa ndipo app itahifadhi data za chati za Live kupiga hesabu

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
            let tfKey = Object.keys(timeframes).find(key => timeframes[key] === data.req_id);
            // HIFADHI DATA ILI ENGINE IWEZE KUZISOMA WAKATI WA KUCHAMBUA
            marketData[tfKey] = data.candles; 
            renderChart(data.req_id, data.candles);
        }
    };
}

function initCharts() {
    const asset = document.getElementById('asset-select').value;
    marketData = {}; // Safisha data za asset iliyopita
    document.getElementById('analysis-results').innerHTML = ''; // Safisha majibu ya zamani
    
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
// 6. ENGINE HALISI YA UCHAMBUZI (LIVE DATA)
// ==========================================
function runAnalysis() {
    const resultsBox = document.getElementById('analysis-results');
    
    // Hakikisha data zimeshuka zote kabla ya kupiga hesabu
    if (!marketData['1d'] || !marketData['1hr'] || !marketData['4hr']) {
        resultsBox.innerHTML = "🛑 Subiri kidogo, Data zinapakuliwa kutoka sokoni...";
        resultsBox.className = "results-box system-alert";
        return;
    }

    resultsBox.innerHTML = "Inachambua Soko kwa Live Data...";
    resultsBox.className = "results-box"; 
    
    setTimeout(() => {
        // 1. KUSOMA DATA HALISI KUTOKA KWENYE CHATI ZILIZOONEKANA
        const dailyCandles = marketData['1d'];
        const hourlyCandles = marketData['1hr'].slice(-24); // Angalia masaa 24 yaliyopita
        const h4Candles = marketData['4hr'].slice(-30);

        // 2. KUTAFUTA MWELEKEO (Trend - Higher Highs/Lower Lows kwenye Daily)
        let lastDay = dailyCandles[dailyCandles.length - 1];
        let prevDay = dailyCandles[dailyCandles.length - 2];
        let trend = lastDay.close >= prevDay.close ? "UPTREND" : "DOWNTREND";

        // 3. KUTAFUTA SUPPORT NA RESISTANCE KWA SIKU YA LEO (1 Hour)
        let support = Math.min(...hourlyCandles.map(c => c.low));
        let resistance = Math.max(...hourlyCandles.map(c => c.high));
        let range = resistance - support;

        // 4. KUTAFUTA VIZUIZI VYA MBALI VYA TAKE PROFIT (4 Hour)
        let htfSupport = Math.min(...h4Candles.map(c => c.low));
        let htfResistance = Math.max(...h4Candles.map(c => c.high));

        let entry, sl, tp, orderType;
        let currentPrice = lastDay.close;

        // Tunatambua kama ni Forex (0.0001) au Indices (mf. 400000) ili kuweka desimali sahihi
        let decimals = currentPrice > 1000 ? 2 : (currentPrice > 10 ? 3 : 5);

        // 5. KUTOA MAAMUZI YA ODA (Top-Down Analysis Logic)
        if (trend === "UPTREND") {
            orderType = "Buy Stop";
            entry = resistance + (range * 0.05); // Entry iwe pips kadhaa juu ya Resistance
            sl = support; // SL chini ya Support
            
            // TP inalenga HTF Resistance. Lakini kama imekaribia sana, inatoa R:R mbaya kimakusudi ili ikuonye
            tp = htfResistance > entry + (range * 1.5) ? htfResistance : entry + (range * 0.8);
        } else {
            orderType = "Sell Stop";
            entry = support - (range * 0.05); // Entry pips kadhaa chini ya Support
            sl = resistance; 
            
            tp = htfSupport < entry - (range * 1.5) ? htfSupport : entry - (range * 0.8);
        }

        // 6. KUPIMA HATARI NA FAIDA (Risk:Reward)
        let risk = Math.abs(entry - sl);
        let reward = Math.abs(tp - entry);
        let ratio = (reward / risk).toFixed(1);

        let htmlOutput = `
            ✅ <b>Uchambuzi Umekamilika (Live Market Data)</b><br><br>
            <b>Mwelekeo (HTF):</b> ${trend}<br>
            <b>Order:</b> ${orderType} @ ${entry.toFixed(decimals)}<br>
            <b>Stop Loss:</b> ${sl.toFixed(decimals)}<br>
            <b>Take Profit:</b> ${tp.toFixed(decimals)}<br>
            <i>Risk:Reward Ratio = 1:${ratio}</i>
        `;

        // ALERT LOGIC: Onyo Jekundu endapo Risk inazidi au sawa na Reward
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
    }, 1000); 
}
