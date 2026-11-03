const axios = require('axios');
const pool = require('../config/database');

// URL of the capture app API
const CAPTURE_APP_URL = process.env.CAPTURE_APP_URL || 'http://localhost:5001';

const toNullableText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const firstNonEmpty = (...values) => {
  for (const value of values) {
    const normalized = toNullableText(value);
    if (normalized !== null) return normalized;
  }
  return null;
};

const normalizeFingerprint = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Support data URL payloads from some scanner clients.
  const marker = 'base64,';
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex >= 0) {
    return trimmed.slice(markerIndex + marker.length).replace(/\s+/g, '');
  }
  return trimmed.replace(/\s+/g, '');
};

const extractScannedTemplateCandidates = (scanPayload = {}) => {
  if (!scanPayload || typeof scanPayload !== 'object') return [];
  const possibleKeys = [
    'template',
    'Template',
    'fingerprintTemplate',
    'fingerprintData',
    'ISOFMR',
    'AnsiTemplate',
    'WSQ',
    'Base64Template'
  ];

  const templates = possibleKeys
    .map((key) => normalizeFingerprint(scanPayload[key]))
    .filter(Boolean);

  return [...new Set(templates)];
};

const extractImageCandidates = (scanPayload = {}) => {
  if (!scanPayload || typeof scanPayload !== 'object') return [];
  const keys = ['FigPicBase64', 'figPicBase64', 'image', 'fingerImage'];
  const images = keys
    .map((key) => normalizeFingerprint(scanPayload[key]))
    .filter(Boolean);
  return [...new Set(images)];
};

/**
 * Extract stored fingerprint template bytes from the capture app's fingerprint response
 * Converts byte arrays to base64 format for submission to the matcher
 */
const extractStoredTemplateCandidates = (fingerprintPayload = {}) => {
  const candidates = [];
  
  if (!fingerprintPayload?.fingerprints || typeof fingerprintPayload.fingerprints !== 'object') {
    return candidates;
  }
  
  const fingerprints = fingerprintPayload.fingerprints;
  
  // Try to extract template data from each finger position
  // Format: fingerprints.left_thumb.data, fingerprints.left_index.data, etc.
  const fingerPositions = ['left_thumb', 'left_index', 'right_thumb', 'right_index'];
  
  for (const position of fingerPositions) {
    const fingerData = fingerprints[position];
    
    if (!fingerData || typeof fingerData !== 'object') continue;
    
    // If data is already a base64 string, use directly
    if (typeof fingerData.data === 'string') {
      const normalized = normalizeFingerprint(fingerData.data);
      if (normalized && !candidates.includes(normalized)) {
        candidates.push(normalized);
      }
      continue;
    }
    
    // If data is a byte array/buffer-like, decode carefully.
    // In production payloads this is often a JSON-serialized Node Buffer
    // containing ASCII template text, so UTF-8 decode is the primary path.
    if (Array.isArray(fingerData.data) || Buffer.isBuffer(fingerData.data)) {
      try {
        const buffer = Buffer.isBuffer(fingerData.data) 
          ? fingerData.data 
          : Buffer.from(fingerData.data);

        const utf8Template = normalizeFingerprint(buffer.toString('utf8'));
        if (utf8Template && !candidates.includes(utf8Template)) {
          candidates.push(utf8Template);
          continue;
        }

        // Fallback for truly binary payloads.
        const base64Template = normalizeFingerprint(buffer.toString('base64'));
        if (base64Template && !candidates.includes(base64Template)) {
          candidates.push(base64Template);
        }
      } catch (error) {
        console.warn(`[Fingerprint] Could not convert ${position} template data to base64:`, error.message);
      }
    }
  }
  
  return candidates;
};

const extractIdentityCandidatesFromFingerprintPayload = (payload = {}) => {
  if (!payload || typeof payload !== 'object') return [];

  const student = payload.student || payload.identity || payload.user || {};
  const candidates = [
    payload.cardId,
    payload.card_id,
    payload.id,
    payload.userId,
    payload.user_id,
    payload.matric_no,
    payload.matricNumber,
    payload.matric_number,
    payload.staff_id,
    payload.staffId,
    payload.card_number,
    payload.cardNumber,
    student.cardId,
    student.card_id,
    student.id,
    student.userId,
    student.user_id,
    student.matric_no,
    student.matricNumber,
    student.matric_number,
    student.staff_id,
    student.staffId,
    student.card_number,
    student.cardNumber,
  ]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).trim())
    .filter(Boolean);

  return [...new Set(candidates)];
};

const isMatchedResponse = (responseData = {}) => {
  if (!responseData || typeof responseData !== 'object') return false;

  const truthy = (value) => {
    if (value === true) return true;
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return ['true', 'matched', 'match', 'success', 'ok', 'verified', 'pass'].includes(normalized);
    }
    return false;
  };

  if (
    truthy(responseData.matched) ||
    truthy(responseData.match) ||
    truthy(responseData.isMatch) ||
    truthy(responseData.verified) ||
    truthy(responseData.success)
  ) {
    return true;
  }

  const data = responseData.data;
  if (data && typeof data === 'object') {
    if (
      truthy(data.matched) ||
      truthy(data.match) ||
      truthy(data.isMatch) ||
      truthy(data.verified) ||
      truthy(data.success)
    ) {
      return true;
    }
  }

  return false;
};

const verifyWithCaptureMatcher = async (identityCandidates = [], scanCandidates = []) => {
  const ids = [...new Set(identityCandidates.filter(Boolean).map((v) => String(v).trim()))];
  const scans = [...new Set(scanCandidates.filter(Boolean).map((v) => String(v).trim()))];

  for (const idValue of ids) {
    for (const scanValue of scans) {
      try {
        // Skip obviously invalid payloads to avoid noisy 400s from matcher endpoint.
        if (!scanValue || scanValue.length < 16) continue;

        const response = await axios.post(
          `${CAPTURE_APP_URL}/api/verify/fingerprint`,
          {
            cardId: idValue,
            card_id: idValue,
            userId: idValue,
            fingerprintData: scanValue,
            scannedFingerprint: scanValue,
            fingerprintImage: scanValue,
            scannedFingerprintImage: scanValue
          },
          {
            timeout: 15000,
            headers: { 'X-Api-Key': process.env.VERIFY_API_KEY || '' }
          }
        );

        if (isMatchedResponse(response.data)) {
          const nested = response.data?.data && typeof response.data.data === 'object'
            ? response.data.data
            : null;

          return {
            success: true,
            matched: true,
            studentName:
              response.data.studentName ||
              response.data.fullName ||
              nested?.studentName ||
              nested?.fullName ||
              null,
            message:
              response.data.message ||
              nested?.message ||
              'Verification complete'
          };
        }
      } catch (error) {
        // Continue trying other candidate pairs for non-fatal matcher errors.
        if (error.response && [400, 404].includes(error.response.status)) {
          continue;
        }
        throw error;
      }
    }
  }

  return {
    success: true,
    matched: false,
    studentName: null,
    message: 'Fingerprint did not match stored templates'
  };
};

const extractCardIdentity = (card = {}) => {
  const academic = card.academic || card.academic_info || card.academicInfo || card.student || {};
  const identity = card.identity || card.student_identity || card.studentIdentity || {};

  return {
    id: card.id ?? card.card_id ?? card.cardId ?? card.approved_card_id ?? card.approvedCardId,
    surname: firstNonEmpty(
      card.surname,
      card.last_name,
      card.lastName,
      card.family_name,
      card.familyName,
      identity.surname,
      identity.last_name,
      identity.lastName
    ),
    other_names: firstNonEmpty(
      card.other_names,
      card.otherNames,
      card.first_name,
      card.firstName,
      card.middle_name,
      card.middleName,
      card.full_name,
      card.fullName,
      card.name,
      identity.other_names,
      identity.otherNames,
      identity.first_name,
      identity.firstName,
      identity.full_name,
      identity.fullName,
      identity.name
    ),
    matric_no: firstNonEmpty(
      card.matric_no,
      card.matricNumber,
      card.matric_number,
      identity.matric_no,
      identity.matricNumber,
      identity.matric_number
    ),
    staff_id: firstNonEmpty(card.staff_id, card.staffId, identity.staff_id, identity.staffId),
    faculty: firstNonEmpty(card.faculty, card.school, card.college, academic.faculty, academic.school, academic.college),
    department: firstNonEmpty(card.department, card.dept, academic.department, academic.dept, academic.programme, academic.program),
    level: firstNonEmpty(card.level, card.class_level, academic.level, academic.class_level),
    card_number: firstNonEmpty(card.card_number, card.cardNumber, card.id_number, card.idNumber, identity.card_number, identity.cardNumber),
    session: firstNonEmpty(card.session, card.academic_session, card.session_name, academic.session, academic.academic_session),
    passport_photo: card.passport_photo ?? card.passportPhoto ?? card.photo ?? card.passport ?? null,
    approved_at: card.approved_at ?? card.updated_at ?? card.created_at ?? new Date()
  };
};

const mergeCardIdentity = (primary = {}, fallback = {}) => ({
  id: primary.id ?? fallback.id ?? fallback.card_id ?? fallback.cardId,
  surname: firstNonEmpty(primary.surname, fallback.surname, fallback.last_name, fallback.lastName),
  other_names: firstNonEmpty(primary.other_names, fallback.other_names, fallback.first_name, fallback.firstName, fallback.otherNames, fallback.full_name, fallback.fullName, fallback.name),
  matric_no: firstNonEmpty(primary.matric_no, fallback.matric_no, fallback.matricNumber, fallback.matric_number),
  staff_id: firstNonEmpty(primary.staff_id, fallback.staff_id, fallback.staffId),
  faculty: firstNonEmpty(primary.faculty, fallback.faculty),
  department: firstNonEmpty(primary.department, fallback.department),
  level: firstNonEmpty(primary.level, fallback.level),
  card_number: firstNonEmpty(primary.card_number, fallback.card_number, fallback.cardNumber),
  session: firstNonEmpty(primary.session, fallback.session, fallback.academic_session),
  passport_photo: primary.passport_photo || fallback.passport_photo || fallback.photo || null,
  approved_at: primary.approved_at || fallback.approved_at || fallback.updated_at || fallback.created_at || new Date()
});

const buildMetadataLookupKeys = (card = {}) => {
  const keys = [
    card.id,
    card.card_id,
    card.cardId,
    card.matric_no,
    card.matric_number,
    card.matricNumber,
    card.staff_id,
    card.staffId,
    card.card_number,
    card.cardNumber
  ]
    .map((value) => toNullableText(value))
    .filter(Boolean);

  return [...new Set(keys.map((value) => String(value)))];
};

const fetchApprovedMetadataMap = async () => {
  try {
    const response = await axios.get(`${CAPTURE_APP_URL}/api/printing/approved`, {
      timeout: 10000
    });

    if (!response.data?.success) {
      return new Map();
    }

    const approvedCards = response.data.cards || response.data.approved || [];
    const map = new Map();
    approvedCards
      .map(extractCardIdentity)
      .forEach((card) => {
        const keys = buildMetadataLookupKeys(card);
        keys.forEach((key) => map.set(key, card));
      });

    return map;
  } catch (error) {
    console.warn('⚠️ Unable to fetch approved metadata from capture app:', error.message);
    return new Map();
  }
};

const ensureQueueExclusionsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS print_queue_exclusions (
      id SERIAL PRIMARY KEY,
      card_id INTEGER NOT NULL UNIQUE,
      reason VARCHAR(50) NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const excludeCardFromQueue = async (cardId, reason = 'removed', userId = null, dbClient = null) => {
  const executor = dbClient || pool;

  await executor.query(
    `INSERT INTO print_queue_exclusions (card_id, reason, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (card_id)
     DO UPDATE SET reason = EXCLUDED.reason, created_by = EXCLUDED.created_by, created_at = CURRENT_TIMESTAMP`,
    [cardId, reason, userId]
  );
};

/**
 * Fetch approved cards from capture app and save to approved_cards history table
 * Also add new cards to print queue
 */
const syncApprovedCards = async () => {
  try {
    await ensureQueueExclusionsTable();

    console.log('========================================');
    console.log('🔄 Syncing approved cards from capture app...');
    console.log('Capture app URL:', CAPTURE_APP_URL);
    console.log('========================================');
    
    // Fetch queue cards from capture app (source of truth for printable approved cards)
    const response = await axios.get(`${CAPTURE_APP_URL}/api/printing/queue`, {
      timeout: 10000 // 10 second timeout
    });
    
    console.log('📡 Response status:', response.status);
    console.log('📦 Response data:', JSON.stringify(response.data, null, 2));
    
    if (!response.data?.success) {
      throw new Error('Failed to fetch print queue from capture app');
    }

    const queueCards = response.data.cards || response.data.queue || [];
    const approvedMetadataMap = await fetchApprovedMetadataMap();
    const approvedCards = queueCards
      .map((queueCard) => {
        const queueIdentity = extractCardIdentity(queueCard);
        const lookupKeys = buildMetadataLookupKeys(queueIdentity);
        const approvedIdentity = lookupKeys
          .map((key) => approvedMetadataMap.get(key))
          .find(Boolean);
        return mergeCardIdentity(queueIdentity, approvedIdentity || {});
      })
      .filter((card) => card.id !== undefined && card.id !== null)
      .filter((card) => {
        // Keep only approved cards when status is present.
        const source = queueCards.find((q) => String(q.id ?? q.card_id ?? q.cardId) === String(card.id));
        if (!source?.status) return true;
        return String(source.status).toLowerCase() === 'approved';
      });

    console.log(`📋 Found ${approvedCards.length} approved queue cards in capture app`);
    
    if (approvedCards.length > 0) {
      console.log('Sample card data:', JSON.stringify(approvedCards[0], null, 2));
    }

    let addedToHistory = 0;
    let addedToQueue = 0;
    let skipped = 0;
    let errors = 0;

    for (const card of approvedCards) {
      try {
        console.log(`\n🔍 Processing card ID ${card.id}: ${card.surname} ${card.other_names}`);
        
        // Convert base64 images back to buffer if present
        const passportBuffer = card.passport_photo ? Buffer.from(card.passport_photo, 'base64') : null;
        
        // 1. Save to approved_cards history table (permanent storage)
        const historyCheck = await pool.query(
          'SELECT id FROM approved_cards WHERE card_id = $1',
          [card.id]
        );

        if (historyCheck.rows.length === 0) {
          await pool.query(`
            INSERT INTO approved_cards 
            (card_id, surname, other_names, matric_no, staff_id, faculty, department, 
             level, card_number, session, passport_photo, approved_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
            card.id,
            card.surname,
            card.other_names,
            card.matric_no,
            card.staff_id,
            card.faculty,
            card.department,
            card.level,
            card.card_number,
            card.session,
            passportBuffer,
            card.approved_at || new Date()
          ]);
          console.log(`  ✅ Saved to approved_cards history`);
          addedToHistory++;
        } else {
          await pool.query(
            `UPDATE approved_cards
             SET surname = COALESCE(NULLIF($2, ''), NULLIF(surname, ''), surname),
                 other_names = COALESCE(NULLIF($3, ''), NULLIF(other_names, ''), other_names),
                 matric_no = COALESCE(NULLIF($4, ''), NULLIF(matric_no, ''), matric_no),
                 staff_id = COALESCE(NULLIF($5, ''), NULLIF(staff_id, ''), staff_id),
                 faculty = COALESCE(NULLIF($6, ''), NULLIF(faculty, ''), faculty),
                 department = COALESCE(NULLIF($7, ''), NULLIF(department, ''), department),
                 level = COALESCE(NULLIF($8, ''), NULLIF(level, ''), level),
                 card_number = COALESCE(NULLIF($9, ''), NULLIF(card_number, ''), card_number),
                 session = COALESCE(NULLIF($10, ''), NULLIF(session, ''), session),
                 passport_photo = COALESCE($11, passport_photo),
                 updated_at = CURRENT_TIMESTAMP,
                 synced_from_capture_app_at = CURRENT_TIMESTAMP
             WHERE card_id = $1`,
            [
              card.id,
              card.surname,
              card.other_names,
              card.matric_no,
              card.staff_id,
              card.faculty,
              card.department,
              card.level,
              card.card_number,
              card.session,
              passportBuffer
            ]
          );
          console.log(`  ℹ️  Already in approved_cards history (backfilled metadata if missing)`);
        }
        
        // 2. Skip cards explicitly excluded from queue (printed/removed locally)
        const exclusionCheck = await pool.query(
          'SELECT id, reason FROM print_queue_exclusions WHERE card_id = $1',
          [card.id]
        );

        if (exclusionCheck.rows.length > 0) {
          console.log(`  ⏭️  Excluded from queue (reason: ${exclusionCheck.rows[0].reason})`);
          skipped++;
          continue;
        }

        // 3. Skip cards that are already in collections/history (already printed flow)
        const collectionCheck = await pool.query(
          'SELECT id FROM card_collections WHERE card_id = $1 LIMIT 1',
          [card.id]
        );

        if (collectionCheck.rows.length > 0) {
          await pool.query(
            `UPDATE card_collections
             SET faculty = COALESCE(NULLIF($2, ''), NULLIF(faculty, ''), faculty),
               department = COALESCE(NULLIF($3, ''), NULLIF(department, ''), department),
               card_number = COALESCE(NULLIF($4, ''), NULLIF(card_number, ''), card_number),
                 updated_at = CURRENT_TIMESTAMP
             WHERE card_id = $1`,
            [card.id, card.faculty, card.department, card.card_number]
          );
          console.log('  ⏭️  Already in collection workflow, skipping queue insert');
          skipped++;
          continue;
        }

        const historyPrintCheck = await pool.query(
          'SELECT id FROM print_history WHERE card_id = $1 LIMIT 1',
          [card.id]
        );

        if (historyPrintCheck.rows.length > 0) {
          await pool.query(
            `UPDATE print_history
             SET card_number = COALESCE(NULLIF($2, ''), NULLIF(card_number, ''), card_number)
             WHERE card_id = $1`,
            [card.id, card.card_number]
          );
          console.log('  ⏭️  Already in print history, skipping queue insert');
          skipped++;
          continue;
        }

        // 4. Check if already in print queue
        const queueCheck = await pool.query(
          'SELECT id FROM print_queue WHERE card_id = $1',
          [card.id]
        );

        if (queueCheck.rows.length > 0) {
          await pool.query(
            `UPDATE print_queue
             SET surname = COALESCE(NULLIF($2, ''), NULLIF(surname, ''), surname),
               other_names = COALESCE(NULLIF($3, ''), NULLIF(other_names, ''), other_names),
               matric_no = COALESCE(NULLIF($4, ''), NULLIF(matric_no, ''), matric_no),
               staff_id = COALESCE(NULLIF($5, ''), NULLIF(staff_id, ''), staff_id),
               faculty = COALESCE(NULLIF($6, ''), NULLIF(faculty, ''), faculty),
               department = COALESCE(NULLIF($7, ''), NULLIF(department, ''), department),
               level = COALESCE(NULLIF($8, ''), NULLIF(level, ''), level),
               card_number = COALESCE(NULLIF($9, ''), NULLIF(card_number, ''), card_number),
               session = COALESCE(NULLIF($10, ''), NULLIF(session, ''), session),
               passport_photo = COALESCE($11, passport_photo),
                 updated_at = CURRENT_TIMESTAMP
             WHERE card_id = $1`,
            [
              card.id,
              card.surname,
              card.other_names,
              card.matric_no,
              card.staff_id,
              card.faculty,
              card.department,
              card.level,
              card.card_number,
              card.session,
              passportBuffer
            ]
          );
          console.log(`  ⏭️  Already in print queue (queue ID: ${queueCheck.rows[0].id})`);
          skipped++;
          continue;
        }

        // 5. Add to print queue for printing
        console.log(`  ➕ Adding to print queue...`);
        const result = await pool.query(`
          INSERT INTO print_queue 
          (card_id, surname, other_names, matric_no, staff_id, faculty, department, 
           level, card_number, session, passport_photo, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'queued')
          RETURNING id
        `, [
          card.id,
          card.surname,
          card.other_names,
          card.matric_no,
          card.staff_id,
          card.faculty,
          card.department,
          card.level,
          card.card_number,
          card.session,
          passportBuffer
        ]);

        console.log(`  ✅ Added to print queue (queue ID: ${result.rows[0].id})`);
        addedToQueue++;
      } catch (err) {
        console.error(`  ❌ Error processing card ${card.id}:`, err.message);
        console.error(`     Error code:`, err.code);
        console.error(`     Error detail:`, err.detail);
        errors++;
      }
    }

    console.log('\n========================================');
    console.log('📊 Sync Summary:');
    console.log(`   ✅ Added to history: ${addedToHistory}`);
    console.log(`   ✅ Added to queue: ${addedToQueue}`);
    console.log(`   ⏭️  Skipped (already in queue): ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📋 Total processed: ${approvedCards.length}`);
    console.log('========================================\n');
    
    return { 
      addedToHistory,
      addedToQueue,
      skipped, 
      errors,
      total: approvedCards.length,
      message: `Synced ${addedToHistory} to history, ${addedToQueue} to queue, ${skipped} already in queue, ${errors} errors`
    };

  } catch (error) {
    // Handle connection errors gracefully
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.error('❌ Capture app is not available at:', CAPTURE_APP_URL);
      console.error('   Make sure capture app is reachable at CAPTURE_APP_URL');
      return { 
        addedToHistory: 0,
        addedToQueue: 0,
        skipped: 0, 
        errors: 0,
        total: 0, 
        message: 'Capture app not available' 
      };
    }
    
    console.error('❌ Error syncing approved cards:', error.message);
    console.error('   Error details:', error);
    throw error;
  }
};

/**
 * Notify capture app that a card has been printed
 */
const notifyCardPrinted = async (cardId) => {
  try {
    await axios.post(`${CAPTURE_APP_URL}/api/printing/mark-printed/${cardId}`);
  } catch (error) {
    console.error(`Error notifying capture app for card ${cardId}:`, error.message);
    // Don't throw - printing succeeded even if notification failed
  }
};

/**
 * Notify capture app that a card has been collected
 */
const notifyCardCollected = async (cardId) => {
  try {
    await axios.post(`${CAPTURE_APP_URL}/api/printing/mark-collected/${cardId}`);
  } catch (error) {
    console.error(`Error notifying capture app for card ${cardId}:`, error.message);
  }
};

/**
 * Verify fingerprint against stored fingerprint in capture app for a given card
 * Capture app scans the currently placed finger and compares against stored templates
 * Only one finger needs to match
 */
const verifyFingerprint = async (cardId, scannedFingerprintBase64, scanPayload = null, options = {}) => {
  // Validate inputs
  if (!cardId) {
    console.error('[Fingerprint] Card ID is required for verification');
    return {
      success: false,
      matched: false,
      message: 'Card ID is required for fingerprint verification'
    };
  }

  // Check if CAPTURE_APP_URL is properly configured for production
  if (!process.env.CAPTURE_APP_URL || process.env.CAPTURE_APP_URL === 'http://localhost:5001') {
    console.error('[Fingerprint] ⚠️  CAPTURE_APP_URL not configured for production. Current value:', CAPTURE_APP_URL);
    return {
      success: false,
      matched: false,
      message: 'Fingerprint verification is not available in this environment. Please configure CAPTURE_APP_URL.',
      configIssue: true,
      diagnostic: {
        captureAppUrl: CAPTURE_APP_URL,
        instruction: 'Set CAPTURE_APP_URL environment variable to production capture app endpoint'
      }
    };
  }

  try {
    const identityCandidates = [cardId, ...(options.identityCandidates || [])]
      .filter((value) => value !== undefined && value !== null && String(value).trim() !== '');

    const scanned = normalizeFingerprint(scannedFingerprintBase64);
    if (!scanned) {
      return {
        success: false,
        matched: false,
        message: 'Scanned fingerprint is required for verification'
      };
    }

    // Fetch stored fingerprint templates FIRST so we can include them as scan candidates
    // This ensures the matcher gets data in the format it expects (stored template format)
    let storedTemplateCandidates = [];
    let payload = null;
    let resolvedIdentityCandidates = [];
    
    for (const candidate of identityCandidates) {
      try {
        const response = await axios.get(
          `${CAPTURE_APP_URL}/api/printing/fingerprint?cardId=${encodeURIComponent(candidate)}`,
          {
            timeout: 15000,
            headers: { 'X-Api-Key': process.env.VERIFY_API_KEY || '' }
          }
        );
        if (response.data?.success) {
          payload = response.data;
          storedTemplateCandidates = extractStoredTemplateCandidates(response.data);
          resolvedIdentityCandidates = extractIdentityCandidatesFromFingerprintPayload(response.data);
          console.log(`[Fingerprint] Extracted ${storedTemplateCandidates.length} stored template candidates for card ${candidate}`);
          break;
        }
      } catch (error) {
        if (error.response?.status !== 404) {
          throw error;
        }
      }
    }

    // Capture app matcher is the source of truth.
    // Prefer scanner-provided template payloads first (same matcher-compatible family
    // as stored templates). Only use stored templates as fallback when scanner payloads
    // do not include usable template/image values.
    const scanImage = normalizeFingerprint(options.scannedFingerprintImage);
    const scannedTemplates = extractScannedTemplateCandidates(scanPayload);
    const imageCandidates = extractImageCandidates(scanPayload);

    const scannerCandidates = [
      ...scannedTemplates,
      scanned,
      ...imageCandidates,
      scanImage,
    ].filter((value) => value !== undefined && value !== null && String(value).trim() !== '');

    const uniqueScannerCandidates = [...new Set(scannerCandidates.map((value) => String(value).trim()))];
    const fallbackStoredTemplates = uniqueScannerCandidates.length > 0
      ? []
      : storedTemplateCandidates;

    const matcherScanCandidates = [
      ...uniqueScannerCandidates,
      ...fallbackStoredTemplates,
    ];

    console.log(
      `[Fingerprint] Attempting verification with ${matcherScanCandidates.length} scan candidates ` +
      `(${scannedTemplates.length} scanner templates, ${imageCandidates.length} scanner images, ` +
      `${fallbackStoredTemplates.length} stored-template fallbacks)`
    );

    const matcherIdentityCandidates = [
      ...resolvedIdentityCandidates,
      ...identityCandidates,
    ].filter((value) => value !== undefined && value !== null && String(value).trim() !== '');

    const matcherResult = await verifyWithCaptureMatcher(
      matcherIdentityCandidates,
      matcherScanCandidates
    );

    return {
      success: true,
      matched: matcherResult.matched,
      studentName:
        matcherResult.studentName ||
        payload?.studentName ||
        payload?.full_name ||
        [payload?.surname, payload?.other_names].filter(Boolean).join(' ').trim() ||
        null,
      message: matcherResult.message || (payload ? 'Fingerprint did not match stored templates' : 'Fingerprint record not found for this card')
    };
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error(`[Fingerprint] ❌ Connection refused at ${CAPTURE_APP_URL}. Capture app may not be running.`);
      return {
        success: false,
        matched: false,
        message: `Cannot reach capture app at ${CAPTURE_APP_URL}. Fingerprint verification unavailable.`,
        connectionError: true,
        diagnostic: {
          error: 'ECONNREFUSED',
          url: CAPTURE_APP_URL,
          hint: 'Ensure capture app is running and CAPTURE_APP_URL is correct'
        }
      };
    }
    
    if (error.code === 'ETIMEDOUT') {
      console.error(`[Fingerprint] ⏱️  Timeout connecting to capture app at ${CAPTURE_APP_URL}`);
      return {
        success: false,
        matched: false,
        message: `Capture app at ${CAPTURE_APP_URL} is not responding. Please try again.`,
        timeoutError: true
      };
    }
    
    if (error.response) {
      console.error(`[Fingerprint] ❌ Capture app returned ${error.response.status}:`, error.response.data);
      if (error.response.status === 404) {
        return {
          success: false,
          matched: false,
          message: 'Fingerprint record not found for this card'
        };
      }
      return {
        success: false,
        matched: false,
        message: error.response.data?.message || 'Fingerprint verification failed at capture app',
        statusCode: error.response.status,
        appError: error.response.data
      };
    }
    
    console.error('[Fingerprint] Unexpected error:', error.message);
    return {
      success: false,
      matched: false,
      message: `Verification error: ${error.message}`
    };
  }
};

module.exports = {
  syncApprovedCards,
  notifyCardPrinted,
  notifyCardCollected,
  verifyFingerprint,
  ensureQueueExclusionsTable,
  excludeCardFromQueue
};
