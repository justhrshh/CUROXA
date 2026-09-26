import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../utils/api';
import { 
  ClipboardList, 
  Camera, 
  Upload, 
  CheckCircle, 
  ChevronDown, 
  X, 
  AlertCircle,
  ArrowLeft,
  Calendar,
  User,
  HeartPulse,
  ShieldCheck
} from 'lucide-react';

const DEFAULT_SYMPTOMS = [
  'Fever', 'Cough', 'Cold', 'Headache', 'Body Pain', 'Fatigue', 'Sore Throat',
  'Nausea', 'Vomiting', 'Shortness of Breath', 'Chest Pain', 'Abdominal Pain',
  'Dizziness', 'Skin Rash', 'Joint Pain', 'Back Pain', 'Acidity / Heartburn',
  'Loss of Appetite', 'Diarrhea', 'Weakness', 'Anxiety / Stress',
  'Sleep Disturbance', 'Eye Irritation', 'Earache', 'Allergic Reaction',
  'High Blood Pressure', 'Diabetes Symptoms', 'Urinary Burning / Pain',
  'Weight Loss', 'Weight Gain'
];

const DEFAULT_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM'
];

const PatientRegistration = () => {
  const navigate = useNavigate();
  const location = useLocation();
  let savedEmailOrPhone = '';
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    savedEmailOrPhone = u.emailOrPhone || u.email || '';
  } catch(e) {}

  const tempToken = location.state?.tempToken || localStorage.getItem('token');
  const initialContact = location.state?.emailOrPhone || savedEmailOrPhone || '';

  const getLocalDateString = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Form states matching ReceptionistDashboard exactly
  const [formData, setFormData] = useState({
    title: '',
    name: '',
    age: '',
    ageMonths: '',
    ageDays: '',
    gender: '',
    contact: initialContact.includes('@') ? '' : initialContact,
    email: initialContact.includes('@') ? initialContact : '',
    doctorId: '',
    bloodGroup: 'O+',
    address: '',
    medicalHistory: '',
    referredBy: '',
    allergies: 'None',
    currentMedications: ''
  });

  // Appointment & Slot states
  const [doctors, setDoctors] = useState([]);
  const [bookingDate, setBookingDate] = useState(getLocalDateString());
  const [selectedSlot, setSelectedSlot] = useState('');
  const [doctorAvailability, setDoctorAvailability] = useState({ available: true, slots: DEFAULT_SLOTS });
  const [existingAppointments, setExistingAppointments] = useState([]);

  // Symptoms states
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [symptomDropdownOpen, setSymptomDropdownOpen] = useState(false);
  const [symptomSearchQuery, setSymptomSearchQuery] = useState('');

  // Vitals states
  const [vitalTemp, setVitalTemp] = useState('');
  const [vitalPulse, setVitalPulse] = useState('');
  const [vitalWeight, setVitalWeight] = useState('');
  const [vitalBpSys, setVitalBpSys] = useState('');
  const [vitalBpDia, setVitalBpDia] = useState('');
  const [vitalHeight, setVitalHeight] = useState('');

  // Consent & Photo
  const [dpdpConsent, setDpdpConsent] = useState({ emrCreation: true, dataSharing: false });
  const [patientPhoto, setPatientPhoto] = useState(null);

  // Status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!tempToken) {
      navigate('/patient/login');
      return;
    }

    // Fetch Universal Doctors list
    const fetchDoctors = async () => {
      try {
        const res = await api.get('/auth/doctors/universal');
        setDoctors(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        try {
          const fallbackRes = await api.get('/doctors');
          setDoctors(Array.isArray(fallbackRes.data) ? fallbackRes.data : []);
        } catch (e) {
          console.error('Failed to load doctors', e);
        }
      }
    };

    fetchDoctors();
  }, [tempToken, navigate]);

  // Fetch Doctor Availability & Booked slots when doctor or date changes
  useEffect(() => {
    if (!formData.doctorId || !bookingDate) return;

    const fetchAvailability = async () => {
      try {
        const res = await api.get(`/hr/doctor-availability/${formData.doctorId}?date=${bookingDate}`);
        if (res.data) {
          setDoctorAvailability(res.data);
        }
      } catch (err) {
        const selectedDoc = doctors.find(d => String(d._id) === String(formData.doctorId));
        const docSlots = selectedDoc?.doctorSlots?.length > 0 ? selectedDoc.doctorSlots : DEFAULT_SLOTS;
        setDoctorAvailability({ available: true, slots: docSlots });
      }

      try {
        const appRes = await api.get(`/appointments?doctorId=${formData.doctorId}`);
        setExistingAppointments(Array.isArray(appRes.data) ? appRes.data : []);
      } catch (e) {
        console.error('Failed to fetch booked slots', e);
      }
    };

    fetchAvailability();
  }, [formData.doctorId, bookingDate, doctors]);

  const toggleSymptom = (symptom) => {
    if (selectedSymptoms.includes(symptom)) {
      setSelectedSymptoms(selectedSymptoms.filter(s => s !== symptom));
    } else {
      setSelectedSymptoms([...selectedSymptoms, symptom]);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setSuccess('');

    const hasAnyAge = Boolean(
      (formData.age !== '' && !isNaN(formData.age) && Number(formData.age) >= 0) ||
      (formData.ageMonths !== '' && !isNaN(formData.ageMonths) && Number(formData.ageMonths) >= 0) ||
      (formData.ageDays !== '' && !isNaN(formData.ageDays) && Number(formData.ageDays) >= 0)
    );

    if (!formData.name || !hasAnyAge || !formData.gender || !formData.contact) {
      setError("Please fill in mandatory patient details (Full Name, Age [Years, Months, or Days], Gender, and Mobile Number).");
      return;
    }

    if (formData.contact.replace(/\D/g, '').length < 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    setLoading(true);

    try {
      // 1. Create Patient Record in target tenant
      const patientPayload = {
        name: `${formData.title ? formData.title + ' ' : ''}${formData.name.trim()}`,
        age: parseInt(formData.age, 10) || 0,
        ageMonths: parseInt(formData.ageMonths, 10) || 0,
        ageDays: parseInt(formData.ageDays, 10) || 0,
        gender: formData.gender,
        contact: formData.contact.trim(),
        email: (formData.email || (initialContact.includes('@') ? initialContact : '')).trim().toLowerCase(),
        bloodGroup: formData.bloodGroup || 'O+',
        address: formData.address || '',
        medicalHistory: formData.medicalHistory ? formData.medicalHistory.split(',').map(s => s.trim()).filter(Boolean) : [],
        allergies: formData.allergies || 'None',
        currentMedications: formData.currentMedications || '',
        dpdpConsent: dpdpConsent,
        avatar: patientPhoto || '',
        vitals: {
          temp: vitalTemp,
          pulse: vitalPulse,
          weight: vitalWeight,
          bpSys: vitalBpSys,
          bpDia: vitalBpDia,
          height: vitalHeight
        }
      };

      const res = await api.post('/patients', patientPayload, {
        headers: { Authorization: `Bearer ${tempToken}` }
      });

      const newPatient = res.data;

      // 2. If Doctor & Slot are selected, automatically create initial Pending Appointment
      if (formData.doctorId && selectedSlot) {
        try {
          await api.post('/appointments', {
            patientId: newPatient._id,
            doctorId: formData.doctorId,
            date: bookingDate,
            time: selectedSlot,
            reason: selectedSymptoms.length > 0 ? selectedSymptoms.join(', ') : 'General Consultation',
            status: 'Pending Approval',
            source: 'Online'
          }, {
            headers: { Authorization: `Bearer ${tempToken}` }
          });
        } catch (appErr) {
          console.warn("Initial appointment booking warning:", appErr);
        }
      }

      const responseData = res.data || {};
      const finalToken = responseData.token || tempToken;
      const finalUser = responseData.user || { 
        id: responseData._id || newPatient._id, 
        _id: responseData._id || newPatient._id, 
        name: responseData.name || newPatient.name, 
        role: 'patient', 
        isSetupComplete: true 
      };

      localStorage.setItem('token', finalToken);
      localStorage.setItem('user', JSON.stringify(finalUser));
      localStorage.setItem('tenantId', responseData.tenantId || 'city_hospital');
      window.dispatchEvent(new CustomEvent('curoxa_login_success'));

      setSuccess("Registration completed successfully! Opening your Patient Portal...");
      setTimeout(() => {
        navigate('/patient');
      }, 1000);

    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderField = (label, children, isReq = false) => (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{ width: '100px', fontSize: '11.5px', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center' }}>
        {label}
        {isReq && <span style={{ color: '#EF4444', fontSize: '16px', marginLeft: '3px', marginTop: '4px' }}>*</span>}
      </div>
      <div style={{ width: '12px', fontSize: '11.5px', color: '#94A3B8' }}>:</div>
      <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>{children}</div>
    </div>
  );

  const inputStyle = { 
    width: '100%', 
    height: '28px', 
    fontSize: '13px', 
    padding: '0 8px', 
    borderRadius: '6px', 
    background: 'white', 
    color: '#0F172A',
    border: '1px solid #CBD5E1',
    outline: 'none',
    boxSizing: 'border-box'
  };

  const selectStyle = { 
    ...inputStyle, 
    padding: '0 4px', 
    cursor: 'pointer' 
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: '16px 24px', fontFamily: 'Urbanist, -apple-system, BlinkMacSystemFont, sans-serif' }}>
      <style>{`
        .impressive-input { transition: all 0.2s ease-in-out; border: 1px solid #CBD5E1; }
        .impressive-input:focus { border-color: #2563EB !important; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important; outline: none; background: white !important; }
        .impressive-input:hover:not(:focus) { border-color: #94A3B8; }
        
        .impressive-select { transition: all 0.2s ease-in-out; border: 1px solid #CBD5E1; }
        .impressive-select:focus { border-color: #2563EB !important; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important; outline: none; }
        
        .impressive-btn-main { background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%) !important; box-shadow: 0 4px 14px rgba(37,99,235,0.3) !important; transition: all 0.2s; }
        .impressive-btn-main:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(37,99,235,0.4) !important; background: linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%) !important; }
        .impressive-btn-main:active { transform: translateY(1px); box-shadow: 0 2px 4px rgba(37,99,235,0.3) !important; }
        
        .vitals-box { background: linear-gradient(to right, #FFF1F2, #FFF7ED) !important; border-color: #FECDD3 !important; }
      `}</style>

      {/* Top Navbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={() => navigate('/patient/login')}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'white', border: '1px solid #CBD5E1', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#475569' }}
          >
            <ArrowLeft size={14} /> Back to Login
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }}></span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>Quroxa Patient Self-Registration</span>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 16px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534', padding: '10px 16px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle size={16} />
          <span>{success}</span>
        </div>
      )}

      {/* Main Dense Container (Identical to Receptionist Dashboard) */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
        
        {/* Header / Title Bar */}
        <div style={{ background: 'linear-gradient(90deg, #F0F9FF 0%, #FFFFFF 100%)', padding: '12px 16px', borderBottom: '1px solid #E2E8F0', borderLeft: '4px solid #3B82F6', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#EFF6FF', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={16} />
          </div>
          <h1 style={{ fontWeight: 800, fontSize: '15px', color: '#0F172A', margin: 0 }}>New Registration & Appointment</h1>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }}></span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>System Online</span>
          </div>
        </div>

        <div style={{ display: 'flex', minHeight: '620px', background: '#FFFFFF' }}>
          
          {/* Main Form Area (Left) */}
          <div style={{ flex: 1, padding: '16px', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            
            {/* Patient Info Grid (3 Columns Dense) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1fr) minmax(220px, 1fr)', gap: '8px 24px' }}>
              {renderField("Mobile No.", (
                <input 
                  type="text" 
                  className="impressive-input" 
                  style={inputStyle} 
                  value={formData.contact} 
                  onChange={e => setFormData({...formData, contact: e.target.value.replace(/\D/g, '').substring(0, 10)})} 
                  placeholder="10-digit mobile"
                />
              ), true)}

              {renderField("Title", (
                <select 
                  className="impressive-select" 
                  style={selectStyle} 
                  value={formData.title} 
                  onChange={e => {
                    const selectedTitle = e.target.value;
                    let autoGender = formData.gender;
                    if (selectedTitle === 'Mr.') autoGender = 'Male';
                    else if (selectedTitle === 'Mrs.' || selectedTitle === 'Miss') autoGender = 'Female';
                    else if (selectedTitle === 'Prefer not to say') autoGender = 'Other';
                    setFormData({...formData, title: selectedTitle, gender: autoGender});
                  }}
                >
                  <option value="">--Select--</option>
                  <option value="Mr.">Mr.</option>
                  <option value="Mrs.">Mrs.</option>
                  <option value="Miss">Miss</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              ), true)}

              {renderField("Patient Name", (
                <input 
                  type="text" 
                  className="impressive-input" 
                  style={inputStyle} 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  placeholder="Full name"
                />
              ), true)}

              {renderField("Gender", (
                <select 
                  className="impressive-select" 
                  style={selectStyle} 
                  value={formData.gender} 
                  onChange={e => setFormData({...formData, gender: e.target.value})}
                >
                  <option value="">--Select--</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              ), true)}

              {renderField("Age", (
                <div style={{ display: 'flex', gap: '4px', width: '100%', alignItems: 'center' }}>
                  <input 
                    type="number" 
                    min="0" 
                    max="120"
                    placeholder="Yrs" 
                    className="impressive-input" 
                    style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '0 4px', textAlign: 'center' }} 
                    value={formData.age} 
                    onChange={e => setFormData({...formData, age: e.target.value})} 
                  />
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>Y</span>

                  <input 
                    type="number" 
                    min="0" 
                    max="11"
                    placeholder="Mths" 
                    className="impressive-input" 
                    style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '0 4px', textAlign: 'center' }} 
                    value={formData.ageMonths} 
                    onChange={e => setFormData({...formData, ageMonths: e.target.value})} 
                  />
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>M</span>

                  <input 
                    type="number" 
                    min="0" 
                    max="30"
                    placeholder="Days" 
                    className="impressive-input" 
                    style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '0 4px', textAlign: 'center' }} 
                    value={formData.ageDays} 
                    onChange={e => setFormData({...formData, ageDays: e.target.value})} 
                  />
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>D</span>
                </div>
              ), true)}

              {renderField("Email", (
                <div style={{ display: 'flex', width: '100%', gap: '6px', alignItems: 'center' }}>
                  <input 
                    type="email" 
                    className="impressive-input" 
                    style={{ ...inputStyle, background: initialContact.includes('@') ? '#F8FAFC' : 'white' }} 
                    value={formData.email} 
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    placeholder="patient@example.com"
                    readOnly={initialContact.includes('@')}
                  />
                  {initialContact.includes('@') ? (
                    <span style={{ fontSize: '11px', background: '#DCFCE7', color: '#15803D', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      Verified
                    </span>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      (Optional)
                    </span>
                  )}
                </div>
              ))}

              {renderField("Blood Group", (
                <select 
                  className="impressive-select" 
                  style={selectStyle} 
                  value={formData.bloodGroup} 
                  onChange={e => setFormData({...formData, bloodGroup: e.target.value})}
                >
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                </select>
              ))}

              <div style={{ gridColumn: 'span 2' }}>
                {renderField("Address", (
                  <input 
                    type="text" 
                    className="impressive-input" 
                    style={inputStyle} 
                    value={formData.address} 
                    onChange={e => setFormData({...formData, address: e.target.value})} 
                    placeholder="House/Street, City, Pin"
                  />
                ))}
              </div>

              {renderField("Medical Hist.", (
                <input 
                  type="text" 
                  className="impressive-input" 
                  style={inputStyle} 
                  value={formData.medicalHistory} 
                  onChange={e => setFormData({...formData, medicalHistory: e.target.value})} 
                  placeholder="E.g. Diabetes, Hypertension"
                />
              ))}

              {renderField("Allergies", (
                <input 
                  type="text" 
                  className="impressive-input" 
                  style={inputStyle} 
                  value={formData.allergies} 
                  onChange={e => setFormData({...formData, allergies: e.target.value})} 
                  placeholder="E.g. Penicillin, Pollen"
                />
              ))}

              <div style={{ gridColumn: 'span 2' }}>
                {renderField("Current Meds.", (
                  <input 
                    type="text" 
                    className="impressive-input" 
                    style={inputStyle} 
                    value={formData.currentMedications} 
                    onChange={e => setFormData({...formData, currentMedications: e.target.value})} 
                    placeholder="Ongoing medications (if any)"
                  />
                ))}
              </div>
            </div>

            <div style={{ height: '1px', background: '#E2E8F0', margin: '4px 0' }}></div>

            {/* Visit & Appointment Details (OPD booking identical to Receptionist) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1fr) minmax(220px, 1fr)', gap: '8px 24px' }}>
              {renderField("Symptoms", (
                <div className="custom-dropdown-container" style={{ width: '100%', position: 'relative' }}>
                  <div 
                    className="custom-dropdown-trigger impressive-input" 
                    onClick={() => setSymptomDropdownOpen(!symptomDropdownOpen)} 
                    style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '0 8px', height: 'auto', minHeight: '28px' }}
                  >
                    <div className="selected-items" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '2px 0' }}>
                      {selectedSymptoms.length > 0 ? (
                        selectedSymptoms.map(s => (
                          <div key={s} style={{ background: '#F1F5F9', color: '#334155', padding: '2px 6px', fontSize: '10.5px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid #E2E8F0', fontWeight: 600 }}>
                            {s}
                            <span onClick={(e) => { e.stopPropagation(); toggleSymptom(s); }} style={{ cursor: 'pointer', display: 'inline-flex' }}>
                              <X size={10} />
                            </span>
                          </div>
                        ))
                      ) : (
                        <span style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 500 }}>Select symptoms...</span>
                      )}
                    </div>
                    <ChevronDown size={14} color="#94A3B8" style={{ transition: '0.3s', transform: symptomDropdownOpen ? 'rotate(180deg)' : 'none' }} />
                  </div>

                  {symptomDropdownOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #CBD5E1', borderRadius: '6px', marginTop: '4px', maxHeight: '160px', overflowY: 'auto', zIndex: 100, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                      <div style={{ padding: '6px', position: 'sticky', top: 0, background: 'white', borderBottom: '1px solid #F1F5F9' }}>
                        <input 
                          type="text" 
                          autoFocus 
                          placeholder="Search symptoms..." 
                          value={symptomSearchQuery} 
                          onChange={e => setSymptomSearchQuery(e.target.value)} 
                          onClick={e => e.stopPropagation()} 
                          onKeyDown={e => {
                            if (e.key === 'Enter' && symptomSearchQuery.trim()) {
                              toggleSymptom(symptomSearchQuery.trim());
                              setSymptomSearchQuery('');
                              setSymptomDropdownOpen(false);
                            }
                          }}
                          style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: '4px', padding: '4px 8px', fontSize: '11.5px', outline: 'none', background: '#F8FAFC' }} 
                        />
                      </div>
                      {(() => {
                        const filtered = DEFAULT_SYMPTOMS.filter(s => s.toLowerCase().includes(symptomSearchQuery.toLowerCase()));
                        return (
                          <>
                            {filtered.map(s => (
                              <div 
                                key={s} 
                                onClick={() => { toggleSymptom(s); setSymptomDropdownOpen(false); }} 
                                style={{ padding: '6px 12px', fontSize: '11.5px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', fontWeight: 600, color: '#334155' }}
                                onMouseEnter={e => e.target.style.background = '#F8FAFC'}
                                onMouseLeave={e => e.target.style.background = 'white'}
                              >
                                {s}
                              </div>
                            ))}
                            {filtered.length === 0 && symptomSearchQuery.trim() !== '' && (
                              <div 
                                onClick={() => { toggleSymptom(symptomSearchQuery.trim()); setSymptomSearchQuery(''); setSymptomDropdownOpen(false); }}
                                style={{ padding: '6px 12px', fontSize: '11.5px', cursor: 'pointer', color: '#2563EB', fontWeight: 600 }}
                              >
                                + Add "{symptomSearchQuery}"
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}

              {renderField("Doctor", (
                <select 
                  className="impressive-select" 
                  style={selectStyle} 
                  value={formData.doctorId} 
                  onChange={e => { setFormData({...formData, doctorId: e.target.value}); setSelectedSlot(''); }}
                >
                  <option value="">-- Choose Doctor --</option>
                  {doctors.map(doc => (
                    <option key={doc._id} value={doc._id}>{doc.name} ({doc.specialization || 'Consultant'})</option>
                  ))}
                </select>
              ))}

              {renderField("Date", (
                <input 
                  type="date" 
                  className="impressive-input" 
                  style={inputStyle} 
                  value={bookingDate} 
                  min={getLocalDateString()} 
                  onChange={e => { setBookingDate(e.target.value); setSelectedSlot(''); }} 
                />
              ))}

              {/* Available Slots Row */}
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-start', border: '1px dashed #CBD5E1', borderRadius: '8px', padding: '12px', background: '#F8FAFC', minHeight: '50px' }}>
                <div style={{ width: '100px', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginTop: '6px' }}>Available Slots</div>
                <div style={{ width: '12px', fontSize: '11.5px', color: '#94A3B8', marginTop: '6px' }}>:</div>
                <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(!formData.doctorId || !bookingDate) ? (
                    <span style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px', fontStyle: 'italic' }}>Please select a doctor and date to view slots</span>
                  ) : !doctorAvailability.available ? (
                    <span style={{ fontSize: '12px', color: '#DC2626', fontWeight: 600, marginTop: '4px' }}>Doctor Unavailable ({doctorAvailability.reason || 'Leave'})</span>
                  ) : (
                    (doctorAvailability.slots || DEFAULT_SLOTS).map(time => {
                      const cleanTime = time.split(/\(Limit:/i)[0].trim();
                      const isSelected = selectedSlot === time;
                      return (
                        <div 
                          key={time} 
                          onClick={() => setSelectedSlot(time)} 
                          style={{ 
                            padding: '5px 10px', 
                            borderRadius: '6px', 
                            border: isSelected ? '2px solid #2563EB' : '1px solid #CBD5E1', 
                            fontSize: '11.5px', 
                            fontWeight: 600, 
                            cursor: 'pointer', 
                            background: isSelected ? '#EFF6FF' : 'white', 
                            color: isSelected ? '#1D4ED8' : '#334155',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {cleanTime}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div style={{ height: '1px', background: '#E2E8F0', margin: '4px 0' }}></div>

            {/* Vitals and Consent (Identical to Receptionist) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1fr) minmax(220px, 1fr)', gap: '8px 24px' }}>
              {renderField("Temp (°F)", <input type="number" step="0.1" className="impressive-input" style={inputStyle} value={vitalTemp} onChange={e => setVitalTemp(e.target.value)} placeholder="98.6" />)}
              {renderField("Pulse (bpm)", <input type="number" className="impressive-input" style={inputStyle} value={vitalPulse} onChange={e => setVitalPulse(e.target.value)} placeholder="72" />)}
              {renderField("Weight (kg)", <input type="number" step="0.1" className="impressive-input" style={inputStyle} value={vitalWeight} onChange={e => setVitalWeight(e.target.value)} placeholder="70" />)}
              {renderField("BP Sys", <input type="number" className="impressive-input" style={inputStyle} value={vitalBpSys} onChange={e => setVitalBpSys(e.target.value)} placeholder="120" />)}
              {renderField("BP Dia", <input type="number" className="impressive-input" style={inputStyle} value={vitalBpDia} onChange={e => setVitalBpDia(e.target.value)} placeholder="80" />)}
              {renderField("Height (cm)", <input type="number" className="impressive-input" style={inputStyle} value={vitalHeight} onChange={e => setVitalHeight(e.target.value)} placeholder="175" />)}
              
              <div className="vitals-box" style={{ gridColumn: '1 / -1', display: 'flex', gap: '24px', alignItems: 'center', marginTop: '4px', padding: '10px 16px', borderRadius: '8px', border: '1px solid #FECDD3' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Patient DPDP Consent:</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: '#475569', fontWeight: 600 }}>
                  <input type="checkbox" checked={dpdpConsent.emrCreation} onChange={e => setDpdpConsent({...dpdpConsent, emrCreation: e.target.checked})} style={{ width: '14px', height: '14px', accentColor: '#2563EB' }} /> EMR Records Creation & Health Locker
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: '#475569', fontWeight: 600 }}>
                  <input type="checkbox" checked={dpdpConsent.dataSharing} onChange={e => setDpdpConsent({...dpdpConsent, dataSharing: e.target.checked})} style={{ width: '14px', height: '14px', accentColor: '#2563EB' }} /> Anonymized Research Data Sharing
                </label>
              </div>
            </div>

          </div>

          {/* Action Sidebar (Right) - Identical to Receptionist Sidebar */}
          <div style={{ width: '220px', background: '#F8FAFC', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '1px solid #E2E8F0' }}>
            
            <input 
              type="file" 
              id="patientPhotoUpload" 
              style={{ display: 'none' }} 
              accept="image/*" 
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  const file = e.target.files[0];
                  const reader = new FileReader();
                  reader.onloadend = () => setPatientPhoto(reader.result);
                  reader.readAsDataURL(file);
                }
              }} 
            />
            
            <input 
              type="file" 
              id="patientCameraUpload" 
              style={{ display: 'none' }} 
              accept="image/*" 
              capture="user" 
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  const file = e.target.files[0];
                  const reader = new FileReader();
                  reader.onloadend = () => setPatientPhoto(reader.result);
                  reader.readAsDataURL(file);
                }
              }} 
            />

            <div style={{ width: '100%', height: '160px', borderRadius: '8px', border: '2px dashed #CBD5E1', background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', position: 'relative', overflow: 'hidden' }}>
              {patientPhoto ? (
                <img src={patientPhoto} alt="Patient" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <>
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                    <Camera size={24} color="#94A3B8" />
                  </div>
                  <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>No Image Available</span>
                </>
              )}
            </div>
            
            <button 
              type="button" 
              onClick={() => document.getElementById('patientCameraUpload').click()} 
              style={{ width: '100%', padding: '8px 0', fontSize: '12px', fontWeight: 600, background: 'white', color: '#3B82F6', border: '1px solid #BFDBFE', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }}
            >
              <Camera size={14} /> Capture Photo
            </button>

            <button 
              type="button" 
              onClick={() => document.getElementById('patientPhotoUpload').click()} 
              style={{ width: '100%', padding: '8px 0', fontSize: '12px', fontWeight: 600, background: 'white', color: '#3B82F6', border: '1px solid #BFDBFE', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }}
            >
              <Upload size={14} /> Upload Photo
            </button>
            
            <div style={{ flex: 1 }}></div>

            <button 
              type="button" 
              onClick={() => {
                setFormData({
                  title: '',
                  name: '',
                  age: '',
                  gender: '',
                  contact: initialContact.includes('@') ? '' : initialContact,
                  email: initialContact.includes('@') ? initialContact : '',
                  doctorId: '',
                  bloodGroup: 'O+',
                  address: '',
                  medicalHistory: '',
                  referredBy: '',
                  allergies: 'None',
                  currentMedications: ''
                });
                setSelectedSymptoms([]);
                setSelectedSlot('');
                setPatientPhoto(null);
              }} 
              style={{ width: '100%', padding: '10px 0', fontSize: '12px', fontWeight: 600, background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: '6px', cursor: 'pointer' }}
            >
              Reset Form
            </button>
            
            <button 
              type="button" 
              className="impressive-btn-main" 
              onClick={handleSubmit} 
              disabled={loading} 
              style={{ width: '100%', padding: '14px 0', fontSize: '14px', fontWeight: 900, color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <CheckCircle size={18} /> {loading ? 'Saving Profile...' : 'Complete Registration'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default PatientRegistration;
