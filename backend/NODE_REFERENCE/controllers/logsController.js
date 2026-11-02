const pool = require('../config/database');

const getAllLogs = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        l.*,
        u.username
      FROM activity_logs l
      LEFT JOIN users u ON l.user_id = u.id
      ORDER BY l.created_at DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      logs: result.rows
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ message: 'Error fetching logs' });
  }
};

module.exports = {
  getAllLogs
};