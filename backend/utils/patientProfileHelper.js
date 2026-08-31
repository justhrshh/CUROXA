/**
 * Utility helper to determine if a Patient document contains all mandatory profile information.
 * Based on the actual required fields in the Curoxa Complete Your Profile form:
 * - Full Name (required)
 * - Contact / Mobile Number (required, valid 10-digit number)
 * - Age / DOB (required, age > 0 or ageMonths/Days or dob)
 * - Gender (required: Male / Female / Other)
 * - Home Address (required, non-empty, not Google sign-in placeholder)
 */
const isPatientProfileComplete = (patient) => {
  if (!patient) return false;

  // 1. Full Name: non-empty, not default generic placeholder
  const name = typeof patient.name === 'string' ? patient.name.trim() : '';
  if (!name || name.toLowerCase() === 'patient') {
    return false;
  }

  // 2. Contact: valid mobile number (10+ digits, not placeholder prefix 'G-', not email)
  const contact = (patient.contact || '').toString().trim();
  if (!contact || contact.startsWith('G-') || contact.includes('@')) {
    return false;
  }
  const digitsOnly = contact.replace(/\D/g, '');
  if (digitsOnly.length < 10) {
    return false;
  }

  // 3. Age / Date of Birth information (age > 0 or ageMonths/Days or dob)
  const ageNum = Number(patient.age);
  const ageMonthsNum = Number(patient.ageMonths);
  const ageDaysNum = Number(patient.ageDays);
  const hasValidAge = (!isNaN(ageNum) && ageNum > 0) ||
                      (!isNaN(ageMonthsNum) && ageMonthsNum > 0) ||
                      (!isNaN(ageDaysNum) && ageDaysNum > 0) ||
                      Boolean(patient.dob);
  if (!hasValidAge) {
    return false;
  }

  // 4. Gender: must be specified ('Male', 'Female', 'Other')
  const gender = typeof patient.gender === 'string' ? patient.gender.trim() : '';
  if (!gender || !['Male', 'Female', 'Other'].includes(gender)) {
    return false;
  }

  // 5. Home Address: must be non-empty and not placeholder
  const address = typeof patient.address === 'string' ? patient.address.trim() : '';
  if (!address || address.toLowerCase() === 'registered via google sign-in') {
    return false;
  }

  return true;
};

module.exports = {
  isPatientProfileComplete
};
