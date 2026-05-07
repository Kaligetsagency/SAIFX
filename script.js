let _supabase; 
let tickDataArray = []; 
let currentLivePrice = 0; 
let oldestTickEpoch = null; 
let tickChart;
let tickSeries;

// ==========================================
// 1. KUVUTA KEYS KUTOKA VERCEL
// ==========================================
async function initSupabaseFromEnv() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        if (config.url && config.apiKey) {
            _supabase = window.supabase.createClient(config.url, config.apiKey);
        }
    } catch (error) {
        document.getElementById('auth-error').innerText = "Kosa la mtandao au Keys.";
    }
}
window.addEventListener('load', initSupabaseFromEnv);

function isPinValid(pin) {
    if (pin.length !== 4) return false;
    const consecutive = ['1234', '2345', '3456', '4567', '5678', '6789', '4321', '5432', '6543', '7654', '8765', '9876'];
    const identical = pin.split('').every(char => char === pin[0]);
    return !consecutive.includes(pin) && !identical;
}

// ==========================================
// 2. LOGIN LOGIC
// ==========================================
async function handleAuth() {
    if (!_supabase) { alert("Mfumo unaunganishwa..."); return; }
    const phone = document.getElementById('phone').value;
    const pin = document.getElementById('pin').value;
    const errorMsg = document.getElementById('auth-error');

    if (!phone.match(/^0[0-9]{9}$/)) { errorMsg.innerText = "Namba ianze na 0 na tarakimu 10."; return; }
    if (!isPinValid(pin)) { errorMsg.innerText = "PIN ni dhaifu."; return; }

    errorMsg.innerText = "Inawasiliana..."; errorMsg.style.color = "yellow";

    try {
        const { data: user, error: fetchError } = await _supabase.from('app_users').select('*').eq('phone', phone).maybeSingle(); 
        if (user) {
            if (user.pin !== pin) { errorMsg.innerText = "PIN sio sahihi."; errorMsg.style.color = "#ff4d4d"; return; }
            let now = new Date(); let subEnd = new Date(user.subscription_end_date);
            if (now > subEnd) {
                document.getElementById('auth-section').style.display = 'none';
                document.getElementById('payment-section').style.display = 'block';
            } else { funguaApp(); }
        } else {
            let now = new Date(); let trialEnd = new Date(); trialEnd.setDate(now.getDate() + 14); 
            await _supabase.from('app_users').insert([{ phone: phone, pin: pin, trial_start_date: now.toISOString(), subscription_end_date: trialEnd.toISOString() }]);
            alert("Siku 14 za bure zimeanza!"); funguaApp();
        }
    } catch (err) { errorMsg.innerText = "Kosa la mtandao"; }
}

function initiatePayment(type, amount) { alert(`Malipo Tsh ${amount}...`); }

// ==========================================
// 3. KUFUNGUA APP NA DERIV API
// ==========================================
function funguaApp() {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('app-section').style.display = 'block';
    setupChart(); 
    connectDerivAPI(); 
}

let ws;
const app_id = 1089; 

function connectDerivAPI() {
    ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${app_id}`);
    
    ws.onopen = () => { 
        ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" })); 
    };

    ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        
        if (data.error) { console.error("Deriv Error:", data.error.message); return; }
        
        // ==========================================
        // SULUHISHO LA SPIDI YA MASOKO (DOM OPTIMIZATION)
        // ==========================================
        if (data.msg_type === 'active_symbols') {
            const select = document.getElementById('asset-select');
            let optionsHTML = ''; // Tunatumia Text badala ya kutengeneza element moja moja (Haraka sana)
            
            data.active_symbols.forEach(sym => {
                // Tunachukua Masoko yaliyo WAZI pekee (Inapunguza mzigo sana)
                if (sym.exchange_is_open) {
                    optionsHTML += `<option value="${sym.symbol}">${sym.display_name}</option>`;
                }
            });
            
            select.innerHTML = optionsHTML; // Tunayamimina yote kwa mpigo
            
            // Tunazuia Dropdown isitengeneze listner mara mbili
            select.removeEventListener('change', initTickStream);
            select.addEventListener('change', initTickStream);
            
            initTickStream(); // Anza kupakua Ticks za soko la kwanza
            
        // KUPOKEA TICKS ZA HISTORIA
        } else if (data.msg_type === 'history') {
            const prices = data.history.prices;
            const times = data.history.times;
            
            let newTicks = [];
            for(let i = 0; i < prices.length; i++) {
                newTicks.push({ time: times[i], value: prices[i] });
            }

            if (times.length > 0) { oldestTickEpoch = times[0]; }

            if (tickDataArray.length === 0) {
                tickDataArray = newTicks;
            } else {
                tickDataArray = [...newTicks, ...tickDataArray];
            }
            
            tickSeries.setData(tickDataArray);
            document.getElementById('analysis-results').innerHTML = `✅ Ticks ${tickDataArray.length} zimepakuliwa.`;
            document.getElementById('analysis-results').className = "results-box";

        // KUPOKEA LIVE TICKS 
        } else if (data.msg_type === 'tick') {
            let newTick = { time: data.tick.epoch, value: data.tick.quote };
            
            tickDataArray.push(newTick);
            tickSeries.update(newTick); 
            
            let priceBox = document.getElementById('live-price');
            if (newTick.value > currentLivePrice) { priceBox.style.color = '#00ff00'; } 
            else if (newTick.value < currentLivePrice) { priceBox.style.color = '#ff4d4d'; }
            
            priceBox.innerText = newTick.value;
            currentLivePrice = newTick.value;
        }
    };
}

// ==========================================
// 4. KUTENGENEZA CHATI
// ==========================================
function setupChart() {
    const container = document.getElementById('tick-chart-container');
    tickChart = LightweightCharts.createChart(container, {
        layout: { background: { type: 'solid', color: '#1e1e1e' }, textColor: '#DDD' },
        grid: { vertLines: { visible: false }, horzLines: { color: '#333' } },
        timeScale: { timeVisible: true, secondsVisible: true } 
    });
    tickSeries = tickChart.addAreaSeries({
        lineColor: '#2962FF', topColor: 'rgba(41, 98, 255, 0.4)', bottomColor: 'rgba(41, 98, 255, 0)'
    });
}

function initTickStream() {
    const asset = document.getElementById('asset-select').value;
    tickDataArray = []; 
    oldestTickEpoch = null;
    document.getElementById('analysis-results').innerHTML = 'Inapakua Ticks 5000...'; 
    document.getElementById('live-price').innerText = 'Inapakua...';
    document.getElementById('live-price').style.color = '#ffffff';

    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ forget_all: "ticks" }));
        ws.send(JSON.stringify({ ticks: asset, subscribe: 1 }));
        
        ws.send(JSON.stringify({
            ticks_history: asset,
            adjust_start_time: 1,
            count: 5000, 
            end: "latest",
            style: "ticks" 
        }));
    }
}

// KUPAKUA TICKS NYINGINE 5000 ZA NYUMA
function loadOlderTicks() {
    if (!oldestTickEpoch) return;
    const asset = document.getElementById('asset-select').value;
    document.getElementById('analysis-results').innerHTML = 'Inapakua Ticks za Nyuma...'; 

    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            ticks_history: asset,
            adjust_start_time: 1,
            count: 5000, 
            end: oldestTickEpoch, 
            style: "ticks"
        }));
    }
}

// ==========================================
// 5. ENGINE YA PURE PRICE ACTION UCHAMBUZI
// ==========================================
function runAnalysis() {
    const resultsBox = document.getElementById('analysis-results');

    if (tickDataArray.length < 1000) {
        resultsBox.innerHTML = "🛑 Subiri kidogo, Ticks hazijatosha kupiga hesabu...";
        resultsBox.className = "results-box system-alert";
        return; 
    }

    resultsBox.innerHTML = "Inachambua Price Action kwenye Ticks...";
    
    setTimeout(() => {
        const allPrices = tickDataArray.map(t => t.value);
        
        const trendPrices = allPrices.slice(-2000);
        const recentPrices = allPrices.slice(-300);

        let currentPrice = allPrices[allPrices.length - 1];
        let oldPrice = trendPrices[0];
        let trend = currentPrice >= oldPrice ? "UPTREND" : "DOWNTREND";

        let support = Math.min(...recentPrices);
        let resistance = Math.max(...recentPrices);
        let range = resistance - support;

        let entry, sl, tp, orderType;
        let decimals = currentPrice > 1000 ? 2 : (currentPrice > 10 ? 3 : 5);

        if (trend === "UPTREND") {
            orderType = "Buy Stop";
            entry = resistance + (range * 0.1); 
            sl = support; 
            tp = entry + (range * 1.5); 
        } else {
            orderType = "Sell Stop";
            entry = support - (range * 0.1); 
            sl = resistance; 
            tp = entry - (range * 1.5); 
        }

        let risk = Math.abs(entry - sl);
        let reward = Math.abs(tp - entry);
        let ratio = risk > 0 ? (reward / risk).toFixed(1) : "0";

        let htmlOutput = `
            ✅ <b>Pure Price Action (Ticks: ${tickDataArray.length})</b><br><br>
            <b>Micro-Trend:</b> ${trend}<br>
            <b>Order:</b> ${orderType} @ ${entry.toFixed(decimals)}<br>
            <b>Stop Loss:</b> ${sl.toFixed(decimals)}<br>
            <b>Take Profit:</b> ${tp.toFixed(decimals)}<br>
            <i>Risk:Reward Ratio = 1:${ratio}</i>
        `;

        if (risk >= reward || range === 0) {
            resultsBox.className = "results-box system-alert"; 
            htmlOutput += `
                <hr style="border-color:#ff4d4d; margin: 10px 0;">
                🛑 <b>SYSTEM ALERT: Choppy Market!</b><br>
                Soko linasuasua sana (Consolidation). Acha hii trade.
            `;
        } else {
            resultsBox.className = "results-box"; 
        }

        resultsBox.innerHTML = htmlOutput;
    }, 500); 
}
