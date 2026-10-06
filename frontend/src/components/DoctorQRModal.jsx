import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Download, Printer, Copy, Check, QrCode, Stethoscope } from 'lucide-react';
import curoxaSidebarLogo from '../assets/quroxa_new_logo.png';

const DoctorQRModal = ({ isOpen, onClose, doctor, hospitalName }) => {
  const [copied, setCopied] = React.useState(false);
  const printRef = useRef(null);

  if (!isOpen || !doctor) return null;

  const publicQueueId = doctor.publicQueueId;
  // Resolve base URL robustly: supports production domains, proxy origins, and localhost dev
  const baseUrl = import.meta.env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const queueUrl = `${baseUrl}/doctor/queue/${publicQueueId}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(queueUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    const svg = document.getElementById('doctor-qr-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = 1000;
      canvas.height = 1000;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 100, 100, 800, 800);
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `QR_${doctor.name.replace(/[^a-zA-Z0-9]/g, '_')}_Live_Queue.png`;
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
        <title>Doctor Live Queue QR - ${doctor.name}</title>
        <style>
          @page { size: portrait; margin: 20mm; }
          body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            color: #0F172A;
            background: #FFF;
          }
          .card {
            border: 2px solid #E2E8F0;
            border-radius: 24px;
            padding: 40px;
            text-align: center;
            max-width: 420px;
            box-shadow: none;
          }
          .hospital {
            font-size: 14px;
            font-weight: 800;
            color: #2563EB;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
          }
          .doctor {
            font-size: 26px;
            font-weight: 900;
            color: #0F172A;
            margin: 0 0 6px 0;
          }
          .specialty {
            font-size: 15px;
            color: #64748B;
            font-weight: 600;
            margin-bottom: 28px;
          }
          .qr-box {
            padding: 20px;
            background: #F8FAFC;
            border: 2px dashed #CBD5E1;
            border-radius: 20px;
            display: inline-block;
            margin-bottom: 24px;
          }
          .instruction {
            font-size: 16px;
            font-weight: 800;
            color: #1E293B;
            margin-bottom: 6px;
          }
          .sub-instruction {
            font-size: 13px;
            color: #64748B;
            line-height: 1.5;
          }
          .footer {
            margin-top: 32px;
            padding-top: 16px;
            border-top: 1px solid #E2E8F0;
            font-size: 11px;
            color: #94A3B8;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="hospital">${hospitalName || 'QUROXA HEALTHCARE'}</div>
          <h1 class="doctor">${doctor.name.startsWith('Dr') ? doctor.name : `Dr. ${doctor.name}`}</h1>
          <div class="specialty">${doctor.specialty || doctor.department || 'General Medicine'}</div>
          <div class="qr-box">
            ${document.getElementById('doctor-qr-container')?.innerHTML || ''}
          </div>
          <div class="instruction">Scan to View Live Queue</div>
          <div class="sub-instruction">Track live consultation tokens, queue status, and wait times directly on your mobile.</div>
          <div class="footer">Powered by Quroxa Intelligent Healthcare Engine</div>
        </div>
      </body>
      </html>
    `;

    const printWin = window.open('', '_blank', 'width=800,height=900');
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
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 flex flex-col gap-5 animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <QrCode size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Doctor Live Queue QR</h2>
              <p className="text-xs text-slate-400 font-medium">Scannable patient entrance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Doctor Summary Pill */}
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
            <Stethoscope size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 truncate">
              {doctor.name.startsWith('Dr') ? doctor.name : `Dr. ${doctor.name}`}
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate">
              {doctor.specialty || doctor.department || 'General Medicine'}
            </div>
          </div>
        </div>

        {/* QR Code Container */}
        <div 
          id="doctor-qr-container"
          className="p-6 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col items-center justify-center shadow-inner"
        >
          {publicQueueId ? (
            <QRCodeSVG
              id="doctor-qr-svg"
              value={queueUrl}
              size={200}
              level="H"
              includeMargin={true}
              imageSettings={{
                src: curoxaSidebarLogo,
                x: undefined,
                y: undefined,
                height: 36,
                width: 36,
                excavate: true,
              }}
            />
          ) : (
            <div className="text-xs text-slate-400 text-center py-8">
              No publicQueueId configured for this doctor.
            </div>
          )}
          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mt-3">
            Scan with any Camera / QR App
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleCopyLink}
            className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5"
            title="Copy Public Link"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>

          <button
            onClick={handlePrint}
            className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5"
            title="Print Counter Sign"
          >
            <Printer size={14} />
            <span>Print</span>
          </button>

          <button
            onClick={handleDownloadQR}
            className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold rounded-xl transition shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5"
            title="Download PNG QR"
          >
            <Download size={14} />
            <span>Save PNG</span>
          </button>
        </div>

      </div>
    </div>
  );
};

export default DoctorQRModal;
