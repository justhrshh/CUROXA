import React, { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Download, Printer, Copy, Check, QrCode, Building2, Smartphone, ShieldCheck } from 'lucide-react';
import { getPublicFrontendUrl } from '../utils/api';
import curoxaSidebarLogo from '../assets/quroxa_new_logo.png';

const ReceptionQRModal = ({ isOpen, onClose, clinicCode, clinicName = 'Front Desk Reception' }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const resolvedCode = clinicCode || localStorage.getItem('tenantId') || 'clinic';
  const baseUrl = getPublicFrontendUrl();
  const queueUrl = `${baseUrl}/reception-queue/${encodeURIComponent(resolvedCode)}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(queueUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    const svg = document.getElementById('reception-qr-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = 1200;
      canvas.height = 1200;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 150, 150, 900, 900);
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `Reception_Queue_QR_${resolvedCode}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handlePrint = () => {
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Reception Check-In Signage - ${clinicName}</title>
        <style>
          @page { size: portrait; margin: 15mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            color: #0F172A;
            background: #FFF;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .signage-card {
            border: 2px solid #CBD5E1;
            border-radius: 28px;
            padding: 44px 36px;
            text-align: center;
            max-width: 480px;
            width: 100%;
            box-sizing: border-box;
          }
          .brand-badge {
            font-size: 13px;
            font-weight: 800;
            color: #0284C7;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 8px;
            display: inline-block;
          }
          .clinic-title {
            font-size: 28px;
            font-weight: 900;
            color: #0F172A;
            margin: 0 0 6px 0;
            line-height: 1.2;
          }
          .desk-label {
            font-size: 15px;
            color: #64748B;
            font-weight: 600;
            margin-bottom: 28px;
          }
          .qr-wrapper {
            padding: 24px;
            background: #F8FAFC;
            border: 2px dashed #94A3B8;
            border-radius: 24px;
            display: inline-block;
            margin-bottom: 24px;
          }
          .primary-instruction {
            font-size: 20px;
            font-weight: 900;
            color: #0F172A;
            margin-bottom: 8px;
          }
          .sub-instruction {
            font-size: 14px;
            color: #475569;
            line-height: 1.5;
            max-width: 380px;
            margin: 0 auto;
          }
          .step-list {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid #E2E8F0;
            font-size: 12px;
            color: #64748B;
            font-weight: 700;
          }
          .step-item {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .step-num {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #0284C7;
            color: #FFF;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 800;
          }
          .footer {
            margin-top: 28px;
            font-size: 11px;
            color: #94A3B8;
            font-weight: 600;
            letter-spacing: 0.5px;
          }
        </style>
      </head>
      <body>
        <div class="signage-card">
          <div class="brand-badge">QUROXA SMART RECEPTION</div>
          <h1 class="clinic-title">${clinicName}</h1>
          <div class="desk-label">Front Desk Digital Intake & Token Counter</div>
          
          <div class="qr-wrapper">
            ${document.getElementById('reception-qr-container')?.innerHTML || ''}
          </div>
          
          <div class="primary-instruction">Scan with Your Camera to Check-In</div>
          <div class="sub-instruction">
            Join the live reception waiting queue, receive your digital token, and track counter progress live on your smartphone.
          </div>

          <div class="step-list">
            <div class="step-item"><span class="step-num">1</span> Scan QR Code</div>
            <div class="step-item"><span class="step-num">2</span> Enter Mobile</div>
            <div class="step-item"><span class="step-num">3</span> Get Queue Token</div>
          </div>
          
          <div class="footer">STATION: ${resolvedCode.toUpperCase()} · QUROXA HEALTHCARE OS</div>
        </div>
      </body>
      </html>
    `;

    const printWin = window.open('', '_blank', 'width=800,height=950');
    if (printWin) {
      printWin.document.write(printContent);
      printWin.document.close();
      setTimeout(() => {
        printWin.focus();
        printWin.print();
      }, 500);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 select-none font-sans">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-100 flex flex-col gap-5 animate-fadeIn">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <QrCode size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 leading-tight">Reception Check-In Signage</h2>
              <p className="text-[11px] text-slate-400 font-medium">Front desk arrival & live token queue</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Clinic Summary Banner */}
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0">
              <Building2 size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 truncate">
                {clinicName}
              </div>
              <div className="text-[10px] font-mono text-slate-500 font-semibold truncate">
                Station Code: {resolvedCode}
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Check-In
          </span>
        </div>

        {/* QR Code Container */}
        <div 
          id="reception-qr-container"
          className="p-5 sm:p-6 bg-slate-50 border border-slate-200/90 rounded-2xl flex flex-col items-center justify-center shadow-inner"
        >
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            <QRCodeSVG
              id="reception-qr-svg"
              value={queueUrl}
              size={200}
              level="H"
              includeMargin={true}
              imageSettings={{
                src: curoxaSidebarLogo,
                x: undefined,
                y: undefined,
                height: 38,
                width: 38,
                excavate: true,
              }}
            />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider mt-3">
            <Smartphone size={13} className="text-blue-600" />
            <span>Scan with any Mobile Camera</span>
          </div>
          <p className="text-[10px] text-slate-400 text-center max-w-[260px] mt-0.5">
            Patients join queue and receive SMS/digital tokens without counter contact
          </p>
        </div>

        {/* Counter Check-In Link Display */}
        <div className="flex items-center gap-2 p-2 bg-slate-100/80 rounded-xl border border-slate-200">
          <input
            id="reception-qr-url-input"
            type="text"
            readOnly
            value={queueUrl}
            className="bg-transparent text-[11px] font-mono text-slate-600 outline-none w-full select-all px-1"
            title="Reception queue direct check-in URL"
          />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 min-h-[42px]"
            title="Copy Public Link"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 min-h-[42px]"
            title="Print Counter Signage Poster"
          >
            <Printer size={14} />
            <span>Print Poster</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadQR}
            className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 min-h-[42px]"
            title="Download PNG QR Graphic"
          >
            <Download size={14} />
            <span>Download PNG</span>
          </button>
        </div>

      </div>
    </div>
  );
};

export default ReceptionQRModal;
