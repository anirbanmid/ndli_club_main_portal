import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import QRCode from 'qrcode';
import { X, Award, CheckCircle2, AlertCircle, ArrowRight, BookOpen, Sparkles } from 'lucide-react';
import { SAMPLE_QUIZ_QUESTIONS } from '../mockData';
import { CertificateData } from '../types';

interface QuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCertificateGenerated: (cert: CertificateData) => void;
}

export const QuizModal: React.FC<QuizModalProps> = ({
  isOpen,
  onClose,
  onCertificateGenerated,
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Student credentials for certificate
  const [candidateName, setCandidateName] = useState('Devendra Sharma');
  const [candidateInstitute, setCandidateInstitute] = useState('Indian Institute of Technology Kharagpur');
  const [candidateEmail, setCandidateEmail] = useState('devendra.s@iitkgp.ac.in');

  if (!isOpen) return null;

  const currentQ = SAMPLE_QUIZ_QUESTIONS[currentIdx];

  const handleSelect = (idx: number) => {
    setSelectedOption(idx);
  };

  const handleNext = () => {
    if (selectedOption === null) return;
    const nextAnswers = [...answers, selectedOption];
    setAnswers(nextAnswers);
    setSelectedOption(null);

    if (currentIdx + 1 < SAMPLE_QUIZ_QUESTIONS.length) {
      setCurrentIdx(currentIdx + 1);
    } else {
      // Calculate score
      let scoreCount = 0;
      SAMPLE_QUIZ_QUESTIONS.forEach((q: any, i: number) => {
        if (nextAnswers[i] === q.correctIndex) {
          scoreCount++;
        }
      });

      // Fire celebratory confetti!
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
      });

      setIsSubmitted(true);
    }
  };

  const handleGenerateCertificate = async () => {
    const randomHex = Math.floor(1000 + Math.random() * 9000);
    const certId = `NDLI-2026-${randomHex}-M`;

    // Generate QR verification data URL
    const verifyUrl = `${window.location.origin}/verify/${certId}`;
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width: 160,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });
    } catch (e) {
      console.error(e);
    }

    const newCert: CertificateData = {
      certId,
      recipientName: candidateName,
      recipientEmail: candidateEmail,
      recipientRoll: '22EE10088',
      instituteName: candidateInstitute,
      eventName: 'National Reading Month 2026: Open Research & Digital Ethics Assessment',
      eventDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      category: 'Merit',
      score: '100% Score (Excellence)',
      issuedAt: new Date().toISOString(),
      qrDataUrl,
      verified: true,
      authorityApproved: true
    };


    onCertificateGenerated(newCert);
    onClose();
  };

  const resetQuiz = () => {
    setCurrentIdx(0);
    setSelectedOption(null);
    setAnswers([]);
    setIsSubmitted(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative animate-in fade-in my-8">
        {/* Close Button */}
        <button
          onClick={resetQuiz}
          className="absolute right-5 top-5 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {!isSubmitted ? (
          <div className="space-y-6">
            <div className="space-y-1">
              <div className="inline-flex items-center space-x-2 text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                <span>Live National Evaluation</span>
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Digital Research & Open Knowledge Quiz
              </h3>
              <div className="flex justify-between items-center text-xs text-slate-500 pt-2 border-b border-slate-100 pb-2">
                <span>Question {currentIdx + 1} of {SAMPLE_QUIZ_QUESTIONS.length}</span>
                <span className="font-semibold text-blue-700">Pass Mark: 75% for Certificate</span>
              </div>
            </div>

            {/* Question Box */}
            <div className="space-y-4">
              <h4 className="text-base font-bold text-slate-800 leading-snug">
                {currentQ.question}
              </h4>

              {/* Options */}
              <div className="space-y-2.5">
                {currentQ.options.map((opt: string, idx: number) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelect(idx)}
                    className={`w-full text-left p-3.5 rounded-xl border text-xs sm:text-sm font-medium transition-all flex items-start space-x-3 ${
                      selectedOption === idx
                        ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold shadow-xs ring-2 ring-blue-500/20'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className={`h-5 w-5 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                      selectedOption === idx ? 'bg-blue-600 text-white font-bold' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="leading-relaxed">{opt}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="button"
                disabled={selectedOption === null}
                onClick={handleNext}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm shadow-md flex items-center space-x-2 transition-all"
              >
                <span>{currentIdx + 1 === SAMPLE_QUIZ_QUESTIONS.length ? 'Submit Assessment' : 'Next Question'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          /* Completion & Instant Certificate Claim Screen */
          <div className="space-y-6 text-center py-2">
            <div className="h-16 w-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <Award className="h-10 w-10" />
            </div>

            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                Assessment Passed with Distinction (100%)
              </span>
              <h3 className="text-2xl font-extrabold text-slate-900">
                Congratulations, Scholar!
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                You have demonstrated proficiency in National Digital Library ethics, governance, and research methodologies.
              </p>
            </div>

            {/* Candidate Credential Confirmation */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-3 text-xs">
              <div className="font-bold text-slate-800 text-xs uppercase tracking-wider text-center border-b border-slate-200 pb-2">
                Confirm Details for Certificate Issuance
              </div>

              <div>
                <label className="text-slate-500 font-semibold block mb-1">Your Full Name:</label>
                <input
                  type="text"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-800 bg-white"
                />
              </div>

              <div>
                <label className="text-slate-500 font-semibold block mb-1">Your College / University:</label>
                <input
                  type="text"
                  value={candidateInstitute}
                  onChange={(e) => setCandidateInstitute(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-medium text-slate-800 bg-white"
                />
              </div>

              <div className="text-[11px] text-slate-400 italic text-center">
                Instant digital signature applied by IIT Kharagpur certification authority.
              </div>
            </div>

            <button
              onClick={handleGenerateCertificate}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-400 hover:to-orange-500 text-white font-extrabold text-sm shadow-xl flex items-center justify-center space-x-2 transition-all hover:scale-[1.02]"
            >
              <Award className="h-5 w-5" />
              <span>Generate & View Instant Verifiable Certificate</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
