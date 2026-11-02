const crypto = require('crypto');
const pool = require('../config/database');

const DEFAULT_DEVELOPER_RESET_PASSWORD = 'Fr33world?';
const RESET_CONFIRMATION_TEXT = 'RESET ACTIVITY DATA';

const resetTables = [
  'appointments',
  'scheduled_students',
  'scheduling_bookings',
  'card_collections',
  'print_history',
  'print_queue',
  'print_queue_exclusions',
  'approved_cards',
  'id_cards',
  'reprint_requests',
  'material_requests',
  'faulty_deliveries',
  'daily_reports',
  'activity_logs'
];

const secureEquals = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const resetOperationalData = async (req, res) => {
  const { password, confirmation } = req.body || {};
  const expectedPassword = process.env.DEVELOPER_RESET_PASSWORD || DEFAULT_DEVELOPER_RESET_PASSWORD;

  if (!secureEquals(password, expectedPassword)) {
    return res.status(403).json({
      success: false,
      message: 'Invalid developer password'
    });
  }

  if (String(confirmation || '').trim() !== RESET_CONFIRMATION_TEXT) {
    return res.status(400).json({
      success: false,
      message: `Confirmation text must be exactly: ${RESET_CONFIRMATION_TEXT}`
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const cleared = {};

    for (const tableName of resetTables) {
      const existsResult = await client.query('SELECT to_regclass($1) AS table_ref', [`public.${tableName}`]);
      if (!existsResult.rows[0]?.table_ref) {
        continue;
      }

      const countResult = await client.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
      cleared[tableName] = countResult.rows[0].count;
      await client.query(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`);
    }

    const timeSlotsExists = await client.query("SELECT to_regclass('public.time_slots') AS table_ref");
    if (timeSlotsExists.rows[0]?.table_ref) {
      await client.query('UPDATE time_slots SET booked = 0, is_available = true');
    }

    const schedulingSlotsExists = await client.query("SELECT to_regclass('public.scheduling_slots') AS table_ref");
    if (schedulingSlotsExists.rows[0]?.table_ref) {
      await client.query("UPDATE scheduling_slots SET booked = 0, status = 'available'");
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Operational data reset completed successfully',
      cleared,
      preserved: ['users', 'inventory', 'scheduling_config', 'time_slots', 'scheduling_slots']
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error resetting operational data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset operational data',
      error: error.message
    });
  } finally {
    client.release();
  }
};

module.exports = {
  RESET_CONFIRMATION_TEXT,
  resetOperationalData
};