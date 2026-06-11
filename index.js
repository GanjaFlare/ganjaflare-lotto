const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express(); // ここでappを定義しています

app.use(cors());
app.use(express.json());

// 設定
const RPC_URL = "https://flare-api.flare.network/ext/C/rpc";
const TOKEN_ADDRESS = "0x9aa42de5ec6f3b3bbf252bf8ac81acb338d888b7";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const ABI = ["function transfer(address to, uint256 amount) public returns (bool)"];
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(TOKEN_ADDRESS, ABI, wallet);

const historyFile = path.join(__dirname, 'history.json');
let playedAccounts = new Map();
if (fs.existsSync(historyFile)) {
    try {
        const data = fs.readFileSync(historyFile, 'utf8');
        playedAccounts = new Map(JSON.parse(data));
    } catch (e) { console.error("Failed to load history:", e); }
}

function saveHistory() {
    try { fs.writeFileSync(historyFile, JSON.stringify([...playedAccounts])); }
    catch (e) { console.error("Failed to save history:", e); }
}

app.post('/', async (req, res) => {
    const { walletAddress, email } = req.body;

    const now = new Date();
    const lastReset = new Date(now);
    lastReset.setUTCHours(12, 0, 0, 0);
    if (now.getUTCHours() < 12) lastReset.setUTCDate(lastReset.getUTCDate() - 1);

    if (playedAccounts.has(email)) {
        const lastPlayed = new Date(playedAccounts.get(email));
        if (lastPlayed >= lastReset) {
            return res.status(403).json({ error: "You've already played today!" });
        }
    }

    // 確率設定
    const rand = Math.random();
    let tier = "No Luck"; 
    let amount = 0;

    if (rand < 0.005) { tier = "Mythic"; amount = 2000; }
    else if (rand < 0.035) { tier = "Legendary"; amount = 500; }
    else if (rand < 0.135) { tier = "Epic"; amount = 100; }
    else if (rand < 0.335) { tier = "Rare"; amount = 30; }
    else if (rand < 0.685) { tier = "Common"; amount = 10; }

    try {
        if (amount > 0) {
            const tx = await contract.transfer(walletAddress, ethers.utils.parseUnits(amount.toString(), 18));
            playedAccounts.set(email, now.getTime());
            saveHistory();
            res.json({ tier, amount, txHash: tx.hash });
        } else {
            playedAccounts.set(email, now.getTime());
            saveHistory();
            res.json({ tier, amount, txHash: null });
        }
    } catch (error) {
        console.error("Transfer Error:", error);
        res.status(500).json({ error: "Transfer failed" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});