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
const ROBLOSECURITY = process.env.ROBLOSECURITY;
const PORT = process.env.PORT || 3001;

const API_HEADERS = {
  'x-api-key': API_KEY,
  'Content-Type': 'application/json'
};

const COOKIE_HEADERS = {
  'Cookie': `.ROBLOSECURITY=${ROBLOSECURITY}`,
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0',
  'Accept': 'application/json'
};

// TRANSACTIONS
app.get('/api/transactions', async (req, res) => {
  try {
    const cursor = req.query.cursor ? `&cursor=${req.query.cursor}` : '';
    const url = `https://economy.roblox.com/v2/groups/${GROUP_ID}/transactions?transactionType=Sale&limit=50${cursor}`;
    console.log('Fetching transactions from:', url);
    console.log('Cookie set:', ROBLOSECURITY ? 'YES (length: ' + ROBLOSECURITY.length + ')' : 'NO');
    
    const response = await fetch(url, { headers: COOKIE_HEADERS });
    const text = await response.text();
    console.log('Roblox response status:', response.status);
    console.log('Roblox response body:', text.slice(0, 500));
    
    if (!response.ok) {
      return res.status(response.status).json({ error: text, status: response.status });
    }
    
    const data = JSON.parse(text);
    const transactions = (data.data || []).map(tx => ({
      robuxAmount: tx.currency?.amount || 0,
      timestamp: tx.created,
      transactionType: 'Sale',
      details: { name: tx.details?.name || 'Unknown Item', type: tx.details?.type || 'Asset' },
      agent: { user: { userId: tx.agent?.id, username: tx.agent?.name || 'Unknown' } }
    }));
    res.json({ transactions, nextPageToken: data.nextPageCursor || null });
  } catch (err) {
    console.error('Transaction error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GROUP INFO
app.get('/api/group', async (req, res) => {
  try {
    const response = await fetch(`https://apis.roblox.com/cloud/v2/groups/${GROUP_ID}`, { headers: API_HEADERS });
    if (!response.ok) { const err = await response.text(); return res.status(response.status).json({ error: err }); }
    res.json(await response.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GROUP MEMBERS
app.get('/api/members', async (req, res) => {
  try {
    const cursor = req.query.cursor ? `&pageToken=${req.query.cursor}` : '';
    const maxPage = req.query.limit || 20;
    const response = await fetch(`https://apis.roblox.com/cloud/v2/groups/${GROUP_ID}/memberships?maxPageSize=${maxPage}${cursor}`, { headers: API_HEADERS });
    if (!response.ok) { const err = await response.text(); return res.status(response.status).json({ error: err }); }
    res.json(await response.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GROUP ROLES
app.get('/api/roles', async (req, res) => {
  try {
    const response = await fetch(`https://apis.roblox.com/cloud/v2/groups/${GROUP_ID}/roles`, { headers: API_HEADERS });
    if (!response.ok) { const err = await response.text(); return res.status(response.status).json({ error: err }); }
    res.json(await response.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ANALYTICS
app.get('/api/analytics', async (req, res) => {
  try {
    let allTransactions = [];
    let cursor = null;
    for (let i = 0; i < 3; i++) {
      const cursorParam = cursor ? `&cursor=${cursor}` : '';
      const response = await fetch(`https://economy.roblox.com/v2/groups/${GROUP_ID}/transactions?transactionType=Sale&limit=50${cursorParam}`, { headers: COOKIE_HEADERS });
      if (!response.ok) break;
      const data = await response.json();
      if (data.data) allTransactions = allTransactions.concat(data.data);
      cursor = data.nextPageCursor;
      if (!cursor) break;
    }
    const itemMap = {};
    let totalRevenue = 0;
    const dailyMap = {};
    allTransactions.forEach(tx => {
      const amount = tx.currency?.amount || 0;
      totalRevenue += amount;
      const name = tx.details?.name || 'Unknown';
      if (!itemMap[name]) itemMap[name] = { name, revenue: 0, sales: 0 };
      itemMap[name].revenue += amount;
      itemMap[name].sales += 1;
      if (tx.created) { const day = tx.created.slice(0, 10); if (!dailyMap[day]) dailyMap[day] = 0; dailyMap[day] += amount; }
    });
    const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const dailyRevenue = Object.entries(dailyMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([date, revenue]) => ({ date, revenue }));
    res.json({ totalRevenue, totalSales: allTransactions.length, topItems, dailyRevenue, avgOrderValue: allTransactions.length ? Math.round(totalRevenue / allTransactions.length) : 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

app.listen(PORT, () => {
  console.log(`\n🚀 Roblox Dashboard running at http://localhost:${PORT}`);
  console.log(`   Group ID: ${GROUP_ID}`);
  console.log(`   API Key: ${API_KEY ? API_KEY.slice(0, 8) + '...' : 'NOT SET'}`);
  console.log(`   Cookie: ${ROBLOSECURITY ? 'SET ✓ (length: ' + ROBLOSECURITY.length + ')' : 'NOT SET ✗'}\n`);
});
