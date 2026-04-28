require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const API_KEY = process.env.ROBLOX_API_KEY;
const GROUP_ID = process.env.GROUP_ID;
const PORT = process.env.PORT || 3001;

const HEADERS = {
  'x-api-key': API_KEY,
  'Content-Type': 'application/json'
};

// ─── TRANSACTIONS / SALES ────────────────────────────────────────────────────
app.get('/api/transactions', async (req, res) => {
  try {
    const cursor = req.query.cursor ? `&pageToken=${req.query.cursor}` : '';
    const response = await fetch(
      `https://apis.roblox.com/cloud/v2/groups/${GROUP_ID}/transactions?transactionType=Sale&maxPageSize=50${cursor}`,
      { headers: HEADERS }
    );
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GROUP INFO ───────────────────────────────────────────────────────────────
app.get('/api/group', async (req, res) => {
  try {
    const response = await fetch(
      `https://apis.roblox.com/cloud/v2/groups/${GROUP_ID}`,
      { headers: HEADERS }
    );
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GROUP MEMBERS ────────────────────────────────────────────────────────────
app.get('/api/members', async (req, res) => {
  try {
    const cursor = req.query.cursor ? `&pageToken=${req.query.cursor}` : '';
    const maxPage = req.query.limit || 20;
    const response = await fetch(
      `https://apis.roblox.com/cloud/v2/groups/${GROUP_ID}/memberships?maxPageSize=${maxPage}${cursor}`,
      { headers: HEADERS }
    );
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GROUP ROLES ──────────────────────────────────────────────────────────────
app.get('/api/roles', async (req, res) => {
  try {
    const response = await fetch(
      `https://apis.roblox.com/cloud/v2/groups/${GROUP_ID}/roles`,
      { headers: HEADERS }
    );
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── USER INFO (for enriching member data) ────────────────────────────────────
app.get('/api/user/:userId', async (req, res) => {
  try {
    const response = await fetch(
      `https://apis.roblox.com/cloud/v2/users/${req.params.userId}`,
      { headers: HEADERS }
    );
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ANALYTICS SUMMARY ────────────────────────────────────────────────────────
// Aggregates transactions to build a summary for the analytics page
app.get('/api/analytics', async (req, res) => {
  try {
    // Fetch up to 3 pages of transactions for analytics
    let allTransactions = [];
    let cursor = null;
    for (let i = 0; i < 3; i++) {
      const cursorParam = cursor ? `&pageToken=${cursor}` : '';
      const response = await fetch(
        `https://apis.roblox.com/cloud/v2/groups/${GROUP_ID}/transactions?transactionType=Sale&maxPageSize=50${cursorParam}`,
        { headers: HEADERS }
      );
      if (!response.ok) break;
      const data = await response.json();
      if (data.transactions) allTransactions = allTransactions.concat(data.transactions);
      cursor = data.nextPageToken;
      if (!cursor) break;
    }

    // Build analytics
    const itemMap = {};
    let totalRevenue = 0;
    const dailyMap = {};

    allTransactions.forEach(tx => {
      const amount = tx.robuxAmount || 0;
      totalRevenue += amount;

      const name = tx.details?.name || 'Unknown';
      if (!itemMap[name]) itemMap[name] = { name, revenue: 0, sales: 0 };
      itemMap[name].revenue += amount;
      itemMap[name].sales += 1;

      // Daily breakdown
      if (tx.timestamp) {
        const day = tx.timestamp.slice(0, 10);
        if (!dailyMap[day]) dailyMap[day] = 0;
        dailyMap[day] += amount;
      }
    });

    const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const dailyRevenue = Object.entries(dailyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14) // last 14 days
      .map(([date, revenue]) => ({ date, revenue }));

    res.json({
      totalRevenue,
      totalSales: allTransactions.length,
      topItems,
      dailyRevenue,
      avgOrderValue: allTransactions.length ? Math.round(totalRevenue / allTransactions.length) : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SERVE FRONTEND ───────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Roblox Dashboard running at http://localhost:${PORT}`);
  console.log(`   Group ID: ${GROUP_ID}`);
  console.log(`   API Key: ${API_KEY ? API_KEY.slice(0, 8) + '...' : 'NOT SET'}\n`);
});
