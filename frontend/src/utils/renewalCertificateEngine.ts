/**
 * NDLI Club Management System — Official Renewal Certificate Engine
 *
 * Faithfully reproduces the official renewal certificate from previous project:
 * - Exact official background template (template_reference_bg.jpg)
 * - Native 300 DPI A4 Portrait Resolution (2480 x 3508 px)
 * - Dynamic data binding:
 *     <institution_name>  -> Formatted centered citation
 *     <reg_no>            -> Registration NO.: ...
 *     <date_of_approval>  -> Date of Registration: ...
 *     <renewal_date>      -> Validity Extended Up to: ...
 * - Dynamic Public Verifiable Highly Secure QR Code:
 *     Positioned at (1840, 2560) under registration details block
 *     Encodes verification URL (/verify?tab=verify&certId=...&reg_no=...&club_id=...)
 * - PI Digital Signature & Affiliation (Dr. Plaban Kumar Bhowmick / uploaded signature)
 * - High-Resolution 300 DPI JPG Download (2480 x 3508 px)
 * - Zero-Dependency Valid A4 Portrait PDF 1.4 Exporter (DCTDecode JPEG Stream)
 * - Single-page Print Engine (printCertificateOnPage): zero blank pages!
 */
import QRCode from 'qrcode';
import templateReferenceBgUrl from '../assets/template_reference_bg.jpg';
import defaultSignatureUrl from '../assets/pi_signature.png';

export const CANVAS_WIDTH = 2480;
export const CANVAS_HEIGHT = 3508;

export interface RenewalClubData {
  club_id?: string;
  registration_no?: string;
  reg_no?: string;
  institution_name?: string;
  date_of_approval?: string;
  last_renewal_date?: string;
  upcoming_renewal_date?: string;
  next_renewal_date?: string;
  renewal_date?: string;
}

export interface RenewalCertOptions {
  pi_name?: string;
  pi_affiliation?: string;
  signature_image_url?: string | null;
  signature_img?: HTMLImageElement | null;
}

/**
 * Format date to standard formal Indian DD-MM-YYYY format
 */
export function formatFormalDate(val?: string | null): string {
  if (!val || val === '-' || val.toLowerCase().includes('none')) return '—';
  try {
    const clean = val.split('T')[0].split(' ')[0].trim();
    const parts = clean.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
      }
      if (parts[2].length === 4) {
        return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
      }
    }
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}-${mm}-${d.getFullYear()}`;
    }
  } catch {
    /* fallback */
  }
  return String(val);
}

/**
 * Renders centered citation paragraph with mixed bold / regular weights
 * Exactly matching Paragraph 7 of docx:
 * “<institution_name>” for registering as an NDLI Club under the National Digital Library of India.
 * This certificate of institutional registration is valid for 1 year.
 */
function drawCenteredFormattedCitation(
  ctx: CanvasRenderingContext2D,
  institutionName: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number
): number {
  const cleanInst = institutionName.trim() || 'National Digital Library of India Partner Institution';
  const tokens: Array<{ text: string; bold: boolean; isInst?: boolean; width?: number }> = [];

  const instWords = cleanInst.split(/\s+/).filter(Boolean);
  for (let i = 0; i < instWords.length; i++) {
    let word = instWords[i];
    if (i === 0) word = '“' + word;
    if (i === instWords.length - 1) word = word + '”';
    tokens.push({ text: word, bold: true, isInst: true });
  }

  const suffix = 'for registering as an NDLI Club under the National Digital Library of India. This certificate of institutional registration is valid for 1 year.';
  const suffixWords = suffix.split(/\s+/).filter(Boolean);
  for (const w of suffixWords) {
    const isBold = ['NDLI', 'Club', 'valid', 'for', '1', 'year.'].includes(w);
    tokens.push({ text: w, bold: isBold });
  }

  const boldFont = "bold 52px 'Arial Nova Cond', 'Arial', Helvetica, sans-serif";
  const regularFont = "50px 'Arial Nova Cond', 'Arial', Helvetica, sans-serif";

  ctx.font = regularFont;
  const spaceWidth = ctx.measureText(' ').width;

  const lines: Array<{ tokens: typeof tokens; totalWidth: number }> = [];
  let currentLine: typeof tokens = [];
  let currentLineWidth = 0;

  for (const token of tokens) {
    ctx.font = token.bold ? boldFont : regularFont;
    const w = ctx.measureText(token.text).width;
    token.width = w;

    const spaceNeeded = currentLine.length > 0 ? spaceWidth : 0;
    if (currentLineWidth + spaceNeeded + w > maxWidth && currentLine.length > 0) {
      lines.push({ tokens: currentLine, totalWidth: currentLineWidth });
      currentLine = [token];
      currentLineWidth = w;
    } else {
      currentLine.push(token);
      currentLineWidth += spaceNeeded + w;
    }
  }
  if (currentLine.length > 0) {
    lines.push({ tokens: currentLine, totalWidth: currentLineWidth });
  }

  let y = startY;
  ctx.textBaseline = 'middle';

  for (const line of lines) {
    let x = centerX - line.totalWidth / 2;
    for (const token of line.tokens) {
      ctx.font = token.bold ? boldFont : regularFont;
      ctx.fillStyle = token.isInst ? '#0f2942' : token.bold ? '#0f172a' : '#1e293b';
      ctx.fillText(token.text, x, y);
      x += (token.width ?? 0) + spaceWidth;
    }
    y += lineHeight;
  }

  return y;
}

/**
 * Calligraphic script fallback for digital signature
 */
function drawCalligraphicSignature(ctx: CanvasRenderingContext2D, name: string, x: number, y: number) {
  ctx.save();
  ctx.font = "italic 76px 'Brush Script MT', 'Lucida Handwriting', 'Segoe Script', cursive";
  ctx.fillStyle = '#1e3a8a';
  ctx.textAlign = 'center';
  ctx.fillText(name || 'P. K. Bhowmick', x, y);
  ctx.restore();
}

/**
 * Loads an image from URL into HTMLImageElement
 */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Main render method: draws 300 DPI official certificate onto canvas
 * matching D:\GitHub\ndli-club-management\static\js\certificate_engine.js
 */
export async function renderRenewalCertificate(
  canvas: HTMLCanvasElement,
  club: RenewalClubData,
  options: RenewalCertOptions = {}
): Promise<HTMLCanvasElement> {
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d canvas context');

  // Preload background image
  const bgImg = (await loadImage(templateReferenceBgUrl)) || (await loadImage('/template_reference_bg.jpg'));

  // -------------------------------------------------------------
  // 1. DRAW OFFICIAL TEMPLATE BACKGROUND
  // -------------------------------------------------------------
  if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
    ctx.drawImage(bgImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else {
    // Elegant fallback background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.strokeStyle = '#103125';
    ctx.lineWidth = 16;
    ctx.strokeRect(40, 40, CANVAS_WIDTH - 80, CANVAS_HEIGHT - 80);
  }

  // Institution name & citation data
  const institutionName = (club.institution_name || 'National Digital Library of India Partner Institution').trim();
  const regNo = (club.registration_no || club.reg_no || `NDLI/REG/2026/${club.club_id || '001'}`).trim();
  const rawDoa = club.date_of_approval || '';
  const rawRenewal = club.upcoming_renewal_date || club.next_renewal_date || club.renewal_date || '';

  const dateOfApproval = formatFormalDate(rawDoa);
  const renewalDate = formatFormalDate(rawRenewal);

  const piName = (options.pi_name || 'Dr. Plaban Kumar Bhowmick').trim();
  const piAffiliation = (
    options.pi_affiliation ||
    'Principal Investigator\nNational Digital Library of India Project\nCentral Library, IIT Kharagpur'
  ).trim();

  // -------------------------------------------------------------
  // 2. BLOCK 1: DYNAMIC INSTITUTION NAME & CITATION STATEMENT
  // Exactly matches Paragraph 7 of docx:
  // “<institution_name>” for registering as an NDLI Club under the National Digital Library of India.
  // This certificate of institutional registration is valid for 1 year.
  // -------------------------------------------------------------
  const citationCenterY = 1620; // 46.2% of page height, directly beneath "is issued to"
  const citationCenterX = CANVAS_WIDTH / 2;
  const citationMaxWidth = 1960;
  const citationLineHeight = 82;

  drawCenteredFormattedCitation(ctx, institutionName, citationCenterX, citationCenterY, citationMaxWidth, citationLineHeight);

  // -------------------------------------------------------------
  // 3. BLOCK 2: DYNAMIC REGISTRATION DETAILS (NEXT TO NDLI CLUB PARTNER BADGE)
  // Registration NO.: <reg_no>
  // Date of Registration: <date_of_approval>
  // Validity Extended Up to: <renewal_date>
  // -------------------------------------------------------------
  const detailsX = 1290;
  const detailsLineSpacing = 82;
  const detailsCenterY = 2264;
  let detailsY = detailsCenterY - detailsLineSpacing;

  const metadataRows = [
    { label: 'Registration NO.: ', val: regNo },
    { label: 'Date of Registration: ', val: dateOfApproval },
    { label: 'Validity Extended Up to: ', val: renewalDate },
  ];

  const labelFont = "bold 50px 'Calibri', 'Segoe UI', Arial, sans-serif";
  const valueFont = "500 50px 'Calibri', 'Segoe UI', Arial, sans-serif";

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  for (const row of metadataRows) {
    ctx.font = labelFont;
    ctx.fillStyle = '#0f172a';
    ctx.fillText(row.label, detailsX, detailsY);
    const labelW = ctx.measureText(row.label).width;

    ctx.font = valueFont;
    ctx.fillStyle = '#1e293b';
    ctx.fillText(row.val, detailsX + labelW, detailsY);

    detailsY += detailsLineSpacing;
  }

  // -------------------------------------------------------------
  // 4. BLOCK 3: PI SIGNATURE & AFFILIATION (LOWER-LEFT SIDE)
  // - Clear background rect for pristine white canvas in lower-left
  // - PI Signature above horizontal line
  // - Horizontal signature line (x = 240 to 980, y = 2835)
  // - PI Name (Bold 48px, highly prominent)
  // - PI Affiliation (Semi-bold 35px)
  // -------------------------------------------------------------
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(200, 2580, 860, 620);

  const sigLineStartX = 240;
  const sigLineEndX = 980;
  const sigLineY = 2835;
  const sigCenterX = (sigLineStartX + sigLineEndX) / 2;

  // Determine signature image: options.signature_img -> options.signature_image_url -> defaultSignatureUrl
  let activeSigImg: HTMLImageElement | null = options.signature_img || null;
  if (!activeSigImg && options.signature_image_url) {
    activeSigImg = await loadImage(options.signature_image_url);
  }
  if (!activeSigImg) {
    activeSigImg = (await loadImage(defaultSignatureUrl)) || (await loadImage('/pi_signature.png'));
  }

  if (activeSigImg && (activeSigImg.complete || activeSigImg.naturalWidth > 0)) {
    const maxSigW = 600;
    const maxSigH = 220;
    const sigAspect = (activeSigImg.naturalWidth || 2) / (activeSigImg.naturalHeight || 1);
    let targetW = maxSigW;
    let targetH = targetW / sigAspect;
    if (targetH > maxSigH) {
      targetH = maxSigH;
      targetW = targetH * sigAspect;
    }
    const sigImgX = sigCenterX - targetW / 2;
    const sigImgY = sigLineY - targetH - 2;
    ctx.drawImage(activeSigImg, sigImgX, sigImgY, targetW, targetH);
  } else {
    drawCalligraphicSignature(ctx, piName, sigCenterX, sigLineY - 18);
  }

  // Horizontal signature line
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(sigLineStartX, sigLineY);
  ctx.lineTo(sigLineEndX, sigLineY);
  ctx.stroke();

  // PI Name - Bold slab serif matching official project template
  ctx.fillStyle = '#0f172a';
  ctx.font = "bold 48px 'Rockwell', 'Roboto Slab', 'Cambria', 'Georgia', serif";
  ctx.textAlign = 'left';
  ctx.fillText(piName, sigLineStartX, sigLineY + 54);

  // PI Affiliation
  const affilLines = piAffiliation.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
  let affilY = sigLineY + 104;
  ctx.font = "35px 'Calibri', 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = '#1e293b';
  ctx.textAlign = 'left';

  for (const aLine of affilLines) {
    ctx.fillText(aLine, sigLineStartX, affilY);
    affilY += 48;
  }

  // -------------------------------------------------------------
  // 5. BLOCK 4: SUBTLE VERIFICATION FOOTER
  // -------------------------------------------------------------
  const cid = club.club_id || 'CLUB';
  const certSerial = `NDLI-REN-${cid}-${regNo.replace(/[^A-Za-z0-9]/g, '')}`;
  ctx.font = "18px 'Calibri', monospace";
  ctx.fillStyle = 'rgba(100, 116, 139, 0.65)';
  ctx.textAlign = 'right';
  ctx.fillText(`Ref: ${certSerial}`, CANVAS_WIDTH - 90, CANVAS_HEIGHT - 35);

  // -------------------------------------------------------------
  // 6. BLOCK 5: OFFICIAL VERIFICATION QR CODE
  // Positioned directly under Registration Details block:
  // centerX = 1840, centerY = 2560, targetSize = 240
  // -------------------------------------------------------------
  let originUrl = 'https://anirbanmid.pythonanywhere.com';
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname || '';
    if (
      hostname &&
      hostname !== 'localhost' &&
      hostname !== '127.0.0.1' &&
      hostname !== '0.0.0.0' &&
      hostname !== '::1' &&
      hostname !== '[::1]' &&
      !hostname.startsWith('127.')
    ) {
      originUrl = window.location.origin;
    }
  }

  const verificationUrl = `${originUrl}/verify?tab=verify&certId=${encodeURIComponent(
    certSerial
  )}&reg_no=${encodeURIComponent(regNo)}&club_id=${encodeURIComponent(cid)}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f2942', light: '#ffffff' },
      width: 240,
    });
    const qrImg = await loadImage(qrDataUrl);
    if (qrImg) {
      const qrSize = 240;
      const startX = Math.round(1840 - qrSize / 2);
      const startY = Math.round(2560 - qrSize / 2);
      const pad = 12;

      // Crisp white background behind QR with padding
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(startX - pad, startY - pad, qrSize + pad * 2, qrSize + pad * 2);

      // Draw QR image
      ctx.drawImage(qrImg, startX, startY, qrSize, qrSize);

      // Border rule around QR code
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(startX - pad, startY - pad, qrSize + pad * 2, qrSize + pad * 2);

      // Labeling below QR
      ctx.font = "bold 24px 'Calibri', 'Segoe UI', Arial, sans-serif";
      ctx.fillStyle = '#0f2942';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('SCAN TO VERIFY', 1840, startY + qrSize + pad + 10);

      ctx.font = "19px 'Calibri', 'Segoe UI', Arial, sans-serif";
      ctx.fillStyle = '#64748b';
      ctx.fillText('Official NDLI Club Authenticity', 1840, startY + qrSize + pad + 38);
    }
  } catch (err) {
    console.warn('[RenewalCertificateEngine] Failed to render QR code:', err);
  }

  return canvas;
}

/**
 * Generates a 300 DPI High-Resolution JPEG Blob from canvas
 */
export function getCertificateJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas failed to export as JPEG blob.'));
      }, 'image/jpeg', 0.98);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Triggers download of high-resolution JPG (2480 x 3508 px at 300 DPI)
 */
export async function downloadCertificateJPG(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await getCertificateJpegBlob(canvas);
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename || 'NDLI_Renewal_Certificate.jpg';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 4000);
}

/**
 * Generates and downloads a valid A4 Portrait PDF 1.4 using DCTDecode JPEG stream
 */
export async function downloadCertificatePDF(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const jpegBlob = await getCertificateJpegBlob(canvas);
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

  const a4WidthPt = 595.28;
  const a4HeightPt = 841.89;

  const header = '%PDF-1.4\n';
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${a4WidthPt} ${a4HeightPt}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`;

  const imgObjHeader = `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`;
  const imgObjFooter = '\nendstream\nendobj\n';

  const contentStream = `q ${a4WidthPt} 0 0 ${a4HeightPt} 0 0 cm /Im1 Do Q`;
  const obj5 = `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`;

  const enc = new TextEncoder();
  const bHeader = enc.encode(header);
  const bObj1 = enc.encode(obj1);
  const bObj2 = enc.encode(obj2);
  const bObj3 = enc.encode(obj3);
  const bImgHeader = enc.encode(imgObjHeader);
  const bImgFooter = enc.encode(imgObjFooter);
  const bObj5 = enc.encode(obj5);

  const offset1 = bHeader.length;
  const offset2 = offset1 + bObj1.length;
  const offset3 = offset2 + bObj2.length;
  const offset4 = offset3 + bObj3.length;
  const offset5 = offset4 + bImgHeader.length + jpegBytes.length + bImgFooter.length;
  const xrefOffset = offset5 + bObj5.length;

  const padOffset = (n: number) => String(n).padStart(10, '0');
  const xref =
    `xref\n0 6\n0000000000 65535 f \n` +
    `${padOffset(offset1)} 00000 n \n` +
    `${padOffset(offset2)} 00000 n \n` +
    `${padOffset(offset3)} 00000 n \n` +
    `${padOffset(offset4)} 00000 n \n` +
    `${padOffset(offset5)} 00000 n \n` +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const bXref = enc.encode(xref);

  const totalLen =
    bHeader.length +
    bObj1.length +
    bObj2.length +
    bObj3.length +
    bImgHeader.length +
    jpegBytes.length +
    bImgFooter.length +
    bObj5.length +
    bXref.length;

  const pdfBytes = new Uint8Array(totalLen);
  let pos = 0;

  const appendBytes = (bytes: Uint8Array) => {
    pdfBytes.set(bytes, pos);
    pos += bytes.length;
  };

  appendBytes(bHeader);
  appendBytes(bObj1);
  appendBytes(bObj2);
  appendBytes(bObj3);
  appendBytes(bImgHeader);
  appendBytes(jpegBytes);
  appendBytes(bImgFooter);
  appendBytes(bObj5);
  appendBytes(bXref);

  const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
  const downloadUrl = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename || 'NDLI_Renewal_Certificate.pdf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 4000);
}

/**
 * On-page A4 print engine (zero blank pages).
 * Synchronous pixel-clone route without DOM relocation or premature timer drops.
 */
export function printCertificateOnPage(canvas: HTMLCanvasElement): boolean {
  if (!canvas || typeof document === 'undefined' || !document.body) return false;

  const PRINT_STYLE_ID = 'ndli-certificate-print-style';
  const PRINT_ROOT_ID = 'certificate-print-root';

  let printStyle = document.getElementById(PRINT_STYLE_ID);
  if (!printStyle) {
    printStyle = document.createElement('style');
    printStyle.id = PRINT_STYLE_ID;
    printStyle.textContent = `
      @page {
        size: A4 portrait;
        margin: 0 !important;
      }
      @media screen {
        #${PRINT_ROOT_ID} {
          display: none !important;
        }
      }
      @media print {
        html, body {
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
          max-height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          overflow: hidden !important;
          display: block !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body.printing-certificate {
          width: 100% !important;
          height: 100% !important;
          line-height: 0 !important;
          font-size: 0 !important;
          overflow: hidden !important;
        }
        body.printing-certificate > *:not(#${PRINT_ROOT_ID}) {
          display: none !important;
          visibility: hidden !important;
        }
        body.printing-certificate #${PRINT_ROOT_ID} {
          display: block !important;
          visibility: visible !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          line-height: 0 !important;
          font-size: 0 !important;
          page-break-before: avoid !important;
          page-break-after: avoid !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          overflow: hidden !important;
        }
        #${PRINT_ROOT_ID} canvas {
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          object-fit: contain !important;
          margin: 0 auto !important;
          padding: 0 !important;
          border: 0 !important;
          background: #ffffff !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
      }
    `;
    document.head.appendChild(printStyle);
  }

  let printRoot = document.getElementById(PRINT_ROOT_ID);
  if (!printRoot) {
    printRoot = document.createElement('div');
    printRoot.id = PRINT_ROOT_ID;
    document.body.appendChild(printRoot);
  }

  printRoot.innerHTML = '';

  // Synchronous pixel-clone of the canvas to avoid GPU context drop or async image decode lag
  const printCanvas = document.createElement('canvas');
  printCanvas.width = canvas.width;
  printCanvas.height = canvas.height;
  const ctx = printCanvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(canvas, 0, 0);
  }
  printRoot.appendChild(printCanvas);

  let done = false;
  let printMql: MediaQueryList | null = null;
  const onPrintMediaChange = (e: MediaQueryListEvent) => {
    if (!e.matches) cleanup();
  };

  const cleanup = () => {
    if (done) return;
    done = true;
    document.body.classList.remove('printing-certificate');
    window.removeEventListener('afterprint', cleanup);
    if (printMql) {
      try {
        printMql.removeEventListener('change', onPrintMediaChange);
      } catch {
        /* old webviews */
      }
    }
    if (printRoot && printRoot.parentNode) {
      printRoot.parentNode.removeChild(printRoot);
    }
  };

  if (typeof window.matchMedia === 'function') {
    try {
      printMql = window.matchMedia('print');
      printMql.addEventListener('change', onPrintMediaChange);
    } catch {
      printMql = null;
    }
  }

  window.addEventListener('afterprint', cleanup);
  document.body.classList.add('printing-certificate');

  let ok = true;
  try {
    window.print();
  } catch {
    ok = false;
  }

  // 30-second guard timer (R54 hardened: prevents premature dialog destruction)
  setTimeout(cleanup, 30000);
  return ok;
}

/**
 * Dedicated Print Window Engine (A4 Portrait, exactly 1 sheet, zero blank pages).
 * Primary high-fidelity route faithfully ported from legacy project:
 * - Pre-loads and decodes high-res JPEG data URL before triggering window.print()
 * - Isolated document avoids conflicting web app CSS rules and multi-sheet page breaks
 * - Includes visible on-screen print & close action toolbar with Acrobat-style dark backdrop
 */
export function printCertificate(canvas: HTMLCanvasElement): boolean {
  if (!canvas || typeof window === 'undefined') return false;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.98);
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    return false;
  }
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>NDLI Club Official Renewal Certificate</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 0;
        }
        * {
          box-sizing: border-box;
        }
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          background: #334155;
          overflow: auto;
        }
        body {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
        }
        .print-actions {
          position: fixed;
          top: 16px;
          right: 16px;
          display: flex;
          gap: 10px;
          z-index: 10000;
          background: rgba(15, 23, 42, 0.9);
          backdrop-filter: blur(8px);
          padding: 8px 14px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        }
        .print-actions button {
          padding: 9px 18px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          border-radius: 6px;
          transition: all 0.2s ease;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .btn-print {
          background: #0D7751;
          color: #ffffff;
        }
        .btn-print:hover {
          background: #095439;
        }
        .btn-close {
          background: #475569;
          color: #f1f5f9;
        }
        .btn-close:hover {
          background: #1e293b;
        }
        .cert-container {
          width: 210mm;
          height: 297mm;
          max-width: 96vw;
          max-height: 96vh;
          margin: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          box-shadow: 0 12px 48px rgba(0,0,0,0.6);
        }
        img#cert-render {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: contain;
          margin: 0;
          padding: 0;
        }
        @media print {
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
            overflow: hidden !important;
          }
          .print-actions {
            display: none !important;
          }
          .cert-container {
            width: 100% !important;
            height: 100% !important;
            max-width: 100% !important;
            max-height: 100% !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          img#cert-render {
            width: 100% !important;
            height: 100% !important;
            max-width: 100% !important;
            max-height: 100% !important;
            object-fit: contain !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="print-actions">
        <button class="btn-print" onclick="window.print()">🖨️ Print Certificate</button>
        <button class="btn-close" onclick="window.close()">✕ Close</button>
      </div>
      <div class="cert-container">
        <img id="cert-render" src="${dataUrl}" alt="NDLI Club Renewal Certificate" />
      </div>
      <script>
        const img = document.getElementById('cert-render');
        const trigger = () => {
          setTimeout(() => {
            window.focus();
            window.print();
          }, 350);
        };
        if (img.complete) {
          trigger();
        } else {
          img.onload = trigger;
        }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
  return true;
}
