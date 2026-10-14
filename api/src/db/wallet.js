// Call while holding the wallet row lock, after the wallet procedure.
// seq identifies the latest write even when timestamps tie or are backdated.
export async function readWalletChange(client, userId) {
  const balance = await client.query('SELECT wallet_balance AS "walletBalance" FROM users WHERE id = $1', [userId]);
  const audit = await client.query(`
    SELECT id, changed_at AS "changedAt", action_type AS "actionType",
           amount_changed AS "amountChanged", balance_after AS "balanceAfter"
      FROM wallet_audit_logs WHERE user_id = $1
     ORDER BY seq DESC LIMIT 1`, [userId]);
  return { walletBalance: balance.rows[0].walletBalance, auditEntry: audit.rows[0] };
}
