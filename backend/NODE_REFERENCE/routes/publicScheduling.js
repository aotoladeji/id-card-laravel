const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../config/database');

let captureCodeSchemaReady = false;
let captureCodeSchemaPromise = null;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const getCaptureAppBaseUrl = () => {
  const url = (process.env.CAPTURE_APP_URL || '').trim().replace(/\/+$/, '');
  return url || 'https://id-card-platform.vercel.app';
};

const generateCaptureLoginCode = () => crypto.randomInt(100000, 999999).toString();

const normalizeText = (value) => String(value || '').trim();

const isCaptureApiKeyAuthorized = (req) => {
  const expected = normalizeText(process.env.VERIFY_API_KEY);
  if (!expected) return false;

  const headerKey = normalizeText(req.get('x-api-key'));
  const verifyHeaderKey = normalizeText(req.get('x-verify-api-key'));
  const authHeader = normalizeText(req.get('authorization'));
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  return [headerKey, verifyHeaderKey, bearerToken].some((token) => token && token === expected);
};

const ensureCaptureLoginSchema = async () => {
  if (captureCodeSchemaReady) return;

  if (!captureCodeSchemaPromise) {
    captureCodeSchemaPromise = (async () => {
      await pool.query('ALTER TABLE scheduled_students ADD COLUMN IF NOT EXISTS capture_login_code VARCHAR(6)');
      await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_students_capture_login_code ON scheduled_students(capture_login_code)');
      captureCodeSchemaReady = true;
    })().finally(() => {
      captureCodeSchemaPromise = null;
    });
  }

  await captureCodeSchemaPromise;
};

const getOrCreateCaptureLoginCode = async (studentId, existingCode = null) => {
  if (existingCode) return existingCode;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidateCode = generateCaptureLoginCode();

    try {
      const updateResult = await pool.query(
        `UPDATE scheduled_students
         SET capture_login_code = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND capture_login_code IS NULL
         RETURNING capture_login_code`,
        [candidateCode, studentId]
      );

      if (updateResult.rows.length > 0) {
        return updateResult.rows[0].capture_login_code;
      }

      const refreshResult = await pool.query(
        'SELECT capture_login_code FROM scheduled_students WHERE id = $1 LIMIT 1',
        [studentId]
      );

      if (refreshResult.rows.length > 0 && refreshResult.rows[0].capture_login_code) {
        return refreshResult.rows[0].capture_login_code;
      }
    } catch (error) {
      if (error.code !== '23505') {
        throw error;
      }
      // Retry when random code collides with an existing unique code.
    }
  }

  throw new Error('Unable to generate unique capture login code');
};

// Student login for scheduling
router.post('/login', async (req, res) => {
  try {
    const { configId, studentId, loginCode } = req.body;
    const normalizedStudentId = String(studentId || '').trim();
    const normalizedLoginCode = String(loginCode || '').trim();

    if (!configId || !normalizedStudentId || !normalizedLoginCode) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if config is active and not closed
    const configResult = await pool.query(
      'SELECT * FROM scheduling_config WHERE id = $1 AND is_active = true AND is_closed = false',
      [configId]
    );

    if (configResult.rows.length === 0) {
      return res.status(404).json({ message: 'Scheduling is not available or has been closed' });
    }

    // Find student — login_code is NULL after booking (one-time use)
    const studentResult = await pool.query(
      `SELECT * FROM scheduled_students 
       WHERE config_id = $1 
       AND LOWER(TRIM(COALESCE(matric_number, ''))) = LOWER($2)
       AND login_code = $3`,
      [configId, normalizedStudentId, normalizedLoginCode]
    );

    if (studentResult.rows.length === 0) {
      // Check if code was already used (student exists but code is null/different)
      const usedCheck = await pool.query(
        `SELECT has_scheduled FROM scheduled_students
         WHERE config_id = $1
           AND LOWER(TRIM(COALESCE(matric_number, ''))) = LOWER($2)
           AND login_code IS NULL`,
        [configId, normalizedStudentId]
      );
      if (usedCheck.rows.length > 0) {
        return res.status(401).json({ message: 'Your login code has already been used. Appointment is already booked.' });
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const student = studentResult.rows[0];

    // Check if already scheduled
    const appointmentResult = await pool.query(
      'SELECT * FROM appointments WHERE student_id = $1',
      [student.id]
    );

    res.json({
      success: true,
      student: {
        id: student.id,
        fullName: student.full_name,
        email: student.email,
        faculty: student.faculty,
        department: student.department,
        level: student.level,
        hasScheduled: student.has_scheduled,
        appointment: appointmentResult.rows[0] || null
      },
      config: configResult.rows[0]
    });
  } catch (error) {
    console.error('Error in student login:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get available slots for a student
router.get('/:configId/available-slots', async (req, res) => {
  try {
    const { configId } = req.params;

    const slots = await pool.query(`
      SELECT * FROM time_slots
      WHERE config_id = $1 
        AND is_available = true 
        AND booked < capacity
        AND slot_date >= CURRENT_DATE
      ORDER BY slot_date, slot_time
    `, [configId]);

    // Group by date
    const slotsByDate = {};
    slots.rows.forEach(slot => {
      const dateKey = slot.slot_date.toISOString().split('T')[0];
      if (!slotsByDate[dateKey]) {
        slotsByDate[dateKey] = [];
      }
      slotsByDate[dateKey].push(slot);
    });

    res.json({
      success: true,
      slots: slotsByDate
    });
  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500).json({ message: 'Error fetching available slots' });
  }
});

// Book appointment
router.post('/book', async (req, res) => {
  const { studentId, slotId, configId } = req.body;
  const parsedStudentId = Number.parseInt(studentId, 10);
  const parsedSlotId = Number.parseInt(slotId, 10);
  const parsedConfigId = Number.parseInt(configId, 10);

  if (!Number.isInteger(parsedStudentId) || !Number.isInteger(parsedSlotId) || !Number.isInteger(parsedConfigId)) {
    return res.status(400).json({ message: 'Invalid booking request payload' });
  }

  let client;
  try {
    await ensureCaptureLoginSchema();
    client = await pool.connect();

    await client.query('BEGIN');

    const configResult = await client.query(
      'SELECT id, is_active, is_closed FROM scheduling_config WHERE id = $1',
      [parsedConfigId]
    );

    if (configResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Scheduling configuration not found' });
    }

    if (!configResult.rows[0].is_active || configResult.rows[0].is_closed) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Scheduling is not available for booking' });
    }

    const studentResult = await client.query(
      'SELECT id, config_id, has_scheduled, email, full_name, matric_number FROM scheduled_students WHERE id = $1',
      [parsedStudentId]
    );

    if (studentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Student not found for this booking' });
    }

    if (studentResult.rows[0].config_id !== parsedConfigId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Student does not belong to this schedule' });
    }

    if (studentResult.rows[0].has_scheduled) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'You already have an appointment scheduled' });
    }

    // Check if student already has appointment
    const existingAppt = await client.query(
      'SELECT * FROM appointments WHERE student_id = $1',
      [parsedStudentId]
    );

    if (existingAppt.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'You already have an appointment scheduled' });
    }

    // Check slot availability
    const slot = await client.query(
      `SELECT * FROM time_slots
       WHERE id = $1
         AND config_id = $2
         AND booked < capacity
       FOR UPDATE`,
      [parsedSlotId, parsedConfigId]
    );

    if (slot.rows.length === 0 || slot.rows[0].booked >= slot.rows[0].capacity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This slot is no longer available' });
    }

    // Generate a unique capture app login code for this booking.
    let captureLoginCode;
    let isUniqueCaptureCode = false;
    while (!isUniqueCaptureCode) {
      captureLoginCode = generateCaptureLoginCode();
      const existingCaptureCode = await client.query(
        'SELECT id FROM scheduled_students WHERE capture_login_code = $1 LIMIT 1',
        [captureLoginCode]
      );
      isUniqueCaptureCode = existingCaptureCode.rows.length === 0;
    }

    // Create appointment
    const appointment = await client.query(
      `INSERT INTO appointments 
       (config_id, student_id, slot_id, appointment_date, appointment_time)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id) DO NOTHING
       RETURNING *`,
      [parsedConfigId, parsedStudentId, parsedSlotId, slot.rows[0].slot_date, slot.rows[0].slot_time]
    );

    if (appointment.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'You already have an appointment scheduled' });
    }

    // Update slot booking count
    await client.query(
      'UPDATE time_slots SET booked = booked + 1 WHERE id = $1',
      [parsedSlotId]
    );

    // Update student status and invalidate login code (one-time use)
    const studentUpdate = await client.query(
      `UPDATE scheduled_students 
       SET has_scheduled = true, scheduled_date = $1, scheduled_time = $2,
           login_code = NULL, capture_login_code = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [slot.rows[0].slot_date, slot.rows[0].slot_time, captureLoginCode, parsedStudentId]
    );

    if (studentUpdate.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Student not found for this booking' });
    }

    await client.query('COMMIT');

    const student = studentResult.rows[0];
    let emailSent = false;
    let emailErrorMessage = null;

    if (student.email && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: student.email,
          subject: 'Booking Confirmed - Your Capture App Login Code',
          html: `
            <p>Dear <strong>${student.full_name || 'Student'}</strong>,</p>
            <p>Your ID card capture booking has been confirmed successfully.</p>
            <p><strong>Matric Number:</strong> ${student.matric_number || 'N/A'}</p>
            <p><strong>Appointment Date:</strong> ${new Date(slot.rows[0].slot_date).toLocaleDateString()}</p>
            <p><strong>Appointment Time:</strong> ${String(slot.rows[0].slot_time).substring(0, 5)}</p>
            <p><strong>Venue:</strong> McAurthur Building UI</p>
            <p><strong>Capture App Login Code:</strong> <span style="font-size:20px;letter-spacing:3px;color:#003399;">${captureLoginCode}</span></p>
            <p>Please keep this code safe. It is unique to your booking and required for login on the capture app.</p>
          `,
        });
        emailSent = true;
      } catch (mailError) {
        emailErrorMessage = mailError.message;
        console.error('Failed to send booking confirmation email:', mailError.message);
      }
    }

    res.json({
      success: true,
      message: 'Appointment booked successfully',
      appointment: appointment.rows[0],
      captureLoginCode,
      confirmationEmailSent: emailSent,
      confirmationEmailError: emailErrorMessage,
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Error booking appointment:', error);

    if (error.code === '23503') {
      return res.status(400).json({ message: 'Invalid booking reference data' });
    }

    if (error.code === '23505') {
      return res.status(409).json({ message: 'Appointment already exists for this student' });
    }

    if (error.code === '22P02') {
      return res.status(400).json({ message: 'Invalid booking identifiers provided' });
    }

    if (error.code === '23502') {
      return res.status(500).json({
        message: 'Error booking appointment',
        code: error.code,
        column: error.column || null,
        detail: error.detail || null
      });
    }

    res.status(500).json({
      message: 'Error booking appointment',
      code: error.code || 'UNKNOWN_ERROR'
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Capture app helper: fetch generated capture login code by matric number.
// Protected with VERIFY_API_KEY.
router.get('/capture-login-code/:matricNumber', async (req, res) => {
  try {
    if (!isCaptureApiKeyAuthorized(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await ensureCaptureLoginSchema();

    const matricNumber = normalizeText(req.params.matricNumber);
    if (!matricNumber) {
      return res.status(400).json({ success: false, message: 'Matric number is required' });
    }

    const result = await pool.query(
      `SELECT id, full_name, matric_number, capture_login_code, scheduled_date, scheduled_time, config_id
       FROM scheduled_students
       WHERE has_scheduled = true
         AND LOWER(TRIM(COALESCE(matric_number, ''))) = LOWER($1)
       ORDER BY updated_at DESC
       LIMIT 1`,
      [matricNumber]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No booked student found for this matric number' });
    }

    const student = result.rows[0];
    const captureLoginCode = await getOrCreateCaptureLoginCode(student.id, student.capture_login_code);

    return res.json({
      success: true,
      student: {
        id: student.id,
        fullName: student.full_name,
        matricNumber: student.matric_number,
        configId: student.config_id,
        scheduledDate: student.scheduled_date,
        scheduledTime: student.scheduled_time,
      },
      captureLoginCode,
    });
  } catch (error) {
    console.error('Error fetching capture login code:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching capture login code' });
  }
});

// Cancel appointment
router.post('/cancel', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { studentId } = req.body;

    await client.query('BEGIN');

    // Get appointment
    const appt = await client.query(
      'SELECT * FROM appointments WHERE student_id = $1',
      [studentId]
    );

    if (appt.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No appointment found' });
    }

    const appointment = appt.rows[0];

    // Update slot
    await client.query(
      'UPDATE time_slots SET booked = booked - 1 WHERE id = $1',
      [appointment.slot_id]
    );

    // Update student
    await client.query(
      `UPDATE scheduled_students 
       SET has_scheduled = false, scheduled_date = NULL, scheduled_time = NULL, capture_login_code = NULL
       WHERE id = $1`,
      [studentId]
    );

    // Delete appointment
    await client.query(
      'DELETE FROM appointments WHERE id = $1',
      [appointment.id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Appointment cancelled successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling appointment:', error);
    res.status(500).json({ message: 'Error cancelling appointment' });
  } finally {
    client.release();
  }
});

module.exports = router;