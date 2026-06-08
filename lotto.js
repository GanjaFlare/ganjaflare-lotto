// api/lotto.js
const { ethers } = require("ethers");

// 📌 デプロイしたロトコントラクトの最小限のABI設定
const LOTTO_ABI = [
    "function payoutReward(address _playerWallet, string memory _tier, uint256 _amount) external"
];

// 🔗 Flare Coston2 テストネットのRPCノードURL
const COSTON2_RPC_URL = "https://coston2-api.flare.network/ext/bc/C/rpc";
const LOTTO_CONTRACT_ADDRESS = "0xc40A288E75CdBdb30a84dFBA25D89F438B023DDE";

// 💡 簡易的な1日1回制限用のインメモリキャッシュ（Vercelのインスタンス再起動でリセットされますが、テスト用としては十分機能します）
// ※本番環境で厳密に管理する場合は、SupabaseやFirebase、Upstash Redisなどの軽量DBとの連携を推奨します。
const playedUsersCache = {}; 

module.exports = async (req, res) => {
    // CORS（クロスドメイン）対策の設定
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method not allowed" });
    }

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
            // Vercelの環境変数から「Lotto賞金用ウォレット」の秘密鍵を安全に読み込み
            const privateKey = process.env.LOTTO_RELAYER_PRIVATE_KEY;
            if (!privateKey) {
                return res.status(500).json({ error: "Relayer private key not configured on server" });
            }

            // Web3プロバイダーとウォレット（署名者）の初期化
            const provider = new ethers.JsonRpcProvider(COSTON2_RPC_URL);
            const wallet = new ethers.Wallet(privateKey, provider);
            const lottoContract = new ethers.Contract(LOTTO_CONTRACT_ADDRESS, LOTTO_ABI, wallet);

            // トークンの桁数（18桁のwei単位）に変換（例: 10枚 -> 10000000000000000000）
            const tokenAmountWei = ethers.parseUnits(amount.toString(), 18);

            // 👑 コントラクトの payoutReward 関数を、賞金用ウォレットがガス代を払って実行！
            const tx = await lottoContract.payoutReward(walletAddress, tier, tokenAmountWei);
            await tx.wait(); // トランザクションがブロックに承認されるまで待機
        }

        // 5. プレイ履歴をキャッシュに記録（24時間ロック）
        playedUsersCache[email] = now;

        // フロントエンドに結果を安全に返す
        return res.status(200).json({
            success: true,
            tier: tier,
            amount: amount
        });

    } catch (error) {
        console.error("Lotto Error:", error);
        return res.status(500).json({ error: "Internal server error", details: error.message });
    }
};