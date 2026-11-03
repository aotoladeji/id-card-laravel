const pool = require('../config/database');
const crypto = require('crypto');
const XLSX = require('xlsx');
const nodemailer = require('nodemailer');

// Generate random 6-digit login code
const generateLoginCode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

let captureCodeSchemaReady = false;
let captureCodeSchemaPromise = null;

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

const generateUniqueCaptureLoginCode = async (client) => {
  let captureLoginCode;
  let isUnique = false;

  while (!isUnique) {
    captureLoginCode = generateLoginCode();
    const existing = await client.query(
      'SELECT id FROM scheduled_students WHERE capture_login_code = $1 LIMIT 1',
      [captureLoginCode]
    );
    isUnique = existing.rows.length === 0;
  }

  return captureLoginCode;
};

const normalizeBaseUrl = (value) => {
  if (!value) return '';

  const trimmed = String(value).trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return '';
  }
};

const getFrontendBaseUrl = () => {
  const candidates = [
    process.env.FRONTEND_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL
  ];

  for (const candidate of candidates) {
    const normalized = normalizeBaseUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return 'http://localhost:3001';
};

const formatDateOrTbd = (value) => {
  if (!value) return 'TBD';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'TBD';
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const normalizeExcelHeader = (header) => {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const STUDENT_HEADER_ALIASES = {
  full_name: ['full_name', 'fullname', 'full_names', 'name', 'student_name'],
  email: ['email', 'e_mail', 'email_address', 'mail'],
  matric_number: ['matric_number', 'matric_no', 'matric', 'matricnumber', 'mat_no'],
  phone: ['phone', 'phone_number', 'mobile', 'mobile_number', 'gsm'],
  faculty: ['faculty'],
  department: ['department', 'dept'],
  level: ['level', 'class_level'],
  surname: ['surname', 'last_name', 'lastname'],
  other_names: ['other_names', 'other_name', 'first_name', 'othernames']
};

const getCanonicalStudentHeader = (header) => {
  const normalized = normalizeExcelHeader(header);
  if (!normalized) return '';

  for (const [canonical, aliases] of Object.entries(STUDENT_HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return canonical;
  }

  return normalized;
};

const parseStudentsFromWorksheet = (worksheet) => {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const scanLimit = Math.min(rows.length, 15);
  let bestHeaderIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < scanLimit; i++) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const keys = new Set();
    let score = 0;

    for (const cell of row) {
      const canonical = getCanonicalStudentHeader(cell);
      if (!canonical || keys.has(canonical)) continue;
      keys.add(canonical);
      if (Object.prototype.hasOwnProperty.call(STUDENT_HEADER_ALIASES, canonical)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestHeaderIndex = i;
    }
  }

  const headerRow = Array.isArray(rows[bestHeaderIndex]) ? rows[bestHeaderIndex] : [];
  const headers = headerRow.map((cell, idx) => {
    const canonical = getCanonicalStudentHeader(cell);
    return canonical || `column_${idx + 1}`;
  });

  const students = [];
  for (let i = bestHeaderIndex + 1; i < rows.length; i++) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const student = {};
    let hasValue = false;

    for (let col = 0; col < headers.length; col++) {
      const header = headers[col];
      const rawValue = row[col];
      const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;

      if (value !== undefined && value !== null && String(value).trim() !== '') {
        hasValue = true;
      }

      student[header] = value;
    }

    if (hasValue) {
      students.push(normalizeExcelRow(student));
    }
  }

  return students;
};

const normalizeExcelRow = (row = {}) => {
  const normalized = {};

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeExcelHeader(key);
    if (!normalizedKey) continue;

    // Keep first non-empty value if the same logical header appears more than once.
    if (normalized[normalizedKey] === undefined || normalized[normalizedKey] === null || normalized[normalizedKey] === '') {
      normalized[normalizedKey] = value;
    }
  }

  return normalized;
};

const getExcelValue = (row = {}, aliases = []) => {
  for (const alias of aliases) {
    const value = row[normalizeExcelHeader(alias)];
    if (value === undefined || value === null) continue;
    const trimmed = String(value).trim();
    if (trimmed !== '') return trimmed;
  }

  return null;
};

const getStudentEmail = (student = {}) => {
  return getExcelValue(student, ['email', 'e_mail', 'email_address', 'mail']);
};

const getStudentPhone = (student = {}) => {
  return getExcelValue(student, ['phone', 'phone_number', 'mobile', 'mobile_number', 'gsm']);
};

const getStudentFullName = (student = {}) => {
  const direct = getExcelValue(student, ['full_name', 'fullname', 'name']);
  if (direct) return direct;

  const surname = getExcelValue(student, ['surname', 'last_name']) || '';
  const otherNames = getExcelValue(student, ['other_names', 'other_name', 'first_name', 'othernames']) || '';
  const combined = `${surname} ${otherNames}`.trim();
  return combined || 'Unknown Student';
};

const extractMatricNumber = (student = {}) => {
  return getExcelValue(student, [
    'matric_number',
    'matric_no',
    'matricnumber',
    'matric'
  ]);
};

const getPreferredSender = () => {
  return process.env.SMTP_FROM || process.env.SMTP_USER || '"ID Card Unit" <noreply@university.edu>';
};

const isSenderRejectedError = (error) => {
  const combined = `${error?.code || ''} ${error?.responseCode || ''} ${error?.response || ''} ${error?.message || ''}`.toLowerCase();
  return (
    combined.includes('sender') ||
    combined.includes('mail from') ||
    combined.includes('envelope') ||
    combined.includes('from address') ||
    combined.includes('not owned by user') ||
    combined.includes('5.7.1') ||
    combined.includes('550') ||
    combined.includes('553')
  );
};

const isDailySendLimitError = (error) => {
  const combined = `${error?.code || ''} ${error?.responseCode || ''} ${error?.response || ''} ${error?.message || ''}`.toLowerCase();
  return (
    combined.includes('daily user sending limit exceeded') ||
    combined.includes('5.4.5') ||
    (combined.includes('gmail') && combined.includes('sending limit'))
  );
};

const sendManualBookingConfirmationEmail = async ({
  student,
  slot,
  configTitle,
  captureLoginCode,
  location,
  fallbackMatricNumber,
}) => {
  if (!student?.email || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return {
      sent: false,
      error: !student?.email
        ? 'Student email is missing'
        : 'SMTP credentials are not configured',
    };
  }

  const preferredSender = getPreferredSender();
  const fallbackSender = process.env.SMTP_USER || preferredSender;

  const html = `
    <p>Dear <strong>${student.full_name || 'Student'}</strong>,</p>
    <p>Your ID card capture booking has been confirmed successfully.</p>
    <p><strong>Matric Number:</strong> ${student.matric_number || fallbackMatricNumber || 'N/A'}</p>
    <p><strong>Appointment Date:</strong> ${new Date(slot.slot_date).toLocaleDateString()}</p>
    <p><strong>Appointment Time:</strong> ${String(slot.slot_time).substring(0, 5)}</p>
    <p><strong>Venue:</strong> ${location || 'McAurthur Building UI'}</p>
    <p><strong>Capture App Login Code:</strong> <span style="font-size:20px;letter-spacing:3px;color:#003399;">${captureLoginCode}</span></p>
    <p>Please keep this code safe. It is required to login on the capture app.</p>
  `;

  try {
    try {
      await transporter.sendMail({
        from: preferredSender,
        to: student.email,
        subject: `Booking Confirmed - Your Capture App Login Code (${configTitle || 'ID Card Scheduling'})`,
        html,
      });
    } catch (sendError) {
      const shouldRetryWithFallback =
        fallbackSender &&
        fallbackSender !== preferredSender &&
        isSenderRejectedError(sendError);

      if (!shouldRetryWithFallback) {
        throw sendError;
      }

      await transporter.sendMail({
        from: fallbackSender,
        to: student.email,
        subject: `Booking Confirmed - Your Capture App Login Code (${configTitle || 'ID Card Scheduling'})`,
        html,
      });
    }

    return { sent: true, error: null };
  } catch (error) {
    return { sent: false, error: error.message || 'Failed to send confirmation email' };
  }
};

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Generate time slots for a date
const generateTimeSlotsForDate = (date, dailyEndTime, slotsPerDay) => {
  const slots = [];
  const startHour = 9; // Start at 9 AM
  const endHour = parseInt(dailyEndTime.split(':')[0]);
  
  const totalMinutes = (endHour - startHour) * 60;
  const intervalMinutes = Math.floor(totalMinutes / slotsPerDay);
  
  for (let i = 0; i < slotsPerDay; i++) {
    const minutes = startHour * 60 + (i * intervalMinutes);
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`);
  }
  
  return slots;
};

// Create scheduling configuration
const createSchedulingConfig = async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      slotsPerPeriod,
      startDate,
      endDate,
      dailyEndTime,
      excludeWeekends,
      location,
      importantMessage
    } = req.body;

    // Validate
    if (!title || !type || !slotsPerPeriod || !startDate) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (slotsPerPeriod < 1) {
      return res.status(400).json({ message: 'Slots per period must be at least 1' });
    }

    const result = await pool.query(
      `INSERT INTO scheduling_config 
       (title, description, type, slots_per_period, start_date, end_date, 
        daily_end_time, exclude_weekends, location, important_message, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        title,
        description,
        type,
        slotsPerPeriod,
        startDate,
        endDate || null,
        dailyEndTime || '14:00:00',
        excludeWeekends !== false,
        location || 'MACARTHUR BUILDING UNIVERSITY OF IBADAN',    
        importantMessage || null,  
        req.user.id
      ]
    );

    const config = result.rows[0];

    // Generate time slots
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date(start.getTime() + (type === 'weekly' ? 7 : 30) * 24 * 60 * 60 * 1000);
    
    const currentDate = new Date(start);
    const slotsPerDay = type === 'weekly' ? Math.ceil(slotsPerPeriod / 5) : Math.ceil(slotsPerPeriod / 20);
    
    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay();
      
      // Skip weekends if configured
      if (excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const dateStr = currentDate.toISOString().split('T')[0];
      const timeSlots = generateTimeSlotsForDate(dateStr, dailyEndTime || '14:00:00', slotsPerDay);
      
      for (const time of timeSlots) {
        await pool.query(
          `INSERT INTO time_slots (config_id, slot_date, slot_time, capacity)
           VALUES ($1, $2, $3, 10)
           ON CONFLICT (config_id, slot_date, slot_time) DO NOTHING`,
          [config.id, dateStr, time]
        );
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'SCHEDULING_CREATED', `Created scheduling: ${title}`]
    );

    res.status(201).json({
      success: true,
      message: 'Scheduling configuration created successfully',
      config
    });
  } catch (error) {
    console.error('Error creating scheduling config:', error);
    res.status(500).json({ message: 'Error creating scheduling configuration' });
  }
};

// Get all configs
const getAllConfigs = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sc.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM scheduled_students WHERE config_id = sc.id) as total_students,
        (SELECT COUNT(*) FROM scheduled_students WHERE config_id = sc.id AND has_scheduled = true) as scheduled_count
      FROM scheduling_config sc
      LEFT JOIN users u ON sc.created_by = u.id
      ORDER BY sc.created_at DESC
    `);

    res.json({
      success: true,
      configs: result.rows
    });
  } catch (error) {
    console.error('Error fetching configs:', error);
    res.status(500).json({ message: 'Error fetching scheduling configurations' });
  }
};

// Get config by ID with details
const getConfigById = async (req, res) => {
  try {
    const { id } = req.params;

    const configResult = await pool.query(
      'SELECT * FROM scheduling_config WHERE id = $1',
      [id]
    );

    if (configResult.rows.length === 0) {
      return res.status(404).json({ message: 'Scheduling configuration not found' });
    }

    const studentsResult = await pool.query(
      'SELECT * FROM scheduled_students WHERE config_id = $1 ORDER BY created_at DESC',
      [id]
    );

    const slotsResult = await pool.query(
      'SELECT * FROM time_slots WHERE config_id = $1 ORDER BY slot_date, slot_time',
      [id]
    );

    res.json({
      success: true,
      config: configResult.rows[0],
      students: studentsResult.rows,
      slots: slotsResult.rows
    });
  } catch (error) {
    console.error('Error fetching config details:', error);
    res.status(500).json({ message: 'Error fetching configuration details' });
  }
};

// Update config
const updateConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, dailyEndTime, endDate } = req.body;

    const result = await pool.query(
      `UPDATE scheduling_config 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           daily_end_time = COALESCE($3, daily_end_time),
           end_date = COALESCE($4, end_date),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [title, description, dailyEndTime, endDate, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Configuration not found' });
    }

    res.json({
      success: true,
      message: 'Configuration updated successfully',
      config: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ message: 'Error updating configuration' });
  }
};

// Close/reopen scheduling
const closeReopenConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_closed } = req.body;

    const result = await pool.query(
      `UPDATE scheduling_config 
       SET is_closed = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [is_closed, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Configuration not found' });
    }

    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'SCHEDULING_TOGGLED', `${is_closed ? 'Closed' : 'Reopened'} scheduling ID: ${id}`]
    );

    res.json({
      success: true,
      message: `Scheduling ${is_closed ? 'closed' : 'reopened'} successfully`,
      config: result.rows[0]
    });
  } catch (error) {
    console.error('Error toggling config:', error);
    res.status(500).json({ message: 'Error toggling scheduling status' });
  }
};

// Reopen schedule with a new batch: new dates + new student Excel
const reopenWithNewBatch = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.body;

    if (!startDate) {
      return res.status(400).json({ message: 'Start date is required' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Student list file is required' });
    }

    const configResult = await client.query(
      'SELECT * FROM scheduling_config WHERE id = $1',
      [id]
    );
    if (configResult.rows.length === 0) {
      return res.status(404).json({ message: 'Configuration not found' });
    }
    const config = configResult.rows[0];

    await client.query('BEGIN');

    // Clear old batch data
    await client.query('DELETE FROM appointments WHERE config_id = $1', [id]);
    await client.query('DELETE FROM scheduled_students WHERE config_id = $1', [id]);
    await client.query('DELETE FROM time_slots WHERE config_id = $1', [id]);

    // Update config dates and reopen
    await client.query(
      `UPDATE scheduling_config
       SET start_date = $1, end_date = $2, is_closed = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [startDate, endDate || null, id]
    );

    // Regenerate time slots for the new date range
    const start = new Date(startDate);
    const end = endDate
      ? new Date(endDate)
      : new Date(start.getTime() + (config.type === 'weekly' ? 7 : 30) * 24 * 60 * 60 * 1000);
    const slotsPerDay = config.type === 'weekly'
      ? Math.ceil(config.slots_per_period / 5)
      : Math.ceil(config.slots_per_period / 20);

    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay();
      if (config.exclude_weekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }
      const dateStr = currentDate.toISOString().split('T')[0];
      const timeSlots = generateTimeSlotsForDate(dateStr, config.daily_end_time || '14:00:00', slotsPerDay);
      for (const time of timeSlots) {
        await client.query(
          `INSERT INTO time_slots (config_id, slot_date, slot_time, capacity)
           VALUES ($1, $2, $3, 10) ON CONFLICT DO NOTHING`,
          [id, dateStr, time]
        );
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Import new students from Excel
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const students = parseStudentsFromWorksheet(worksheet);

    if (students.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Excel file is empty or invalid format' });
    }

    let imported = 0;
    const errors = [];

    for (const student of students) {
      try {
        let loginCode;
        let isUnique = false;
        while (!isUnique) {
          loginCode = generateLoginCode();
          const existing = await client.query(
            'SELECT id FROM scheduled_students WHERE login_code = $1',
            [loginCode]
          );
          if (existing.rows.length === 0) isUnique = true;
        }

        const fullName = getStudentFullName(student);
        const studentEmail = getStudentEmail(student);

        await client.query(
          `INSERT INTO scheduled_students
           (config_id, matric_number, full_name, email, phone,
            faculty, department, level, login_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id,
            extractMatricNumber(student),
            fullName,
            studentEmail,
            getStudentPhone(student),
            getExcelValue(student, ['faculty']),
            getExcelValue(student, ['department']),
            getExcelValue(student, ['level']),
            loginCode
          ]
        );
        imported++;
      } catch (err) {
        errors.push({ student: getStudentEmail(student) || 'unknown-email', error: err.message });
      }
    }

    await client.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'SCHEDULING_REOPENED',
        `Reopened scheduling ID: ${id} with ${imported} new students (${startDate} – ${endDate || 'open-ended'})`]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Schedule reopened with ${imported} students.`,
      imported,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error reopening schedule:', error);
    res.status(500).json({ message: 'Error reopening schedule' });
  } finally {
    client.release();
  }
};

// Upload student list
const uploadStudentList = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Parse Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const students = parseStudentsFromWorksheet(worksheet);

    if (students.length === 0) {
      return res.status(400).json({ message: 'Excel file is empty or invalid format' });
    }

    let imported = 0;
    let errors = [];

    for (const student of students) {
     try {
        // Generate unique login code
        let loginCode;
        let isUnique = false;
        
        // Keep generating until we get a unique code
        while (!isUnique) {
          loginCode = generateLoginCode();
          const existing = await pool.query(
            'SELECT id FROM scheduled_students WHERE login_code = $1',
            [loginCode]
          );
          if (existing.rows.length === 0) {
            isUnique = true;
          }
        }
        
        const fullName = getStudentFullName(student);
        const studentEmail = getStudentEmail(student);
        
        await pool.query(
          `INSERT INTO scheduled_students 
           (config_id, matric_number, full_name, email, phone, 
            faculty, department, level, login_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id,
            extractMatricNumber(student),
            fullName,
            studentEmail,
            getStudentPhone(student),
            getExcelValue(student, ['faculty']),
            getExcelValue(student, ['department']),
            getExcelValue(student, ['level']),
            loginCode
          ]
        );
        imported++;
      } catch (err) {
        errors.push({ student: getStudentEmail(student) || 'unknown-email', error: err.message });
      }
    }

    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'STUDENTS_IMPORTED', `Imported ${imported} students for scheduling ID: ${id}`]
    );

    res.json({
      success: true,
      message: `Successfully imported ${imported} students`,
      imported,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error uploading student list:', error);
    res.status(500).json({ message: 'Error uploading student list' });
  }
};

// Get scheduled students
const getScheduledStudents = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT ss.*, 
        a.appointment_date, a.appointment_time, a.status as appointment_status
      FROM scheduled_students ss
      LEFT JOIN appointments a ON ss.id = a.student_id
      WHERE ss.config_id = $1
      ORDER BY ss.has_scheduled DESC, ss.created_at DESC
    `, [id]);

    res.json({
      success: true,
      students: result.rows
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Error fetching students' });
  }
};

// Get time slots
const getTimeSlots = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT * FROM time_slots
      WHERE config_id = $1 AND is_available = true AND booked < capacity
      ORDER BY slot_date, slot_time
    `, [id]);

    res.json({
      success: true,
      slots: result.rows
    });
  } catch (error) {
    console.error('Error fetching slots:', error);
    res.status(500).json({ message: 'Error fetching time slots' });
  }
};

// Send scheduling emails
const sendSchedulingEmails = async (req, res) => {
  try {
    const { id } = req.params;

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(400).json({ message: 'SMTP credentials are not configured' });
    }

    try {
      await transporter.verify();
    } catch (smtpError) {
      return res.status(502).json({
        message: 'SMTP connection/authentication failed',
        code: smtpError.code || null,
        detail: smtpError.message
      });
    }

    const config = await pool.query(
      'SELECT * FROM scheduling_config WHERE id = $1',
      [id]
    );

    if (config.rows.length === 0) {
      return res.status(404).json({ message: 'Configuration not found' });
    }

    // Always send to all students (test phase — no email_sent filter)
    try {
      await pool.query(
        'UPDATE scheduled_students SET email_sent = false WHERE config_id = $1',
        [id]
      );
    } catch (resetError) {
      if (resetError.code !== '42703') {
        throw resetError;
      }
      console.warn('scheduled_students.email_sent column not found; continuing without reset');
    }

    const students = await pool.query(
      'SELECT * FROM scheduled_students WHERE config_id = $1',
      [id]
    );

    const totalPending = students.rows.length;

    if (totalPending === 0) {
      return res.json({
        success: true,
        message: 'No students found for this schedule.',
        sent: 0
      });
    }

    let sent = 0;
    let failed = 0;
    const failures = [];
    const failureSummary = {};
    const failureDetails = [];
    let dailyLimitExceeded = false;
    const preferredSender = getPreferredSender();
    const fallbackSender = process.env.SMTP_USER || preferredSender;
    const frontendBaseUrl = getFrontendBaseUrl();
    const schedulingUrl = `${frontendBaseUrl}/schedule/${encodeURIComponent(String(id))}`;
    const cfg = config.rows[0];
    const endDateStr = formatDateOrTbd(cfg.end_date);
    const startDateStr = formatDateOrTbd(cfg.start_date);
    const location = cfg.location || 'ID Card Unit, University of Ibadan';

    // Build important message bullets
    const importantLines = (cfg.important_message || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => `<li style="margin-bottom:6px;">${l}</li>`)
      .join('');

    for (const student of students.rows) {
      if (dailyLimitExceeded) {
        failed++;
        failures.push(student.email || 'unknown-email');
        failureSummary['DAILY_LIMIT_EXCEEDED'] = (failureSummary['DAILY_LIMIT_EXCEEDED'] || 0) + 1;
        continue;
      }

      if (!student.email) {
        failed++;
        failures.push('missing-email');
        failureSummary['missing-email'] = (failureSummary['missing-email'] || 0) + 1;
        console.warn(`Skipping student ${student.id} because email is missing`);
        continue;
      }

      const studentId = student.matric_number || '—';
      const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:600px;">

        <!-- Header -->
        <tr>
          <td style="background:#003399;padding:28px 32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:0.5px;">University of Ibadan</h1>
            <p style="margin:6px 0 0;color:#c8d8ff;font-size:13px;text-transform:uppercase;letter-spacing:1px;">ID Card Management Unit</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;color:#333333;font-size:16px;">Dear <strong>${student.full_name}</strong>,</p>
            <p style="margin:0 0 24px;color:#555555;font-size:15px;line-height:1.6;">
              You have been scheduled to capture your student ID card. Please use the details below to book your preferred appointment slot before the deadline.
            </p>

            <!-- Credentials box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;border:1px solid #c5d0f0;border-radius:6px;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;color:#666666;">Your Login Credentials</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:8px 0;border-bottom:1px solid #d8e0f5;width:45%;color:#555;font-size:14px;">Student ID</td>
                      <td style="padding:8px 0;border-bottom:1px solid #d8e0f5;color:#003399;font-weight:bold;font-size:15px;">${studentId}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;color:#555;font-size:14px;">Login Code</td>
                      <td style="padding:8px 0;color:#003399;font-weight:bold;font-size:22px;letter-spacing:4px;">${student.login_code}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Schedule details -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td width="50%" style="padding:10px 12px;background:#f9f9f9;border:1px solid #ececec;border-radius:4px;font-size:13px;color:#555;">
                  📅 <strong>Booking Opens:</strong><br>${startDateStr}
                </td>
                <td width="10%"></td>
                <td width="50%" style="padding:10px 12px;background:#fff3cd;border:1px solid #ffc107;border-radius:4px;font-size:13px;color:#555;">
                  ⏰ <strong>Deadline:</strong><br>${endDateStr}
                </td>
              </tr>
              <tr><td colspan="3" style="height:10px;"></td></tr>
              <tr>
                <td colspan="3" style="padding:10px 12px;background:#f9f9f9;border:1px solid #ececec;border-radius:4px;font-size:13px;color:#555;">
                  📍 <strong>Location:</strong> ${location}
                </td>
              </tr>
            </table>

            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td align="center">
                  <a href="${schedulingUrl}" style="display:inline-block;background:#003399;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:15px;font-weight:bold;letter-spacing:0.3px;">
                    Book My Appointment →
                  </a>
                  <p style="margin:10px 0 0;font-size:12px;color:#888888;">Or copy this link: <a href="${schedulingUrl}" style="color:#003399;">${schedulingUrl}</a></p>
                </td>
              </tr>
            </table>

            ${importantLines ? `
            <!-- Important notes -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8e1;border-left:4px solid #ffc107;border-radius:0 4px 4px 0;margin-bottom:24px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:bold;color:#7a5800;">⚠️ Important Instructions</p>
                  <ul style="margin:0;padding-left:20px;color:#555555;font-size:13px;line-height:1.7;">${importantLines}</ul>
                </td>
              </tr>
            </table>` : ''}

            <p style="margin:0;color:#888888;font-size:13px;line-height:1.6;">
              If you have any questions, please contact the ID Card Unit directly.<br>
              Do not reply to this email — it is sent from an unmonitored address.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f0f0f0;padding:16px 32px;text-align:center;border-top:1px solid #e0e0e0;">
            <p style="margin:0;font-size:12px;color:#999999;">© ${new Date().getFullYear()} University of Ibadan · ID Card Management Unit</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

      try {
        try {
          await transporter.sendMail({
            from: preferredSender,
            to: student.email,
            subject: `[Action Required] Book Your ID Card Appointment — ${cfg.title}`,
            html
          });
        } catch (sendError) {
          const shouldRetryWithFallback =
            fallbackSender &&
            fallbackSender !== preferredSender &&
            isSenderRejectedError(sendError);

          if (!shouldRetryWithFallback) {
            throw sendError;
          }

          console.warn(`Retrying ${student.email} with SMTP_USER as sender due to sender rejection`);
          await transporter.sendMail({
            from: fallbackSender,
            to: student.email,
            subject: `[Action Required] Book Your ID Card Appointment — ${cfg.title}`,
            html
          });
        }

        try {
          await pool.query(
            'UPDATE scheduled_students SET email_sent = true WHERE id = $1',
            [student.id]
          );
        } catch (markSentError) {
          if (markSentError.code !== '42703') {
            throw markSentError;
          }
          console.warn('scheduled_students.email_sent column not found; skipping sent marker update');
        }
        sent++;
      } catch (err) {
        failed++;
        failures.push(student.email);
        const reason = isDailySendLimitError(err)
          ? 'DAILY_LIMIT_EXCEEDED'
          : (err?.code || String(err?.responseCode || 'send-failed'));
        failureSummary[reason] = (failureSummary[reason] || 0) + 1;
        if (failureDetails.length < 5) {
          failureDetails.push(`${student.email}: ${reason} ${err.message || ''}`.trim());
        }
        if (reason === 'DAILY_LIMIT_EXCEEDED') {
          dailyLimitExceeded = true;
        }
        console.error(`Failed to send email to ${student.email}:`, err.message);
      }
    }

    try {
      await pool.query(
        'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
        [req.user.id, 'EMAILS_SENT', `Sent ${sent}/${totalPending} scheduling emails for config ID: ${id}${failed ? ` (${failed} failed)` : ''}`]
      );
    } catch (logError) {
      console.warn('Non-fatal scheduling email log error:', logError.message);
    }

    let message;
    if (failureSummary['DAILY_LIMIT_EXCEEDED']) {
      message = 'Email provider daily sending limit exceeded. Try again later or switch SMTP account/provider.';
    } else {
      message = failed > 0
        ? `Sent ${sent} of ${totalPending} emails. ${failed} failed (${failures.slice(0, 3).join(', ')}${failures.length > 3 ? '...' : ''}).`
        : `Successfully sent ${sent} email${sent !== 1 ? 's' : ''}.`;
    }

    res.json({
      success: true,
      message,
      sent,
      failed,
      failureSummary,
      failureDetails: failureDetails.length > 0 ? failureDetails : undefined
    });
  } catch (error) {
    console.error('Error sending emails:', error);
    res.status(500).json({ message: 'Error sending scheduling emails' });
  }
};

// Delete scheduling configuration
const deleteConfig = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    // Check if config exists
    const configCheck = await client.query(
      'SELECT * FROM scheduling_config WHERE id = $1',
      [id]
    );

    if (configCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Scheduling configuration not found' });
    }

    const config = configCheck.rows[0];

    await client.query('BEGIN');

    // Get counts before deletion
    const studentCount = await client.query(
      'SELECT COUNT(*) FROM scheduled_students WHERE config_id = $1',
      [id]
    );
    
    const appointmentCount = await client.query(
      'SELECT COUNT(*) FROM appointments WHERE config_id = $1',
      [id]
    );

    // Delete will cascade to all related tables due to ON DELETE CASCADE
    // This includes: scheduled_students, appointments, time_slots
    await client.query(
      'DELETE FROM scheduling_config WHERE id = $1',
      [id]
    );

    await client.query('COMMIT');

    // Log the deletion
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [
        req.user.id, 
        'SCHEDULING_DELETED', 
        `Deleted scheduling: ${config.title} (${studentCount.rows[0].count} students, ${appointmentCount.rows[0].count} appointments)`
      ]
    );

    console.log(`Scheduling config ${id} deleted successfully`);

    res.json({
      success: true,
      message: 'Scheduling configuration and all related data deleted successfully',
      deleted: {
        config: config.title,
        students: parseInt(studentCount.rows[0].count),
        appointments: parseInt(appointmentCount.rows[0].count)
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting scheduling config:', error);
    res.status(500).json({ 
      message: 'Error deleting scheduling configuration',
      error: error.message 
    });
  } finally {
    client.release();
  }
};

// Manually insert a student into a slot (staff/supervisor only)
const manualBookStudent = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id: configId } = req.params;
    const { existingStudentId, slotId, fullName, email, matricNumber } = req.body;

    if (!slotId) {
      return res.status(400).json({ message: 'slotId is required' });
    }

    await ensureCaptureLoginSchema();

    await client.query('BEGIN');

    const configResult = await client.query(
      'SELECT title, location FROM scheduling_config WHERE id = $1',
      [configId]
    );

    if (configResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Scheduling configuration not found' });
    }

    const config = configResult.rows[0];

    // Verify slot exists and has space
    const slotResult = await client.query(
      'SELECT * FROM time_slots WHERE id = $1 AND config_id = $2 AND booked < capacity FOR UPDATE',
      [slotId, configId]
    );

    if (slotResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Slot is not available or does not belong to this config' });
    }

    const slot = slotResult.rows[0];
    let studentRow;

    if (existingStudentId) {
      // Use existing student
      const existing = await client.query(
        'SELECT * FROM scheduled_students WHERE id = $1 AND config_id = $2',
        [existingStudentId, configId]
      );
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Student not found in this config' });
      }
      if (existing.rows[0].has_scheduled) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Student is already scheduled' });
      }
      studentRow = existing.rows[0];
    } else {
      // Create new student
      if (!fullName || !email) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'fullName and email are required for new students' });
      }

      // Generate unique login code
      let loginCode;
      let isUnique = false;
      while (!isUnique) {
        loginCode = crypto.randomInt(100000, 999999).toString();
        const existing = await client.query(
          'SELECT id FROM scheduled_students WHERE login_code = $1',
          [loginCode]
        );
        if (existing.rows.length === 0) isUnique = true;
      }

      const newStudent = await client.query(
        `INSERT INTO scheduled_students (config_id, full_name, email, matric_number, login_code)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [configId, fullName, email, matricNumber || null, loginCode]
      );
      studentRow = newStudent.rows[0];
    }

    const captureLoginCode = await generateUniqueCaptureLoginCode(client);

    // Book the slot
    await client.query(
      `INSERT INTO appointments (config_id, student_id, slot_id, appointment_date, appointment_time)
       VALUES ($1, $2, $3, $4, $5)`,
      [configId, studentRow.id, slotId, slot.slot_date, slot.slot_time]
    );

    await client.query(
      'UPDATE time_slots SET booked = booked + 1 WHERE id = $1',
      [slotId]
    );

    await client.query(
      `UPDATE scheduled_students
       SET has_scheduled = true,
           scheduled_date = $1,
           scheduled_time = $2,
           login_code = NULL,
           capture_login_code = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [slot.slot_date, slot.slot_time, captureLoginCode, studentRow.id]
    );

    await client.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'STUDENT_MANUALLY_INSERTED', `${studentRow.full_name} inserted into slot ${slotId} for config ${configId}`]
    );

    await client.query('COMMIT');

    const emailResult = await sendManualBookingConfirmationEmail({
      student: studentRow,
      slot,
      configTitle: config.title,
      captureLoginCode,
      location: config.location,
      fallbackMatricNumber: matricNumber,
    });

    res.json({
      success: true,
      message: `${studentRow.full_name} has been scheduled for ${new Date(slot.slot_date).toLocaleDateString()} at ${slot.slot_time.substring(0, 5)}`,
      captureLoginCode,
      confirmationEmailSent: emailResult.sent,
      confirmationEmailError: emailResult.error,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in manualBookStudent:', error);
    res.status(500).json({ message: 'Error inserting student into slot' });
  } finally {
    client.release();
  }
};

// Export the new function
module.exports = {
  createSchedulingConfig,
  getAllConfigs,
  getConfigById,
  updateConfig,
  closeReopenConfig,
  reopenWithNewBatch,
  uploadStudentList,
  getScheduledStudents,
  getTimeSlots,
  sendSchedulingEmails,
  deleteConfig,
  manualBookStudent
};