// lotto.js
const { ethers } = require("ethers");
const express = require("express"); // 👈 常時待ち受け用のツールを追加

const app = express();
app.use(express.json()); // JSONデータを読み込めるようにする設定

// 📌 デプロイしたロトコントラクトの最小限のABI設定
const LOTTO_ABI = [
    "function payoutReward(address _playerWallet, string memory _tier, uint256 _amount) external"
];

// 🔗 Flare Coston2 テストネットのRPCノードURL
const COSTON2_RPC_URL = "https://coston2-api.flare.network/ext/bc/C/rpc";
const LOTTO_CONTRACT_ADDRESS = "0xc40A288E75CdBdb30a84dFBA25D89F438B023DDE";

// 💡 簡易的な1日1回制限用のインメモリキャッシュ
const playedUsersCache = {}; 

// CORS（クロスドメイン）対策の共通設定
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// 🎰 ロトのメイン処理
app.post("/", async (req, res) => {
    try {
        const { walletAddress, email, googleToken } = req.body;

        // 1. 最低限のバリデーションチェック
        if (!walletAddress || !email) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        if (!ethers.isAddress(walletAddress)) {
            return res.status(400).json({ error: "Invalid wallet address format" });
        }

        // 2. 🔐 1日1回制限のチェック（24時間制限）
        const now = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;
        if (playedUsersCache[email] && (now - playedUsersCache[email] < ONE_DAY)) {
            const remainingTime = Math.ceil((ONE_DAY - (now - playedUsersCache[email])) / (60 * 1000));
            return res.status(403).json({ error: `You can play again in ${remainingTime} minutes.` });
        }

        // 3. 🎲 サーバー側での安全な確率抽選（ブラックボックス化）
        const rand = Math.random() * 100;
        let tier = "No Luck";
        let amount = 0;

        if (rand < 0.5) {
            tier = "Mythic"; amount = 2000;
        } else if (rand < 2.0) {
            tier = "Legendary"; amount = 500;
        } else if (rand < 7.0) {
            tier = "Epic"; amount = 100;
        } else if (rand < 20.0) {
            tier = "Rare"; amount = 30;
        } else if (rand < 50.0) {
            tier = "Common"; amount = 10;
        }

        // 4. 当選した場合のみ、ブロックチェーン上で自動送金を実行
        if (amount > 0) {
            const privateKey = process.env.LOTTO_RELAYER_PRIVATE_KEY;
            if (!privateKey) {
                return res.status(500).json({ error: "Relayer private key not configured on server" });
            }

            const provider = new ethers.JsonRpcProvider(COSTON2_RPC_URL);
            const wallet = new ethers.Wallet(privateKey, provider);
            const lottoContract = new ethers.Contract(LOTTO_CONTRACT_ADDRESS, LOTTO_ABI, wallet);

            const tokenAmountWei = ethers.parseUnits(amount.toString(), 18);

            const tx = await lottoContract.payoutReward(walletAddress, tier, tokenAmountWei);
            await tx.wait();
        }

        // 5. プレイ履歴をキャッシュに記録（24時間ロック）
        playedUsersCache[email] = now;

        return res.status(200).json({
            success: true,
            tier: tier,
            amount: amount
        });

    } catch (error) {
        console.error("Lotto Error:", error);
        return res.status(500).json({ error: "Internal server error", details: error.message });
    }
});

// 🔌 Renderが指定するポート（または3000番）でサーバーを24時間起動させ続ける
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Lotto server is running on port ${PORT}`);
});