const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();

app.use(cors());
app.use(express.json());

const RPC_URL = "https://flare-api.flare.network/ext/C/rpc";
const TOKEN_ADDRESS = "0x9aa42de5ec6f3b3bbf252bf8ac81acb338d888b7";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

// 接続オプションを追加して安定性を向上
const client = new MongoClient(MONGODB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let db;
async function connectDB() {
    try {
        await client.connect();
        db = client.db('ganjaflare');
        console.log("Connected to MongoDB!");
    } catch (err) {
        console.error("MongoDB Connection Error:", err);
    }
}
connectDB();

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

    try {
        const history = await db.collection('plays').findOne({ email: email });
        if (history && new Date(history.lastPlayed) >= lastReset) {
            return res.status(403).json({ error: "You've already played today!" });
        }

        const rand = Math.random();
        let tier = "No Luck";
        let amount = 0;

        if (rand < 0.001) { tier = "Mythic"; amount = 2000; }          // 0.1%
        else if (rand < 0.010) { tier = "Legendary"; amount = 500; }  // 0.9% (0.001 + 0.009)
        else if (rand < 0.050) { tier = "Epic"; amount = 100; }       // 4.0% (0.010 + 0.040)
        else if (rand < 0.285) { tier = "Rare"; amount = 30; }        // 23.5% (0.050 + 0.235)
        else if (rand < 0.685) { tier = "Common"; amount = 10; }      // 40.0% (0.285 + 0.400)

        if (amount > 0) {
            const tx = await contract.transfer(walletAddress, ethers.utils.parseUnits(amount.toString(), 18));
            await db.collection('plays').updateOne({ email: email }, { $set: { lastPlayed: now.getTime() } }, { upsert: true });
            res.json({ tier, amount, txHash: tx.hash });
        } else {
            await db.collection('plays').updateOne({ email: email }, { $set: { lastPlayed: now.getTime() } }, { upsert: true });
            res.json({ tier, amount, txHash: null });
        }
    } catch (error) {
        console.error("Lotto Error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.listen(process.env.PORT || 3000, () => console.log("Server running"));