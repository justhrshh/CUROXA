const PDFDocument = require('pdfkit');

/**
 * Generates an encrypted, password-protected PDF containing official
 * tenant administrative credentials for Quroxa Healthcare Systems.
 *
 * @param {Object} options
 * @param {string} options.hospitalName
 * @param {string} options.hospitalCode
 * @param {string} [options.hospitalId]
 * @param {string} [options.subscriptionPlan]
 * @param {string} options.portalUrl
 * @param {string} options.adminName
 * @param {string} options.adminEmail
 * @param {string} options.adminPhone
 * @param {string} options.adminPassword
 * @param {string} options.pdfPassword - Password required to open the PDF
 * @returns {Promise<Buffer>}
 */
function generateCredentialPdf({
  hospitalName,
  hospitalCode,
  hospitalId,
  subscriptionPlan,
  portalUrl,
  adminName,
  adminEmail,
  adminPhone,
  adminPassword,
  pdfPassword
}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        userPassword: String(pdfPassword || 'ADMIN1234'),
        permissions: {
          printing: 'highResolution',
          modifying: false,
          copying: true,
          annotating: false
        },
        info: {
          Title: `Clinic Admin Credentials - ${hospitalName || 'Quroxa Tenant'}`,
          Author: 'Quroxa Healthcare Systems',
          Subject: 'Confidential Access Credentials'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      // Draw Top Header Banner
      doc.rect(40, 40, 515, 60).fill('#2563EB');
      doc.fillColor('#FFFFFF')
         .fontSize(18)
         .font('Helvetica-Bold')
         .text('QUROXA HEALTHCARE EMR', 60, 52);
      doc.fontSize(9.5)
         .font('Helvetica')
         .text('Official Tenant Provisioning & Administrator Access Credentials', 60, 77);

      // Security Notice Tag
      doc.rect(40, 115, 515, 26).fill('#FEF2F2');
      doc.rect(40, 115, 515, 26).stroke('#FECACA');
      doc.fillColor('#991B1B')
         .fontSize(8.5)
         .font('Helvetica-Bold')
         .text('CONFIDENTIAL DOCUMENT: Contains privileged administrator access keys. Do not distribute.', 55, 123);

      // Section 1: Clinic Node Specification
      doc.fillColor('#1E293B')
         .fontSize(12)
         .font('Helvetica-Bold')
         .text('1. Clinic Node Specification', 40, 155);

      doc.rect(40, 172, 515, 95).fill('#F8FAFC');
      doc.rect(40, 172, 515, 95).stroke('#E2E8F0');

      const col1X = 55;
      const col2X = 300;
      let curY = 185;

      doc.fillColor('#64748B').fontSize(9.5).font('Helvetica').text('Clinic Name:', col1X, curY);
      doc.fillColor('#0F172A').font('Helvetica-Bold').text(hospitalName || 'N/A', col1X + 90, curY, { width: 145, ellipsis: true });

      doc.fillColor('#64748B').font('Helvetica').text('Subscription Tier:', col2X, curY);
      doc.fillColor('#2563EB').font('Helvetica-Bold').text((subscriptionPlan || 'STANDARD').toUpperCase(), col2X + 95, curY);

      curY += 22;
      doc.fillColor('#64748B').font('Helvetica').text('Tenant ID (Code):', col1X, curY);
      doc.fillColor('#0F172A').font('Helvetica-Bold').text(hospitalCode || 'N/A', col1X + 90, curY);

      doc.fillColor('#64748B').font('Helvetica').text('Portal ID:', col2X, curY);
      doc.fillColor('#0F172A').font('Helvetica-Bold').text(hospitalId || 'N/A', col2X + 95, curY);

      curY += 22;
      doc.fillColor('#64748B').font('Helvetica').text('Provisioned On:', col1X, curY);
      doc.fillColor('#0F172A').font('Helvetica').text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), col1X + 90, curY);

      doc.fillColor('#64748B').font('Helvetica').text('Status:', col2X, curY);
      doc.fillColor('#059669').font('Helvetica-Bold').text('ACTIVE (LIVE)', col2X + 95, curY);

      // Section 2: Administrator Access Keys
      doc.fillColor('#1E293B')
         .fontSize(12)
         .font('Helvetica-Bold')
         .text('2. Root Administrator Credentials', 40, 285);

      doc.rect(40, 302, 515, 145).fill('#EFF6FF');
      doc.rect(40, 302, 515, 145).stroke('#BFDBFE');

      let credY = 315;
      doc.fillColor('#475569').fontSize(9.5).font('Helvetica').text('Administrator Name:', col1X, credY);
      doc.fillColor('#0F172A').font('Helvetica-Bold').text(adminName || 'N/A', col1X + 130, credY);

      credY += 22;
      doc.fillColor('#475569').font('Helvetica').text('Registered Email:', col1X, credY);
      doc.fillColor('#0F172A').font('Helvetica-Bold').text(adminEmail || 'N/A', col1X + 130, credY);

      credY += 22;
      doc.fillColor('#475569').font('Helvetica').text('Username (Login ID):', col1X, credY);
      doc.fillColor('#1E40AF').font('Helvetica-Bold').fontSize(10.5).text(adminPhone || 'N/A', col1X + 130, credY);

      credY += 22;
      doc.fillColor('#475569').fontSize(9.5).font('Helvetica').text('Security Password:', col1X, credY);
      doc.fillColor('#B91C1C').font('Helvetica-Bold').fontSize(10.5).text(adminPassword || 'N/A', col1X + 130, credY);

      credY += 22;
      doc.fillColor('#475569').fontSize(9.5).font('Helvetica').text('Clinic Portal URL:', col1X, credY);
      doc.fillColor('#2563EB').font('Helvetica-Bold').text(portalUrl || 'N/A', col1X + 130, credY, { link: portalUrl, underline: true });

      // Security Checklist Box
      doc.rect(40, 465, 515, 110).fill('#F8FAFC');
      doc.rect(40, 465, 515, 110).stroke('#E2E8F0');

      doc.fillColor('#1E293B').fontSize(10.5).font('Helvetica-Bold').text('Security & Operational Guidelines', 55, 478);
      doc.fillColor('#475569').fontSize(8.5).font('Helvetica')
         .text('• Upon first login, navigate to Profile Settings and immediately update your temporary password.', 55, 498)
         .text('• Two-Factor Authentication (2FA) and scheduled password rotation policies are enabled for your tenant.', 55, 514)
         .text('• Ensure only authorized personnel have access to this document. Store in a secure credential vault.', 55, 530)
         .text('• For 24/7 technical support or portal setup assistance, reach out to support@quroxa.com.', 55, 546);

      // Document Password Verification Box
      doc.rect(40, 595, 515, 45).fill('#F0FDF4');
      doc.rect(40, 595, 515, 45).stroke('#BBF7D0');
      doc.fillColor('#166534').fontSize(9).font('Helvetica-Bold')
         .text('Document Security Standard:', 55, 606);
      doc.fillColor('#15803D').fontSize(8.5).font('Helvetica')
         .text(`This credentials dossier was encrypted using password '${pdfPassword}' (First 4 letters of Admin Name + Last 4 digits of Telephone).`, 55, 620);

      // Footer
      doc.fillColor('#94A3B8')
         .fontSize(8)
         .font('Helvetica')
         .text('© 2026 Quroxa Healthcare Systems. End-to-End Encrypted HIPAA & DPDP Compliant Infrastructure.', 40, 770, { align: 'center', width: 515 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Derives the standard PDF password formula:
 * First 4 letters of Admin Name (UPPERCASE) + Last 4 digits of Admin Phone
 *
 * @param {string} adminName
 * @param {string} adminPhone
 * @returns {string} e.g. "MAHA1251"
 */
function derivePdfPassword(adminName, adminPhone) {
  const nameChars = String(adminName || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  const namePart = (nameChars + 'XXXX').slice(0, 4);

  const phoneDigits = String(adminPhone || '').replace(/[^0-9]/g, '');
  const phonePart = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : phoneDigits.padStart(4, '0');

  return `${namePart}${phonePart}`;
}

module.exports = {
  generateCredentialPdf,
  derivePdfPassword
};
