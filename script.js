// script.js mpya kwa ajili ya kupima UI (Testing) tu
function handleAuth() {
    try {
        const phone = document.getElementById('phone').value;
        const pin = document.getElementById('pin').value;
        const errorMsg = document.getElementById('auth-error');

        // Hii itatuambia kama button inafanya kazi kweli
        errorMsg.innerText = "Inasoma taarifa..."; 
        errorMsg.style.color = "yellow";

        if (!phone.match(/^0[0-9]{9}$/)) {
            errorMsg.innerText = "Namba ianze na 0 na iwe na tarakimu 10.";
            errorMsg.style.color = "#ff4d4d";
            return;
        }
        if (pin.length !== 4) {
            errorMsg.innerText = "Weka PIN yako ya namba 4.";
            errorMsg.style.color = "#ff4d4d";
            return;
        }

        // Kama taarifa zipo sawa, itatoa ujumbe huu
        alert("Safi sana! Button inafanya kazi mkuu. Namba yako ni: " + phone);
        
        // Ficha login, onyesha mfumo (Kupima UI)
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('app-section').style.display = 'block';

    } catch (err) {
        // Kama kuna kosa la kiufundi, litaonekana hapa badala ya kufichwa
        document.getElementById('auth-error').innerText = "KOSA: " + err.message;
    }
                }
