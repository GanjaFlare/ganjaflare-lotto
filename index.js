const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

// 設定
const RPC_URL = "https://flare-api.flare.network/ext/C/rpc";
const TOKEN_ADDRESS = "0x9aa42de5ec6f3b3bbf252bf8ac81acb338d888b7";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// 簡易ABI（transfer関数のみ）
const ABI = ["function transfer(address to, uint256 amount) public returns (bool)"];

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(TOKEN_ADDRESS, ABI, wallet);

app.post('/', async (req, res) => {
    const { walletAddress, email } = req.body;
    
    // 1. 抽選ロジック (例)
    const rand = Math.random();
    let tier = "Common";
    let amount = 10;
    if (rand < 0.01) { tier = "Mythic"; amount = 2000; }
    else if (rand < 0.05) { tier = "Legendary"; amount = 500; }
    
    try {
        // 2. 即時送金実行
        const tx = await contract.transfer(walletAddress, ethers.utils.parseUnits(amount.toString(), 18));
        await tx.wait(); // 送金完了まで待機
        
        res.json({ tier, amount, txHash: tx.hash });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Transfer failed" });
    }
});

app.listen(process.env.PORT || 3000);