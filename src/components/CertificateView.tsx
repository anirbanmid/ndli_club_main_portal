import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { 
  Award, 
  Download, 
  Printer, 
  CheckCircle2, 
  Share2, 
  ExternalLink, 
  ShieldCheck, 
  ArrowLeft,
  Copy,
  Check
} from 'lucide-react';
import { CertificateData } from '../types';
import { t } from "../i18n";

interface CertificateViewProps {
  certificate: CertificateData;
  onBack: () => void;
  onVerifyOnline: (certId: string) => void;
}

export const CertificateView: React.FC<CertificateViewProps> = ({
  certificate,
  onBack,
  onVerifyOnline,
}) => {
  const [qrCodeUrl, setQrCodeUrl] = useState(certificate.qrDataUrl || '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!qrCodeUrl) {
      const verifyUrl = `${window.location.origin}?tab=verify&certId=${certificate.certId}`;
      QRCode.toDataURL(verifyUrl, {
        width: 150,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      }).then(url => setQrCodeUrl(url));
    }
  }, [certificate, qrCodeUrl]);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}?tab=verify&certId=${certificate.certId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Top action toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs print:hidden">
        <button
          onClick={onBack}
          className="flex items-center space-x-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("Back to Portal")}</span>
        </button>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full font-bold flex items-center space-x-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{t("Cryptographically Verified")}</span>
          </span>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleCopyLink}
            className="px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}
            <span>{copied ? t("Copied Link") : t("Copy Verification URL")}</span>
          </button>

          <button
            onClick={() => onVerifyOnline(certificate.certId)}
            className="px-3.5 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center space-x-1.5 transition-colors border border-blue-200"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>{t("Audit On Public Verifier")}</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md flex items-center space-x-1.5 transition-all"
          >
            <Printer className="h-4 w-4" />
            <span>{t("Print / Save PDF")}</span>
          </button>
        </div>
      </div>

      {/* The Printable Certificate Element */}
      <div 
        id="printable-certificate"
        className="relative bg-[#FFFDF9] border-[12px] border-double border-[#7E6238] rounded-2xl p-8 sm:p-14 shadow-2xl text-center space-y-6 overflow-hidden"
      >
        {/* Subtle Guilloche / Security pattern simulation */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#7E6238_2px,transparent_2px)] [background-size:24px_24px]"></div>
        
        {/* Top Header & Emblem */}
        <div className="relative space-y-2 border-b-2 border-[#7E6238]/30 pb-6">
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-[#7E6238]">
            {t("Ministry of Education, Government of India")}
                                </div>
          
          <div className="flex justify-center items-center space-x-4">
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-serif font-black tracking-wider text-slate-900" style={{ fontFamily: 'Cinzel, serif' }}>
                {t("NATIONAL DIGITAL LIBRARY OF INDIA")}
                                            </div>
              <div className="text-xs sm:text-sm font-semibold tracking-widest uppercase text-blue-900">
                {t("Coordinated by Indian Institute of Technology Kharagpur")}
                                            </div>
            </div>
          </div>

          <div className="text-xs font-semibold text-slate-600 tracking-wider">
            {t("NDLI CLUB INITIATIVE FOR DIGITAL LITERACY & SCHOLARSHIP")}
                                </div>
        </div>

        {/* Certificate Title */}
        <div className="py-2 space-y-1">
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#7E6238]">
            {t("Certificate of")} {t(certificate.category)}
          </div>
          <div className="text-2xl sm:text-4xl font-serif font-bold text-slate-900 italic" style={{ fontFamily: 'Playfair Display, serif' }}>
            {t("This is proudly presented to")}
                                </div>
        </div>

        {/* Recipient Name */}
        <div className="py-2">
          <div className="text-2xl sm:text-4xl font-extrabold text-blue-950 underline decoration-[#7E6238]/40 underline-offset-8">
            {certificate.recipientName}
          </div>
          {certificate.recipientRoll && (
            <div className="text-xs text-slate-600 font-mono mt-2">
              {t("Roll / ID:")} {certificate.recipientRoll}
            </div>
          )}
        </div>

        {/* Institution & Accomplishment */}
        <div className="max-w-2xl mx-auto space-y-3 text-xs sm:text-sm text-slate-700 leading-relaxed">
          <p>
            {t("representing")} <strong className="text-slate-900 font-bold">{certificate.instituteName}</strong>{t(", for successfully participating and demonstrating distinction in the national event:")}
                                </p>
          <div className="text-base sm:text-lg font-bold text-slate-900 bg-amber-500/10 py-2.5 px-4 rounded-xl border border-amber-500/20 inline-block font-serif">
            {certificate.eventName}
          </div>
          {certificate.score && (
            <p className="text-xs text-emerald-800 font-bold">
              {t("Performance Grade:")} {certificate.score}
            </p>
          )}
          <p className="text-xs text-slate-600">
            {t("Conducted under the National Mission on Education through Information & Communication Technology (NMEICT).")}
                                </p>
        </div>

        {/* Footer with Signatures and Dynamic QR Code */}
        <div className="pt-8 border-t-2 border-[#7E6238]/30 grid grid-cols-3 items-end gap-4 text-xs">
          {/* Signatory 1 */}
          <div className="text-center space-y-1">
            <div className="font-serif italic text-base text-slate-800 font-bold">{t("Prof. A. R. Deshmukh")}</div>
            <div className="h-0.5 w-28 bg-slate-400 mx-auto"></div>
            <div className="text-[11px] uppercase font-bold text-slate-600">{t("Patron, NDLI Project")}</div>
            <div className="text-[11px] text-slate-600">{t("Director, IIT Kharagpur")}</div>
          </div>

          {/* Center QR Verification */}
          <div className="text-center space-y-1.5 flex flex-col items-center">
            {qrCodeUrl && (
              <img 
                src={qrCodeUrl} 
                alt={t("Verification QR Code")} 
                className="h-20 w-20 p-1 bg-white border border-[#7E6238]/40 shadow-xs rounded"
              />
            )}
            <div className="text-[11px] font-mono font-bold text-slate-700">
              {t("ID:")} {certificate.certId}
            </div>
            <div className="text-[11px] text-emerald-700 font-semibold flex items-center space-x-1">
              <ShieldCheck className="h-3 w-3" />
              <span>{t("Scan to Verify Authenticity")}</span>
            </div>
          </div>

          {/* Signatory 2 */}
          <div className="text-center space-y-1">
            <div className="font-serif italic text-base text-slate-800 font-bold">{t("Prof. Partha P. Das")}</div>
            <div className="h-0.5 w-28 bg-slate-400 mx-auto"></div>
            <div className="text-[11px] uppercase font-bold text-slate-600">{t("Principal Investigator")}</div>
            <div className="text-[11px] text-slate-600">{t("National Digital Library of India")}</div>
          </div>
        </div>

        {/* Issue Date & Seal Notice */}
        <div className="text-[11px] text-slate-600 pt-2 flex justify-between items-center border-t border-slate-100">
          <span>{t("Date of Issue:")} {certificate.eventDate}</span>
          <span>{t("DigiLocker & National Academic Depository (NAD) Compliant")}</span>
        </div>
      </div>
    </div>
  );
};
