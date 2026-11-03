const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

let bootstrapPromise = null;
let schedulingSchemaReady = false;

const requiredTables = [
  'scheduling_config',
  'scheduled_students',
  'time_slots',
  'appointments',
];

const getMigrationPath = () => path.join(__dirname, '../../database-migration-scheduling.sql');

const checkSchedulingTables = async () => {
  const result = await pool.query(
    `SELECT
      to_regclass('public.scheduling_config') AS scheduling_config,
      to_regclass('public.scheduled_students') AS scheduled_students,
      to_regclass('public.time_slots') AS time_slots,
      to_regclass('public.appointments') AS appointments`
  );

  const row = result.rows[0] || {};
  return requiredTables.every((tableName) => Boolean(row[tableName]));
};

const runSchedulingMigration = async () => {
  const migrationPath = getMigrationPath();
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await pool.query(sql);
};

const ensureSchedulingSchema = async () => {
  if (schedulingSchemaReady) {
    return;
  }

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const tablesExist = await checkSchedulingTables();

      if (!tablesExist) {
        console.log('Scheduling schema missing; applying migration now');
        await runSchedulingMigration();
      }

      schedulingSchemaReady = true;
    })().finally(() => {
      bootstrapPromise = null;
    });
  }

  return bootstrapPromise;
};

module.exports = { ensureSchedulingSchema };