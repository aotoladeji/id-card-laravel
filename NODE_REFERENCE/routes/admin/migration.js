const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const fs = require('fs');
const path = require('path');

router.post('/run-scheduling-migration', async (req, res) => {
  try {
    const requiredKey = process.env.MIGRATION_API_KEY;
    if (requiredKey) {
      const providedKey = req.get('x-migration-key');
      if (!providedKey || providedKey !== requiredKey) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
    }

    console.log('🔄 Starting scheduling tables migration via API...\n');
    
    const migrationPath = path.join(__dirname, '../../../database-migration-scheduling.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Executing migration script...\n');
    await pool.query(sql);
    
    console.log('\n🎉 Scheduling migration completed successfully!\n');
    
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('scheduling_config', 'scheduled_students', 'time_slots', 'appointments')
      ORDER BY table_name
    `);
    
    console.log('Tables found:');
    result.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });
    
    if (result.rows.length === 4) {
      console.log('\n✅ All required scheduling tables are present!');
    }
    
    res.json({ 
      success: true, 
      message: 'Migration completed successfully',
      tablesCreated: result.rows.length
    });
  } catch (error) {
    console.error('❌ Migration error:', error);
    res.status(500).json({ 
      error: error.message,
      success: false
    });
  }
});

module.exports = router;
