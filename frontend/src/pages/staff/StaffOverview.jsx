import { useState, useEffect } from 'react';

export default function StaffOverview({ user }) {
  const [stats, setStats] = useState({
    totalCards: 0,
    pendingReprints: 0,
    approvedReprints: 0,
    dailyPrints: 0,
    cardsCollected: 0,
    collectionRate: 0
  });
  const [inventoryCategories, setInventoryCategories] = useState({
    ribbons: 0,
    film: 0,
    blankCards: 0,
    filter: 0,
    cleaner: 0
  });
  const [recentInventory, setRecentInventory] = useState([]);
  const [releasedMaterials, setReleasedMaterials] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
      
      // Fetch all data in parallel
      const [cardsRes, reprintsRes, inventoryRes, printHistoryRes, collectionsRes, materialsRes] = await Promise.all([
        fetch('/api/cards', { headers }),
        fetch('/api/reprint', { headers }),
        fetch('/api/inventory', { headers }),
        fetch('/api/print-history', { headers }),
        fetch('/api/collections', { headers }),
        fetch('/api/material', { headers })
      ]);

      const [cardsData, reprintsData, inventoryData, printHistoryData, collectionsData, materialsData] = await Promise.all([
        cardsRes.json(),
        reprintsRes.json(),
        inventoryRes.json(),
        printHistoryRes.json(),
        collectionsRes.json(),
        materialsRes.json()
      ]);

      const cards = cardsData.cards || [];
      const reprints = reprintsData.requests || [];
      const inventory = inventoryData.inventory || [];
      const printHistory = printHistoryData.history || [];
      const collections = collectionsData.collections || [];
      const userId = JSON.parse(localStorage.getItem('user') || '{}').id;
      const myMaterials = (materialsData.requests || []).filter(
        r => r.requested_by === userId && (r.status === 'approved' || r.status === 'fulfilled')
      );
      setReleasedMaterials(myMaterials);

      const today = new Date().toDateString();
      
      // Daily prints from print_history table (actual prints today)
      const todayPrints = printHistory.filter(p => 
        new Date(p.printed_at).toDateString() === today
      );

      // Cards collected from card_collections table
      const collectedCards = collections.filter(c => c.status === 'collected');
      
      // Collection rate based on collections table
      const awaitingCollection = collections.filter(c => c.status === 'awaiting_collection').length;
      const totalPrinted = collections.length;
      const collectionRate = totalPrinted > 0 
        ? Math.round((collectedCards.length / totalPrinted) * 100) 
        : 0;

      // Calculate inventory quantities per category
      const categoryMap = { ribbons: 0, film: 0, blankCards: 0, filter: 0, cleaner: 0 };
      const categoryKeys = {
        ribbon: 'ribbons',
        film: 'film',
        'blank card': 'blankCards',
        'blank cards': 'blankCards',
        filter: 'filter',
        cleaner: 'cleaner'
      };
      inventory.forEach(item => {
        const nameLower = (item.item_name || '').toLowerCase().trim();
        const key = categoryKeys[nameLower];
        if (key) categoryMap[key] += parseInt(item.quantity) || 0;
      });

      setInventoryCategories(categoryMap);

      setStats({
        totalCards: cards.length,
        pendingReprints: reprints.filter(r => r.status === 'pending').length,
        approvedReprints: reprints.filter(r => r.status === 'approved').length,
        dailyPrints: todayPrints.length,
        cardsCollected: collectedCards.length,
        collectionRate
      });

      setRecentInventory(inventory.slice(0, 5));
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  return (
    <>
      <div className="header">
        <h1>📊 Dashboard & Stock Overview</h1>
        <button className="btn btn-secondary btn-sm">
          📅 {new Date().toLocaleDateString()}
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Cards Issued</div>
          <div className="stat-value">{stats.totalCards}</div>
          <div className="stat-change positive">Active system cards</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">🎞️ Ribbons</div>
          <div className="stat-value">{inventoryCategories.ribbons}</div>
          <div className="stat-change">Units in stock</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">🎬 Film</div>
          <div className="stat-value">{inventoryCategories.film}</div>
          <div className="stat-change">Units in stock</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">🪪 Blank Cards</div>
          <div className="stat-value">{inventoryCategories.blankCards}</div>
          <div className="stat-change">Units in stock</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">🔧 Filter</div>
          <div className="stat-value">{inventoryCategories.filter}</div>
          <div className="stat-change">Units in stock</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">🧹 Cleaner</div>
          <div className="stat-value">{inventoryCategories.cleaner}</div>
          <div className="stat-change">Units in stock</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Pending Reprints</div>
          <div className="stat-value">{stats.pendingReprints}</div>
          <div className="stat-change">Awaiting approval</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Approved Reprints</div>
          <div className="stat-value">{stats.approvedReprints}</div>
          <div className="stat-change positive">Ready to print</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Daily Prints</div>
          <div className="stat-value">{stats.dailyPrints}</div>
          <div className="stat-change">Today's count</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Cards Collected</div>
          <div className="stat-value">{stats.cardsCollected}</div>
          <div className="stat-change positive">{stats.collectionRate}% collection rate</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">📦 Materials Released for Use</h3>
        </div>
        {releasedMaterials.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
            <p>No materials have been released for your use yet.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty Released</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {releasedMaterials.map(req => (
                <tr key={req.id}>
                  <td>{req.item_name}</td>
                  <td>{req.quantity}</td>
                  <td>{new Date(req.responded_at || req.created_at).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge badge-${
                      req.status === 'fulfilled' ? 'success' : 'info'
                    }`}>
                      {req.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}