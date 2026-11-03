const express = require('express');
const router = express.Router();
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

const CAPTURE_APP_URL = process.env.CAPTURE_APP_URL || 'http://localhost:5001';
// Path to capture app's output directory (adjust this path as needed)
const CAPTURE_APP_OUTPUT_DIR = process.env.CAPTURE_APP_OUTPUT_DIR || path.join(__dirname, '../../capture-app/backend/printing/output');

const normalizeUrl = (urlValue) => {
  if (!urlValue || typeof urlValue !== 'string') return null;
  const trimmed = urlValue.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${CAPTURE_APP_URL}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
};

const extractCardIdCandidates = (file) => {
  if (!file || typeof file !== 'object') return [];
  const keys = ['cardId', 'card_id', 'id', 'userId', 'user_id', 'studentId', 'student_id'];
  const values = keys
    .map((key) => file[key])
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => String(value).trim());
  return [...new Set(values)];
};

const matchesCardIdInString = (text, requestedId) => {
  if (!text) return false;
  const safeId = String(requestedId).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^0-9A-Za-z])${safeId}([^0-9A-Za-z]|$)`, 'i');
  return pattern.test(String(text));
};

const findOutputFileUrlForCard = (files, requestedId) => {
  if (!Array.isArray(files) || files.length === 0) return null;

  const isComponentAsset = (value) => {
    const text = String(value || '').toLowerCase();
    return (
      text.includes('passport') ||
      text.includes('signature') ||
      text.includes('barcode') ||
      text.includes('thumb') ||
      text.includes('thumbnail')
    );
  };

  const isLikelyPrintableCardAsset = (value) => {
    const text = String(value || '').toLowerCase();
    return (
      text.includes('idcard') ||
      text.includes('card-output') ||
      text.includes('card_output') ||
      text.includes('output-card') ||
      text.includes('print') ||
      text.includes('final')
    );
  };

  const pickPreferredAssetUrl = (file) => normalizeUrl(
    file.pngUrl ||
    file.png_url ||
    file.imageUrl ||
    file.image_url ||
    file.url ||
    file.path ||
    file.fileUrl
  );

  const candidates = [];

  for (const file of files) {
    const assetUrl = pickPreferredAssetUrl(file);
    if (!assetUrl) continue;

    const metadataText = [
      file.url,
      file.path,
      file.fileUrl,
      file.filename,
      file.name,
      assetUrl,
    ]
      .filter(Boolean)
      .join(' ');

    const hasExplicitId = extractCardIdCandidates(file).some((value) => value === String(requestedId));
    const hasIdInText = matchesCardIdInString(metadataText, requestedId);

    if (!hasExplicitId && !hasIdInText) continue;

    let score = 0;
    if (hasExplicitId) score += 3;
    if (hasIdInText) score += 2;
    if (isLikelyPrintableCardAsset(metadataText)) score += 4;
    if (isComponentAsset(metadataText)) score -= 6;  candidates.push({ assetUrl, score });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].assetUrl;
};

const fetchImageFromOutputList = async (cardId) => {
  const listResponse = await axios.get(`${CAPTURE_APP_URL}/api/printing/output`, {
    timeout: 10000
  });

  const files =
    listResponse.data?.files ||
    listResponse.data?.output ||
    listResponse.data?.data ||
    [];

  const matchedUrl = findOutputFileUrlForCard(files, cardId);
  if (!matchedUrl) return null;

  const imageResponse = await axios.get(matchedUrl, {
    responseType: 'arraybuffer',
    timeout: 10000,
    validateStatus: (status) => status === 200
  });

  if (imageResponse.data && imageResponse.data.byteLength > 0) {
    return Buffer.from(imageResponse.data);
  }

  return null;
};

const fetchImageFromOutputImage = async (cardId) => {
  const imageResponse = await axios.get(
    `${CAPTURE_APP_URL}/api/printing/output-image?cardId=${encodeURIComponent(cardId)}`,
    {
      responseType: 'arraybuffer',
      timeout: 10000,
      validateStatus: (status) => status === 200
    }
  );

  if (imageResponse.data && imageResponse.data.byteLength > 0) {
    return Buffer.from(imageResponse.data);
  }

  return null;
};

const fetchSvgFromOutputEndpoint = async (cardId) => {
  const svgResponse = await axios.get(
    `${CAPTURE_APP_URL}/api/printing/output-svg?cardId=${encodeURIComponent(cardId)}`,
    {
      timeout: 10000,
      validateStatus: (status) => status === 200,
      responseType: 'text'
    }
  );

  if (!svgResponse.data) return null;
  const svgText = String(svgResponse.data);
  if (!svgText.includes('<svg')) return null;
  return Buffer.from(svgText, 'utf8');
};

const fetchSvgWithResolution = async (cardId) => {
  try {
    const directSvg = await fetchSvgFromOutputEndpoint(cardId);
    if (directSvg) {
      return directSvg;
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      throw error;
    }
    if (error.response?.status !== 404) {
      console.log(`Direct SVG fetch failed for ${cardId}: ${error.message}`);
    }
  }

  try {
    const approvedResponse = await axios.get(`${CAPTURE_APP_URL}/api/printing/approved`, {
      timeout: 10000
    });

    const approvedCards = approvedResponse.data?.cards || [];
    const matchedCard = approvedCards.find((card) =>
      String(card.id) === String(cardId) ||
      String(card.card_id || '') === String(cardId) ||
      String(card.user_id || '') === String(cardId) ||
      String(card.userId || '') === String(cardId)
    );

    if (!matchedCard) return null;

    const idCandidates = buildIdCandidates(cardId, matchedCard);
    for (const candidate of idCandidates) {
      try {
        const candidateSvg = await fetchSvgFromOutputEndpoint(candidate);
        if (candidateSvg) {
          console.log(`✅ Successfully fetched card SVG with candidate ID: ${candidate}`);
          return candidateSvg;
        }
      } catch (candidateError) {
        if (candidateError.code === 'ECONNREFUSED' || candidateError.code === 'ETIMEDOUT') {
          throw candidateError;
        }
      }
    }
  } catch (lookupError) {
    console.log(`Approved-card lookup failed while resolving SVG ID ${cardId}: ${lookupError.message}`);
  }

  return null;
};

const buildIdCandidates = (requestedId, approvedCard) => {
  const candidates = [requestedId];

  if (approvedCard && typeof approvedCard === 'object') {
    const possibleKeys = [
      'id',
      'user_id',
      'userId',
      'student_id',
      'studentId',
      'capture_id',
      'captureId',
      'card_id',
      'cardId',
      'matric_no',
      'staff_id'
    ];

    for (const key of possibleKeys) {
      const value = approvedCard[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        candidates.push(String(value).trim());
      }
    }
  }

  return [...new Set(candidates.map((value) => String(value).trim()).filter(Boolean))];
};

const fetchImageFromCaptureApp = async (idCandidate) => {
  const imageUrl = `${CAPTURE_APP_URL}/api/idcard/${encodeURIComponent(idCandidate)}`;
  console.log(`Fetching from official endpoint: ${imageUrl}`);

  const imageResponse = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 10000,
    validateStatus: (status) => status === 200
  });

  if (imageResponse.data && imageResponse.data.byteLength > 0) {
    return Buffer.from(imageResponse.data);
  }

  return null;
};

const isLikelyFullCardRaster = async (buffer) => {
  if (!buffer || !buffer.length) return false;

  try {
    const metadata = await sharp(buffer).metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);

    // Full card assets from capture app are wide landscape renders.
    return width >= 300 && height >= 180;
  } catch (error) {
    // If metadata cannot be read, allow downstream fallback strategy to continue.
    return false;
  }
};

const rasterizeSvgToPng = async (svgBuffer) => {
  if (!svgBuffer || !svgBuffer.length) return null;
  return sharp(svgBuffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();
};

const sendCardAsset = (res, payload, contentType) => {
  res.set('Content-Type', contentType);
  // Avoid reusing stale partial renders from proxy/browser cache.
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  return res.send(payload);
};

router.get('/:cardId/svg', async (req, res) => {
  try {
    const { cardId } = req.params;
    console.log(`Fetching card SVG for ID: ${cardId}`);

    const svgBuffer = await fetchSvgWithResolution(cardId);
    if (!svgBuffer) {
      return res.status(404).json({
        success: false,
        message: `Card SVG not found for ID ${cardId}. The capture app may still be generating it.`
      });
    }

    return sendCardAsset(res, svgBuffer, 'image/svg+xml; charset=utf-8');
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(503).json({
        success: false,
        message: `Capture app is not available at ${CAPTURE_APP_URL}.`
      });
    }

    console.error('❌ Error fetching card SVG:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error fetching card SVG',
      error: error.message
    });
  }
});

// Get card image - uses capture app's direct PNG endpoint
router.get('/:cardId/image', async (req, res) => {
  try {
    const { cardId } = req.params;
    console.log(`Fetching card image for ID: ${cardId}`);
    
    // According to the API guide, the capture app provides:
    // GET /api/idcard/:userId - Returns PNG image directly
    
    // Method 1: Prefer SVG output (includes full text fields) and rasterize to PNG.
    try {
      const svgBuffer = await fetchSvgFromOutputEndpoint(cardId);
      if (svgBuffer) {
        const svgAsPng = await rasterizeSvgToPng(svgBuffer);
        if (svgAsPng && await isLikelyFullCardRaster(svgAsPng)) {
          console.log(`✅ Successfully fetched card SVG and rasterized full card for ${cardId}`);
          return sendCardAsset(res, svgAsPng, 'image/png');
        }
      }
    } catch (error) {
      console.error(`❌ /api/printing/output-svg failed: ${error.message}`);

      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return res.status(503).json({
          success: false,
          message: `Capture app is not available at ${CAPTURE_APP_URL}.`
        });
      }
      if (error.response?.status === 404) {
        console.log(`ℹ️ SVG not ready/not found for card ${cardId}, trying PNG endpoints...`);
      }
    }

    // Method 2: Official on-demand card render endpoint.
    try {
      const directImage = await fetchImageFromCaptureApp(cardId);
      if (directImage && await isLikelyFullCardRaster(directImage)) {
        console.log(`✅ Successfully fetched card image with direct ID (${directImage.byteLength} bytes)`);
        return sendCardAsset(res, directImage, 'image/png');
      }
      if (directImage) {
        console.warn(`⚠️ Direct ID asset for card ${cardId} looks like a partial component. Trying next source.`);
      }
    } catch (error) {
      console.error(`❌ Official endpoint failed: ${error.message}`);

      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return res.status(503).json({
          success: false,
          message: `Capture app is not available at ${CAPTURE_APP_URL}.`
        });
      }
    }

    // Method 3: Resolve identifier mismatch and retry the official endpoint.
    try {
      const approvedResponse = await axios.get(`${CAPTURE_APP_URL}/api/printing/approved`, {
        timeout: 10000
      });

      const approvedCards = approvedResponse.data?.cards || [];
      const matchedCard = approvedCards.find((card) =>
        String(card.id) === String(cardId) ||
        String(card.card_id || '') === String(cardId) ||
        String(card.user_id || '') === String(cardId) ||
        String(card.userId || '') === String(cardId)
      );

      if (matchedCard) {
        const idCandidates = buildIdCandidates(cardId, matchedCard);
        console.log(`Resolved ID candidates for ${cardId}:`, idCandidates);

        for (const candidate of idCandidates) {
          try {
            const candidateImage = await fetchImageFromCaptureApp(candidate);
            if (candidateImage && await isLikelyFullCardRaster(candidateImage)) {
              console.log(`✅ Successfully fetched card image with candidate ID: ${candidate}`);
              return sendCardAsset(res, candidateImage, 'image/png');
            }
            if (candidateImage) {
              console.warn(`⚠️ Candidate ID ${candidate} returned a partial asset. Continuing resolution.`);
            }
          } catch (candidateError) {
            if (candidateError.code === 'ECONNREFUSED' || candidateError.code === 'ETIMEDOUT') {
              return res.status(503).json({
                success: false,
                message: `Capture app is not available at ${CAPTURE_APP_URL}.`
              });
            }
          }
        }
      }
    } catch (lookupError) {
      console.log(`Approved-card lookup failed while resolving ID ${cardId}: ${lookupError.message}`);
    }

    // Method 4: Rendered PNG output by card ID.
    try {
      const outputImage = await fetchImageFromOutputImage(cardId);
      if (outputImage && await isLikelyFullCardRaster(outputImage)) {
        console.log(`✅ Successfully fetched card image from /api/printing/output-image for card ${cardId}`);
        return sendCardAsset(res, outputImage, 'image/png');
      }
      if (outputImage) {
        console.warn(`⚠️ output-image for card ${cardId} is not full card dimensions; skipping.`);
      }
    } catch (error) {
      console.error(`❌ /api/printing/output-image failed: ${error.message}`);

      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return res.status(503).json({
          success: false,
          message: `Capture app is not available at ${CAPTURE_APP_URL}.`
        });
      }
    }

    // Method 5: Use capture output listing and prefer full-card assets over partial components.
    try {
      const outputListImage = await fetchImageFromOutputList(cardId);
      if (outputListImage && await isLikelyFullCardRaster(outputListImage)) {
        console.log(`✅ Successfully fetched card image from /api/printing/output for card ${cardId}`);
        return sendCardAsset(res, outputListImage, 'image/png');
      }
      if (outputListImage) {
        console.warn(`⚠️ Output listing asset for card ${cardId} is not full card dimensions; skipping.`);
      }
      console.log(`ℹ️ No matched file URL found in /api/printing/output for card ${cardId}`);
    } catch (error) {
      console.error(`❌ /api/printing/output lookup failed: ${error.message}`);

      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return res.status(503).json({
          success: false,
          message: `Capture app is not available at ${CAPTURE_APP_URL}.`
        });
      }
    }
    
    // Method 6: Try alternative endpoints (fallback)
    const fallbackEndpoints = [
        `/api/printing/card-image/${encodeURIComponent(cardId)}`,
        `/output/card_${encodeURIComponent(cardId)}.png`
    ];
    
    for (const endpoint of fallbackEndpoints) {
      try {
        const imageUrl = `${CAPTURE_APP_URL}${endpoint}`;
        console.log(`Trying fallback endpoint: ${imageUrl}`);
        
        const imageResponse = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 5000
        });
        
        if (imageResponse.status === 200 && imageResponse.data && imageResponse.data.byteLength > 0) {
          console.log(`✅ Fallback endpoint succeeded (${imageResponse.data.byteLength} bytes)`);
          const fallbackBuffer = Buffer.from(imageResponse.data);
          if (await isLikelyFullCardRaster(fallbackBuffer)) {
            return sendCardAsset(res, fallbackBuffer, 'image/png');
          }
          console.warn(`⚠️ Fallback endpoint returned partial raster for card ${cardId}`);
        }
      } catch (err) {
        console.log(`Fallback endpoint failed: ${endpoint}`);
        continue;
      }
    }
    
    // Method 7: Try file system as last resort (if configured)
    if (CAPTURE_APP_OUTPUT_DIR) {
      console.log('Trying file system access...');
      
      const possibleFilenames = [
        `card_${cardId}.png`,
        `idcard_${cardId}.png`,
        `${cardId}.png`
      ];
      
      for (const filename of possibleFilenames) {
        try {
          const filePath = path.join(CAPTURE_APP_OUTPUT_DIR, filename);
          const imageBuffer = await fs.readFile(filePath);
          
          console.log(`✅ Found card image in file system: ${filename}`);
          if (await isLikelyFullCardRaster(imageBuffer)) {
            return sendCardAsset(res, imageBuffer, 'image/png');
          }
          console.warn(`⚠️ File-system fallback ${filename} is not full card dimensions`);
        } catch (err) {
          continue;
        }
      }
    }
    
    // If all methods failed, return helpful error
    console.error('❌ All methods failed to fetch card image');
    return res.status(404).json({
      success: false,
      message: `Card image not found for ID ${cardId}. Please ensure the card is approved in the capture app.`,
      troubleshooting: {
        captureAppUrl: CAPTURE_APP_URL,
        endpoint: `/api/idcard/${cardId}`,
        suggestion: 'Check if the card is approved in the capture app and the PNG was generated.'
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching card image:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching card image',
      error: error.message
    });
  }
});

module.exports = router;
