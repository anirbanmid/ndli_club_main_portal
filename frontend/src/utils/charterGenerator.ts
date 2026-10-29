import QRCode from 'qrcode';
import { InstituteClub } from '../types';

export async function downloadOfficialCharterDoc(club: InstituteClub) {
  // Generate QR Code data URL for the club charter
  const verifyUrl = `${window.location.origin}?tab=verify&clubId=${club.id}`;
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 180,
      margin: 1,
      color: {
        dark: '#1C3329',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('Failed to generate QR for charter', err);
  }

  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const charterHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>NDLI Official Club Charter - ${club.name}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 10mm;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f8fafc;
      color: #1C3329;
    }
    .charter-card {
      max-width: 1050px;
      margin: 0 auto;
      background: #fffdf9;
      border: 10px double #7E6238;
      border-radius: 12px;
      padding: 35px 45px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.1);
      position: relative;
    }
    .tricolor-bar {
      height: 5px;
      display: flex;
      width: 100%;
      margin-bottom: 20px;
    }
    .orange { background: #FF9933; width: 33.33%; }
    .white { background: #ffffff; width: 33.33%; border-top: 1px solid #DFE9E4; border-bottom: 1px solid #DFE9E4; }
    .green { background: #138808; width: 33.33%; }
    .header-text {
      text-align: center;
      margin-bottom: 15px;
    }
    .ministry {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #7E6238;
      text-transform: uppercase;
    }
    .ndli-title {
      font-size: 26px;
      font-weight: 900;
      color: #1C3329;
      letter-spacing: 1.5px;
      margin: 5px 0;
    }
    .iit-kgp {
      font-size: 14px;
      font-weight: 700;
      color: #0A5C3E;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .divider {
      height: 2px;
      background: linear-gradient(to right, transparent, #7E6238, transparent);
      margin: 15px 0;
    }
    .charter-headline {
      text-align: center;
      margin: 15px 0;
    }
    .charter-type {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 3px;
      color: #b45309;
      text-transform: uppercase;
    }
    .conferred-to {
      font-size: 16px;
      font-style: italic;
      color: #5A7366;
      margin-top: 5px;
    }
    .institute-name {
      font-size: 28px;
      font-weight: 800;
      color: #091e42;
      text-align: center;
      margin: 10px 0;
      text-decoration: underline;
      text-decoration-color: #d97706;
      text-underline-offset: 6px;
    }
    .charter-details {
      display: flex;
      justify-content: center;
      gap: 30px;
      font-size: 12px;
      margin-bottom: 15px;
      color: #5A7366;
    }
    .passkey-box {
      background: #eff6ff;
      border: 2px dashed #3b82f6;
      border-radius: 8px;
      padding: 12px 20px;
      text-align: center;
      max-width: 400px;
      margin: 10px auto 20px auto;
    }
    .passkey-title {
      font-size: 11px;
      font-weight: 700;
      color: #1e40af;
      text-transform: uppercase;
    }
    .passkey-code {
      font-size: 24px;
      font-family: monospace;
      font-weight: 900;
      color: #0A5C3E;
      letter-spacing: 3px;
      margin-top: 4px;
    }
    .authorities-table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      font-size: 11px;
    }
    .authorities-table th {
      background: #f1f5f9;
      padding: 8px;
      text-align: left;
      border: 1px solid #C6D6CE;
      font-weight: 700;
      color: #334155;
    }
    .authorities-table td {
      padding: 8px;
      border: 1px solid #DFE9E4;
      color: #1e293b;
    }
    .footer-signatures {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 25px;
      padding-top: 15px;
      border-top: 1px solid #C6D6CE;
    }
    .sig-box {
      text-align: center;
      width: 200px;
    }
    .sig-name {
      font-size: 13px;
      font-weight: 700;
      font-style: italic;
      color: #1C3329;
    }
    .sig-line {
      height: 1px;
      background: #0A5C3E;
      margin: 4px auto;
      width: 140px;
    }
    .sig-title {
      font-size: 10px;
      color: #5A7366;
      text-transform: uppercase;
    }
    .qr-box {
      text-align: center;
    }
    .qr-box img {
      width: 75px;
      height: 75px;
      border: 1px solid #C6D6CE;
      padding: 2px;
      background: #ffffff;
    }
    .legal-notice {
      text-align: center;
      font-size: 9px;
      color: #94a3b8;
      margin-top: 15px;
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .charter-card { box-shadow: none; border-width: 8px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="max-width: 1050px; margin: 0 auto 15px auto; display: flex; justify-content: space-between; align-items: center; background: #e0f2fe; padding: 12px 20px; border-radius: 8px; border: 1px solid #bae6fd;">
    <div style="font-size: 13px; color: #0369a1; font-weight: 600;">
      📄 Official Charter Document Generated for <strong>${club.name}</strong>
    </div>
    <div>
      <button onclick="window.print()" style="background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; margin-right: 8px;">
        🖨️ Print / Save as PDF
      </button>
      <button onclick="window.close()" style="background: #0A5C3E; color: white; border: none; padding: 8px 14px; border-radius: 6px; font-weight: bold; cursor: pointer;">
        Close
      </button>
    </div>
  </div>

  <div class="charter-card">
    <div class="tricolor-bar">
      <div class="orange"></div>
      <div class="white"></div>
      <div class="green"></div>
    </div>

    <div class="header-text">
      <div class="ministry">Ministry of Education • Government of India</div>
      <div class="ndli-title">NATIONAL DIGITAL LIBRARY OF INDIA</div>
      <div class="iit-kgp">Coordinated by Indian Institute of Technology Kharagpur</div>
    </div>

    <div class="divider"></div>

    <div class="charter-headline">
      <div class="charter-type">Certificate of Official Institutional Charter</div>
      <div class="conferred-to">This is to certify that an official NDLI Club has been established at</div>
    </div>

    <div class="institute-name">${club.name}</div>

    <div class="charter-details">
      <div><strong>AISHE Code:</strong> ${club.aisheCode}</div>
      <div><strong>Club Registration ID:</strong> ${club.id}</div>
      <div><strong>Location:</strong> ${club.district}, ${club.state}</div>
      <div><strong>Effective Date:</strong> ${currentDate}</div>
    </div>

    <div class="passkey-box">
      <div class="passkey-title">Official Institutional Passkey for Member Enrollment</div>
      <div class="passkey-code">${club.passkey}</div>
    </div>

    <table class="authorities-table">
      <thead>
        <tr>
          <th>Quorum Role</th>
          <th>Designated Authority Name</th>
          <th>Official Designation</th>
          <th>Institutional Verification</th>
        </tr>
      </thead>
      <tbody>
        ${club.authorities.map(a => `
          <tr>
            <td><strong>${a.role}</strong></td>
            <td>${a.name}</td>
            <td>${a.designation}</td>
            <td style="color: #166534; font-weight: 600;">✓ Verified Signatory</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="footer-signatures">
      <div class="sig-box">
        <div class="sig-name">Prof. A. R. Deshmukh</div>
        <div class="sig-line"></div>
        <div class="sig-title">Director, IIT Kharagpur<br>Patron, NDLI Initiative</div>
      </div>

      <div class="qr-box">
        ${qrDataUrl ? `<img src="${qrDataUrl}" alt="Verification QR Code">` : ''}
        <div style="font-size: 9px; font-family: monospace; font-weight: bold; margin-top: 3px;">
          VERIFIED RECORD: ${club.id}
        </div>
      </div>

      <div class="sig-box">
        ${(() => {
          let name = 'Dr. Plaban Kumar Bhowmick';
          let affil = 'Principal Investigator<br>National Digital Library of India';
          let img = '';
          try {
            if (typeof localStorage !== 'undefined') {
              const raw = localStorage.getItem('ndli_pi_settings');
              if (raw) {
                const s = JSON.parse(raw);
                if (s.pi_name) name = s.pi_name;
                if (s.pi_affiliation) affil = s.pi_affiliation.replace(/\n/g, '<br>');
                if (s.signature_image_url) {
                  img = `<img src="${s.signature_image_url}" alt="PI Signature" style="max-height: 44px; max-width: 150px; object-fit: contain; display: block; margin: 0 auto 4px auto;">`;
                }
              }
            }
          } catch {}
          return `${img}<div class="sig-name">${name}</div><div class="sig-line"></div><div class="sig-title">${affil}</div>`;
        })()}
      </div>
    </div>

    <div class="legal-notice">
      Issued under the National Mission on Education through ICT (NMEICT), Ministry of Education, Govt. of India.
      This digital charter is legally valid and cryptographically verifiable.
    </div>
  </div>
</body>
</html>`;

  // 1. Trigger Direct Local File Download (Blob)
  const blob = new Blob([charterHtml], { type: 'text/html;charset=utf-8' });
  const downloadLink = document.createElement('a');
  const sanitizedName = club.name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = `NDLI_Club_Charter_${sanitizedName}_${club.passkey}.html`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);

  // 2. Also open in new window so user can immediately "Print / Save as PDF"
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(charterHtml);
    printWindow.document.close();
  }
}
