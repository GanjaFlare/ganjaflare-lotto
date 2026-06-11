const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

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

// プレイ履歴の保存ファイルパス
const historyFile = path.join(__dirname, 'history.json');

// サーバー起動時に履歴を読み込む
let playedAccounts = new Map();
if (fs.existsSync(historyFile)) {
    try {
        const data = fs.readFileSync(historyFile, 'utf8');
        playedAccounts = new Map(JSON.parse(data));
    } catch (e) {
        console.error("Failed to load history:", e);
    }
}

// 履歴を保存する関数
function saveHistory() {
    try {
        fs.writeFileSync(historyFile, JSON.stringify([...playedAccounts]));
    } catch (e) {
        console.error("Failed to save history:", e);
    }
}

app.post('/', async (req, res) => {
    const { walletAddress, email } = req.body;

    // 1. UTC 12:00 リセットロジック
    const now = new Date();
    const lastReset = new Date(now);
    lastReset.setUTCHours(12, 0, 0, 0);
    if (now.getUTCHours() < 12) {
        lastReset.setUTCDate(lastReset.getUTCDate() - 1);
    }

    if (playedAccounts.has(email)) {
        const lastPlayed = new Date(playedAccounts.get(email));
        if (lastPlayed >= lastReset) {
            return res.status(403).json({ error: "You've already played today! Resets at 12:00 UTC." });
        }
    }

    // 2. 抽選ロジック
    const rand = Math.random();
    let tier = "Common";
    let amount = 10;
    if (rand < 0.01) { tier = "Mythic"; amount = 2000; }
    else if (rand < 0.05) { tier = "Legendary"; amount = 500; }
    else if (rand < 0.15) { tier = "Epic"; amount = 100; }
    else if (rand < 0.40) { tier = "Rare"; amount = 30; }

    try {
        const tx = await contract.transfer(walletAddress, ethers.utils.parseUnits(amount.toString(), 18));
        
        // プレイ記録を更新して保存
        playedAccounts.set(email, now.getTime());
        saveHistory();
        
        res.json({ tier, amount, txHash: tx.hash });
    } catch (error) {
        console.error("Transfer Error:", error);
        res.status(500).json({ error: "Transfer failed" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});