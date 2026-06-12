const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const app = express();

app.use(cors());
app.use(express.json());

// 設定
const RPC_URL = "https://flare-api.flare.network/ext/C/rpc";
const TOKEN_ADDRESS = "0x9aa42de5ec6f3b3bbf252bf8ac81acb338d888b7";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

// DB接続用
const client = new MongoClient(MONGODB_URI);
let db;
client.connect().then(() => {
    db = client.db('ganjaflare');
    console.log("Connected to MongoDB!");
});

const ABI = ["function transfer(address to, uint256 amount) public returns (bool)"];
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(TOKEN_ADDRESS, ABI, wallet);

app.post('/', async (req, res) => {
    const { walletAddress, email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const now = new Date();
    const lastReset = new Date(now);
    lastReset.setUTCHours(12, 0, 0, 0);
    if (now.getUTCHours() < 12) lastReset.setUTCDate(lastReset.getUTCDate() - 1);

    // MongoDBから履歴を確認
    const history = await db.collection('plays').findOne({ email: email });
    if (history && new Date(history.lastPlayed) >= lastReset) {
        return res.status(403).json({ error: "You've already played today!" });
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
            await db.collection('plays').updateOne(
                { email: email },
                { $set: { lastPlayed: now.getTime() } },
                { upsert: true }
            );
            res.json({ tier, amount, txHash: tx.hash });
        } else {
            await db.collection('plays').updateOne(
                { email: email },
                { $set: { lastPlayed: now.getTime() } },
                { upsert: true }
            );
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