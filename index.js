app.post('/', async (req, res) => {
    const { walletAddress, email } = req.body;

    // UTC 12:00 リセットロジック
    const now = new Date();
    const lastReset = new Date(now);
    lastReset.setUTCHours(12, 0, 0, 0);
    if (now.getUTCHours() < 12) lastReset.setUTCDate(lastReset.getUTCDate() - 1);

    if (playedAccounts.has(email)) {
        const lastPlayed = new Date(playedAccounts.get(email));
        if (lastPlayed >= lastReset) {
            return res.status(403).json({ error: "You've already played today! Resets at 12:00 UTC." });
        }
    }

    // 確率設定：
    // Mythic: 0.5% (0.005)
    // Legendary: 3% (0.03) -> 累積 3.5% (0.035)
    // Epic: 10% (0.1) -> 累積 13.5% (0.135)
    // Rare: 20% (0.2) -> 累積 33.5% (0.335)
    // Common: 35% (0.35) -> 累積 68.5% (0.685)
    // No Luck: 残り 31.5%
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