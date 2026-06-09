// 【重要】プレイ履歴を保存する簡易メモリ（サーバー再起動でリセットされます）
const playedAccounts = new Map();

app.post('/', async (req, res) => {
    const { walletAddress, email } = req.body;

    // 1. 【制限チェック】24時間経過しているか確認
    const now = Date.now();
    if (playedAccounts.has(email)) {
        const lastPlayed = playedAccounts.get(email);
        if (now - lastPlayed < 24 * 60 * 60 * 1000) {
            return res.status(403).json({ error: "You can only play once every 24 hours." });
        }
    }

    try {
        // ... (ここから抽選ロジック)
        const rand = Math.random();
        // ... (中略：ティア決定など)
        
        // 2. 送金成功後に「プレイ済み」として登録
        const tx = await contract.transfer(walletAddress, ...);
        await tx.wait();

        playedAccounts.set(email, now); // 成功したら記録！
        
        res.json({ tier, amount, txHash: tx.hash });
    } catch (error) {
        res.status(500).json({ error: "Transfer failed" });
    }
});