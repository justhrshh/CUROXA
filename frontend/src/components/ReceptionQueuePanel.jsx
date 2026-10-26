import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../utils/api';
import { socket } from '../utils/socket';
import { 
  Users, Clock, Play, SkipForward, CheckCircle, AlertTriangle, 
  UserCheck, UserPlus, Calendar, Phone, Mail, RefreshCw, X, 
  ArrowRight, Search, Check, ShieldAlert, AlertCircle, Sparkles
} from 'lucide-react';

const ReceptionQueuePanel = ({
  doctors = [],
  appointments = [],
  setAppointments,
  showToast,
  fetchData
}) => {
  const [queueData, setQueueData] = useState({
    queueDate: '',
    currentServing: null,
    waitingTickets: [],
    skippedTickets: [],
    completedTickets: [],
    metrics: { waitingCount: 0, servingCount: 0, skippedCount: 0, completedCount: 0, totalToday: 0 },
    isDrainingMode: false,
    hospital: { name: 'Clinic', code: '' }
  });

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('waiting'); // 'waiting' | 'skipped' | 'completed'

  // Intake / Appointment Booking Modal State
  const [selectedTicketForIntake, setSelectedTicketForIntake] = useState(null);
  const [intakeFormData, setIntakeFormData] = useState({
    // Patient details
    name: '',
    contact: '',
    gender: 'Male',
    age: '',
    dob: '',
    email: '',
    // Appointment details
    doctorId: '',
    date: new Date().toISOString().split('T')[0],
    time: '10:00 AM',
    reason: 'General Consultation'
  });
  const [intakeStep, setIntakeStep] = useState('verify'); // 'verify' | 'booking'
  const [intakeSubmitting, setIntakeSubmitting] = useState(false);
  const [intakeError, setIntakeError] = useState('');
  const [createdPatientId, setCreatedPatientId] = useState(null);
  const [pendingCheckInAppointment, setPendingCheckInAppointment] = useState(null);
  const [retryCheckInSubmitting, setRetryCheckInSubmitting] = useState(false);

  // 1. Fetch Staff Reception Queue Data
  const loadQueueData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await api.get('/reception-queue/staff/queue');
      setQueueData(res.data);
    } catch (err) {
      console.warn('[RECEPTION QUEUE FETCH WARNING]:', err.message);
      if (!isSilent && showToast) {
        showToast(err.response?.data?.error || 'Failed to load reception queue.', 'error');
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadQueueData();

    // Listen for real-time queue changes from Socket.io
    const handleQueueUpdated = () => {
      loadQueueData(true);
    };

    if (socket) {
      socket.on('reception_queue_updated', handleQueueUpdated);
      socket.on('staff_reception_queue_updated', handleQueueUpdated);
    }

    // Polling fallback every 10 seconds
    const interval = setInterval(() => {
      loadQueueData(true);
    }, 10000);

    return () => {
      if (socket) {
        socket.off('reception_queue_updated', handleQueueUpdated);
        socket.off('staff_reception_queue_updated', handleQueueUpdated);
      }
      clearInterval(interval);
    };
  }, [loadQueueData]);

  // 2. Action: Next Button (Advances Queue Atomically)
  const handleNext = async () => {
    setActionLoading(true);
    try {
      const currentTicketId = queueData.currentServing?._id || null;
      const res = await api.post('/reception-queue/staff/next', {
        currentTicketId
      });

      if (res.data?.advanceResult) {
        const { completedTicket, nowServingTicket } = res.data.advanceResult;
        if (completedTicket && nowServingTicket) {
          showToast(`Completed ${completedTicket.ticketDisplay}. Now serving ${nowServingTicket.ticketDisplay} (${nowServingTicket.patientType === 'Existing' ? nowServingTicket.existingPatientDetails?.name : nowServingTicket.preliminaryDetails?.name}).`, 'success');
        } else if (nowServingTicket) {
          showToast(`Now serving ${nowServingTicket.ticketDisplay} (${nowServingTicket.patientType === 'Existing' ? nowServingTicket.existingPatientDetails?.name : nowServingTicket.preliminaryDetails?.name}).`, 'success');
        } else if (completedTicket) {
          showToast(`Completed ${completedTicket.ticketDisplay}. No more waiting patients in queue.`, 'info');
        } else {
          showToast('Queue is currently idle. No waiting patients.', 'info');
        }
      }

      await loadQueueData(true);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to advance queue.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Action: Skip Button
  const handleSkip = async (ticketIdToSkip = null) => {
    setActionLoading(true);
    try {
      const targetId = ticketIdToSkip || queueData.currentServing?._id;
      if (!targetId) {
        showToast('No active ticket to skip.', 'warning');
        return;
      }

      const res = await api.post('/reception-queue/staff/skip', {
        ticketId: targetId
      });

      const { skippedTicket, nowServingTicket } = res.data?.skipResult || {};
      if (skippedTicket) {
        showToast(`Skipped ${skippedTicket.ticketDisplay}. Ticket retained in Skipped tab.`, 'warning');
      }
      if (nowServingTicket) {
        showToast(`Now serving ${nowServingTicket.ticketDisplay}.`, 'info');
      }

      await loadQueueData(true);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to skip ticket.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // 4. Open Desk Intake & Appointment Booking Modal
  const openIntakeModal = (ticket) => {
    setSelectedTicketForIntake(ticket);
    setIntakeError('');
    setIntakeStep('verify');
    setPendingCheckInAppointment(null);

    const isExisting = ticket.patientType === 'Existing';
    const patientObj = isExisting ? ticket.existingPatientDetails : ticket.preliminaryDetails;
    const existingPid = ticket.patientId?._id || ticket.patientId || null;
    setCreatedPatientId(existingPid);

    // Pick a default doctor if available
    const defaultDocId = doctors && doctors.length > 0 ? doctors[0]._id : '';
    const authoritativeToday = queueData.queueDate || new Date().toISOString().split('T')[0];

    setIntakeFormData({
      title: patientObj?.title || '',
      name: patientObj?.name || '',
      contact: patientObj?.contact || (ticket.patientId && typeof ticket.patientId === 'object' ? ticket.patientId.contact : ''),
      gender: patientObj?.gender || 'Male',
      age: patientObj?.age ? String(patientObj.age) : '',
      dob: patientObj?.dob || '',
      email: patientObj?.email || '',
      bloodGroup: patientObj?.bloodGroup || '',
      address: patientObj?.address || '',
      allergies: patientObj?.allergies || 'None',
      doctorId: defaultDocId,
      date: authoritativeToday,
      time: '10:00 AM',
      reason: 'General Consultation'
    });
  };

  // 5. Submit Desk Intake: Register (if new) -> Book Appointment -> Auto Check-In (if today) -> Complete Ticket
  const handleSubmitIntake = async (e) => {
    if (e) e.preventDefault();
    if (!selectedTicketForIntake) return;

    setIntakeError('');
    setIntakeSubmitting(true);

    try {
      let resolvedPatientId = createdPatientId || selectedTicketForIntake.patientId?._id || selectedTicketForIntake.patientId || null;

      // ── STEP A: Patient Resolution / Permanent Registration ──
      if (!resolvedPatientId) {
        // New patient: register through established /patients endpoint
        const cleanContact = intakeFormData.contact.replace(/\D/g, '');
        if (!cleanContact || cleanContact.length < 10) {
          throw new Error('A valid 10-digit mobile number is required for patient registration.');
        }

        const patientPayload = {
          title: intakeFormData.title || undefined,
          name: intakeFormData.name.trim(),
          contact: cleanContact,
          gender: intakeFormData.gender,
          age: intakeFormData.age ? parseInt(intakeFormData.age, 10) : undefined,
          dob: intakeFormData.dob || undefined,
          email: intakeFormData.email?.trim() || undefined,
          bloodGroup: intakeFormData.bloodGroup || undefined,
          address: intakeFormData.address?.trim() || undefined,
          allergies: intakeFormData.allergies || undefined
        };

        const patientRes = await api.post('/patients', patientPayload);
        resolvedPatientId = patientRes.data?._id;
        if (!resolvedPatientId) {
          throw new Error('Patient registration returned unexpected response.');
        }
        // Remember created patient ID so retries never recreate the patient
        setCreatedPatientId(resolvedPatientId);
      }

      // ── STEP B: Appointment Booking ──
      let newAppt = pendingCheckInAppointment;
      if (!newAppt) {
        if (!intakeFormData.doctorId) {
          throw new Error('Please select a consulting doctor.');
        }
        if (!intakeFormData.date) {
          throw new Error('Please select an appointment date.');
        }

        const appointmentRes = await api.post('/appointments', {
          patientId: resolvedPatientId,
          doctorId: intakeFormData.doctorId,
          date: intakeFormData.date,
          time: intakeFormData.time || '10:00 AM',
          reason: intakeFormData.reason || 'General Consultation'
        });

        newAppt = appointmentRes.data;
        if (!newAppt || !newAppt._id) {
          throw new Error('Failed to create appointment record.');
        }
      }

      // ── STEP C: Same-Day Automatic Check-In ──
      // Authoritative comparison with clinic queue date
      const apptDateStr = intakeFormData.date;
      const clinicTodayStr = queueData.queueDate || new Date().toISOString().split('T')[0];
      const isToday = (apptDateStr === clinicTodayStr);

      if (isToday) {
        try {
          const checkInRes = await api.post(`/appointments/${newAppt._id}/check-in`);
          const checkInResult = checkInRes.data;

          // ── STEP D: Complete Reception Queue Ticket ──
          await api.post(`/reception-queue/staff/complete/${selectedTicketForIntake._id}`, {
            patientId: resolvedPatientId
          });

          const tokenNum = checkInResult.token?.tokenNumber || checkInResult.appointment?.tokenNumber || 'Assigned';
          const docName = doctors.find(d => d._id === intakeFormData.doctorId)?.name || 'Doctor';
          showToast(`Success! ${intakeFormData.name} checked in with Dr. ${docName}. Consultation Token #${tokenNum}.`, 'success');

          if (fetchData) fetchData();
          await loadQueueData(true);
          setSelectedTicketForIntake(null);
          setPendingCheckInAppointment(null);
          setCreatedPatientId(null);
        } catch (checkInErr) {
          console.warn('[AUTO CHECK-IN WARNING]:', checkInErr.message);
          // Preserve appointment and expose recoverable error state without closing modal
          setPendingCheckInAppointment(newAppt);
          setIntakeError(`Appointment booked successfully, but doctor check-in failed: ${checkInErr.response?.data?.error || checkInErr.message}. You can retry check-in below without creating a duplicate appointment.`);
        }
      } else {
        // Future dated appointment: leave scheduled without check-in
        await api.post(`/reception-queue/staff/complete/${selectedTicketForIntake._id}`, {
          patientId: resolvedPatientId
        });
        showToast(`Appointment scheduled for ${apptDateStr}. Check-in will open on the scheduled date.`, 'success');

        if (fetchData) fetchData();
        await loadQueueData(true);
        setSelectedTicketForIntake(null);
        setPendingCheckInAppointment(null);
        setCreatedPatientId(null);
      }
    } catch (err) {
      console.error('[INTAKE ERROR]:', err);
      setIntakeError(err.response?.data?.error || err.message || 'Intake processing failed.');
    } finally {
      setIntakeSubmitting(false);
    }
  };

  // Handle manual retry of check-in on existing appointment
  const handleRetryCheckIn = async () => {
    if (!pendingCheckInAppointment || !selectedTicketForIntake) return;
    setRetryCheckInSubmitting(true);
    setIntakeError('');

    try {
      const checkInRes = await api.post(`/appointments/${pendingCheckInAppointment._id}/check-in`);
      const checkInResult = checkInRes.data;

      const resolvedPatientId = createdPatientId || selectedTicketForIntake.patientId?._id || selectedTicketForIntake.patientId;
      await api.post(`/reception-queue/staff/complete/${selectedTicketForIntake._id}`, {
        patientId: resolvedPatientId
      });

      const tokenNum = checkInResult.token?.tokenNumber || checkInResult.appointment?.tokenNumber || 'Assigned';
      const docName = doctors.find(d => d._id === intakeFormData.doctorId)?.name || 'Doctor';
      showToast(`Success! ${intakeFormData.name} checked in with Dr. ${docName}. Consultation Token #${tokenNum}.`, 'success');

      if (fetchData) fetchData();
      await loadQueueData(true);
      setSelectedTicketForIntake(null);
      setPendingCheckInAppointment(null);
      setCreatedPatientId(null);
    } catch (err) {
      console.error('[RETRY CHECK-IN ERROR]:', err);
      setIntakeError(`Check-in retry failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setRetryCheckInSubmitting(false);
    }
  };

  // Complete desk ticket without check-in (e.g. if doctor is delayed or receptionist chooses to defer check-in)
  const handleCompleteWithoutCheckIn = async () => {
    if (!selectedTicketForIntake) return;
    try {
      const resolvedPatientId = createdPatientId || selectedTicketForIntake.patientId?._id || selectedTicketForIntake.patientId;
      await api.post(`/reception-queue/staff/complete/${selectedTicketForIntake._id}`, {
        patientId: resolvedPatientId
      });
      showToast('Reception desk intake completed. Appointment scheduled without check-in.', 'info');

      if (fetchData) fetchData();
      await loadQueueData(true);
      setSelectedTicketForIntake(null);
      setPendingCheckInAppointment(null);
      setCreatedPatientId(null);
    } catch (err) {
      setIntakeError(`Failed to complete ticket: ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      {/* ── DRAINING MODE ALERT (WHEN SUPER ADMIN DISABLED MODULE) ── */}
      {queueData.isDrainingMode && (
        <div style={{
          background: '#FFFBEB',
          border: '1.5px solid #FDE68A',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxSizing: 'border-box'
        }}>
          <AlertTriangle size={22} color="#D97706" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: '13px', color: '#92400E', lineHeight: 1.4 }}>
            <strong style={{ display: 'block', fontSize: '14px', marginBottom: '2px' }}>
              Queue Draining Mode Active
            </strong>
            The Reception Queue module is currently disabled by Super Admin. New public patient QR registrations are blocked, but you can continue processing and clearing the remaining tickets in this queue.
          </div>
        </div>
      )}

      {/* ── METRICS OVERVIEW BAR ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
        gap: '14px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Metric 1 */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Waiting Now</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#0D9488', marginTop: '2px' }}>
              {queueData.metrics.waitingCount}
            </div>
          </div>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#CCFBF1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={20} color="#0D9488" />
          </div>
        </div>

        {/* Metric 2 */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Desk Status</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: queueData.currentServing ? '#0F172A' : '#64748B', marginTop: '4px' }}>
              {queueData.currentServing ? queueData.currentServing.ticketDisplay : 'Desk Free'}
            </div>
          </div>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: queueData.currentServing ? '#EFF6FF' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Play size={18} color={queueData.currentServing ? '#2563EB' : '#94A3B8'} />
          </div>
        </div>

        {/* Metric 3 */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Skipped</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#F59E0B', marginTop: '2px' }}>
              {queueData.metrics.skippedCount}
            </div>
          </div>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SkipForward size={18} color="#D97706" />
          </div>
        </div>

        {/* Metric 4 */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Completed Today</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#16A34A', marginTop: '2px' }}>
              {queueData.metrics.completedCount}
            </div>
          </div>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={20} color="#16A34A" />
          </div>
        </div>
      </div>

      {/* ── HERO SECTION: CURRENTLY SERVING PATIENT CARD ── */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1.5px solid #0D9488',
        padding: '24px',
        boxSizing: 'border-box',
        boxShadow: '0 4px 12px rgba(13, 148, 136, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#0D9488', boxShadow: '0 0 0 3px #CCFBF1' }} />
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Now Serving at Reception Counter
            </h3>
          </div>

          <button
            type="button"
            onClick={() => loadQueueData()}
            disabled={actionLoading}
            style={{
              background: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#475569',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={13} className={actionLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {queueData.currentServing ? (
          // Serving ticket active
          <div style={{
            background: '#F0FDFA',
            border: '1px solid #99F6E4',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <div style={{
                background: '#0D9488',
                color: '#FFFFFF',
                borderRadius: '12px',
                padding: '12px 18px',
                textAlign: 'center',
                boxShadow: '0 4px 10px rgba(13, 148, 136, 0.25)'
              }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.85 }}>Ticket</div>
                <div style={{ fontSize: '26px', fontWeight: 900, lineHeight: 1.1 }}>{queueData.currentServing.ticketDisplay}</div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h4 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    {queueData.currentServing.patientType === 'Existing'
                      ? (queueData.currentServing.existingPatientDetails?.name || 'Existing Patient')
                      : (queueData.currentServing.preliminaryDetails?.name || 'New Patient')}
                  </h4>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: queueData.currentServing.patientType === 'Existing' ? '#DCFCE7' : '#EFF6FF',
                    color: queueData.currentServing.patientType === 'Existing' ? '#166534' : '#1D4ED8'
                  }}>
                    {queueData.currentServing.patientType === 'Existing' ? 'Existing Patient' : 'New Patient (Preliminary)'}
                  </span>
                </div>

                <div style={{ fontSize: '12.5px', color: '#64748B', display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
                  {queueData.currentServing.preliminaryDetails?.contact && (
                    <span>Phone: <strong>{queueData.currentServing.preliminaryDetails.contact}</strong></span>
                  )}
                  {queueData.currentServing.preliminaryDetails?.gender && (
                    <span>Gender: <strong>{queueData.currentServing.preliminaryDetails.gender}</strong></span>
                  )}
                  {queueData.currentServing.preliminaryDetails?.age && (
                    <span>Age: <strong>{queueData.currentServing.preliminaryDetails.age} yrs</strong></span>
                  )}
                  <span>Arrived: <strong>{new Date(queueData.currentServing.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span>
                </div>
              </div>
            </div>

            {/* Actions for current serving */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <button
                type="button"
                onClick={() => openIntakeModal(queueData.currentServing)}
                style={{
                  background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 3px 8px rgba(13, 148, 136, 0.25)'
                }}
              >
                <Sparkles size={16} />
                Process & Book Appointment
              </button>

              <button
                type="button"
                onClick={() => handleSkip(queueData.currentServing._id)}
                disabled={actionLoading}
                style={{
                  background: '#FFFFFF',
                  color: '#D97706',
                  border: '1px solid #FDE68A',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                title="Mark this patient as skipped and advance queue"
              >
                <SkipForward size={15} />
                Skip Patient
              </button>

              <button
                type="button"
                onClick={handleNext}
                disabled={actionLoading}
                style={{
                  background: '#0F172A',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Complete current patient and call next waiting ticket"
              >
                Next Patient
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        ) : (
          // Idle state (desk is free)
          <div style={{
            background: '#F8FAFC',
            border: '1.5px dashed #CBD5E1',
            borderRadius: '12px',
            padding: '30px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#CCFBF1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={24} color="#0D9488" />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                Reception Counter is Free
              </div>
              <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>
                {queueData.metrics.waitingCount > 0 
                  ? `${queueData.metrics.waitingCount} patient(s) waiting in queue. Click Call Next Patient to begin.`
                  : 'No patients currently waiting in reception queue.'}
              </div>
            </div>

            {queueData.metrics.waitingCount > 0 && (
              <button
                type="button"
                onClick={handleNext}
                disabled={actionLoading}
                style={{
                  background: '#0D9488',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 3px 8px rgba(13, 148, 136, 0.25)'
                }}
              >
                <Play size={16} />
                Call Next Patient ({queueData.waitingTickets[0]?.ticketDisplay})
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── QUEUE TABS (WAITING | SKIPPED | COMPLETED) ── */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        boxSizing: 'border-box'
      }}>
        {/* Tab Selector */}
        <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveSubTab('waiting')}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'none',
              borderBottom: activeSubTab === 'waiting' ? '2.5px solid #0D9488' : '2.5px solid transparent',
              color: activeSubTab === 'waiting' ? '#0D9488' : '#64748B',
              fontSize: '13.5px',
              fontWeight: activeSubTab === 'waiting' ? 700 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            Waiting Queue ({queueData.waitingTickets.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('skipped')}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'none',
              borderBottom: activeSubTab === 'skipped' ? '2.5px solid #D97706' : '2.5px solid transparent',
              color: activeSubTab === 'skipped' ? '#D97706' : '#64748B',
              fontSize: '13.5px',
              fontWeight: activeSubTab === 'skipped' ? 700 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            Skipped ({queueData.skippedTickets.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('completed')}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'none',
              borderBottom: activeSubTab === 'completed' ? '2.5px solid #16A34A' : '2.5px solid transparent',
              color: activeSubTab === 'completed' ? '#16A34A' : '#64748B',
              fontSize: '13.5px',
              fontWeight: activeSubTab === 'completed' ? 700 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            Completed Today ({queueData.completedTickets.length})
          </button>
        </div>

        {/* ── SUBTAB 1: WAITING QUEUE LIST ── */}
        {activeSubTab === 'waiting' && (
          <div>
            {queueData.waitingTickets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8', fontSize: '13px' }}>
                No patients currently waiting in queue.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {queueData.waitingTickets.map((t, idx) => {
                  const pName = t.patientType === 'Existing' ? t.existingPatientDetails?.name : t.preliminaryDetails?.name;
                  const pContact = t.preliminaryDetails?.contact || (t.patientId && typeof t.patientId === 'object' ? t.patientId.contact : 'N/A');

                  return (
                    <div
                      key={t._id}
                      style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        padding: '14px 18px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: '#E2E8F0',
                          fontSize: '15px',
                          fontWeight: 800,
                          color: '#0F172A'
                        }}>
                          {t.ticketDisplay}
                        </div>

                        <div>
                          <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A' }}>
                            {pName || 'Patient'}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', gap: '10px', marginTop: '2px' }}>
                            <span>Type: <strong>{t.patientType}</strong></span>
                            <span>Phone: <strong>{pContact}</strong></span>
                            <span>Arrived: <strong>{new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => openIntakeModal(t)}
                          style={{
                            padding: '7px 12px',
                            borderRadius: '6px',
                            background: '#0D9488',
                            color: '#FFFFFF',
                            border: 'none',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Process Intake
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSkip(t._id)}
                          style={{
                            padding: '7px 10px',
                            borderRadius: '6px',
                            background: '#FFFFFF',
                            color: '#64748B',
                            border: '1px solid #CBD5E1',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SUBTAB 2: SKIPPED TICKETS ── */}
        {activeSubTab === 'skipped' && (
          <div>
            {queueData.skippedTickets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8', fontSize: '13px' }}>
                No skipped tickets today.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {queueData.skippedTickets.map((t) => {
                  const pName = t.patientType === 'Existing' ? t.existingPatientDetails?.name : t.preliminaryDetails?.name;
                  return (
                    <div
                      key={t._id}
                      style={{
                        background: '#FFFBEB',
                        border: '1px solid #FDE68A',
                        borderRadius: '10px',
                        padding: '14px 18px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span style={{ padding: '6px 12px', borderRadius: '8px', background: '#FEF3C7', color: '#D97706', fontSize: '15px', fontWeight: 800 }}>
                          {t.ticketDisplay}
                        </span>
                        <div>
                          <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A' }}>{pName || 'Patient'}</div>
                          <div style={{ fontSize: '12px', color: '#B45309', display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
                            <span>Status: <strong>Skipped</strong></span>
                            <span>•</span>
                            <span>Skipped at: <strong>{t.skippedAt ? new Date(t.skippedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'}</strong></span>
                          </div>
                        </div>
                      </div>

                      <div style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        background: '#F8FAFC',
                        color: '#64748B',
                        border: '1px solid #E2E8F0',
                        fontSize: '12px',
                        fontWeight: 600,
                        letterSpacing: '0.2px'
                      }}>
                        Recall On Hold (Policy Pending)
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SUBTAB 3: COMPLETED TICKETS ── */}
        {activeSubTab === 'completed' && (
          <div>
            {queueData.completedTickets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8', fontSize: '13px' }}>
                No completed tickets yet today.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {queueData.completedTickets.map((t) => {
                  const pName = t.patientType === 'Existing' ? t.existingPatientDetails?.name : t.preliminaryDetails?.name;
                  return (
                    <div
                      key={t._id}
                      style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748B' }}>{t.ticketDisplay}</span>
                        <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#0F172A' }}>{pName || 'Patient'}</span>
                        <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 700, background: '#DCFCE7', padding: '1px 6px', borderRadius: '4px' }}>Completed</span>
                      </div>
                      <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                        {t.completedAt ? new Date(t.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── DESK INTAKE & APPOINTMENT BOOKING MODAL ── */}
      {selectedTicketForIntake && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '540px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxSizing: 'border-box',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Reception Intake & Appointment
                </h3>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Processing Ticket: <strong style={{ color: '#0D9488' }}>{selectedTicketForIntake.ticketDisplay}</strong> ({selectedTicketForIntake.patientType})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicketForIntake(null)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Error Message if any */}
            {intakeError && (
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12.5px',
                color: '#991B1B',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0 }} />
                <span>{intakeError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitIntake} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Section 1: Patient Identity Details */}
              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UserCheck size={16} color="#0D9488" />
                  Patient Profile Information
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={intakeFormData.name}
                      onChange={(e) => setIntakeFormData({ ...intakeFormData, name: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13.5px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Mobile Number *
                    </label>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      value={intakeFormData.contact}
                      onChange={(e) => setIntakeFormData({ ...intakeFormData, contact: e.target.value.replace(/\D/g, '') })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13.5px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Gender *
                    </label>
                    <select
                      value={intakeFormData.gender}
                      onChange={(e) => setIntakeFormData({ ...intakeFormData, gender: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13.5px', background: '#FFFFFF', boxSizing: 'border-box' }}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Age (Years)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="130"
                      value={intakeFormData.age}
                      onChange={(e) => setIntakeFormData({ ...intakeFormData, age: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13.5px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Appointment Booking Details */}
              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={16} color="#0D9488" />
                  Consultation Appointment
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Consulting Doctor *
                    </label>
                    <select
                      required
                      value={intakeFormData.doctorId}
                      onChange={(e) => setIntakeFormData({ ...intakeFormData, doctorId: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13.5px', background: '#FFFFFF', boxSizing: 'border-box' }}
                    >
                      <option value="">Select Doctor...</option>
                      {doctors.map(d => (
                        <option key={d._id} value={d._id}>
                          Dr. {d.name} ({d.specialty || d.department || 'General Medicine'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={intakeFormData.date}
                      onChange={(e) => setIntakeFormData({ ...intakeFormData, date: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13.5px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Time Slot *
                    </label>
                    <input
                      type="text"
                      required
                      value={intakeFormData.time}
                      onChange={(e) => setIntakeFormData({ ...intakeFormData, time: e.target.value })}
                      placeholder="e.g. 10:30 AM"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13.5px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Reason for Visit
                    </label>
                    <input
                      type="text"
                      value={intakeFormData.reason}
                      onChange={(e) => setIntakeFormData({ ...intakeFormData, reason: e.target.value })}
                      placeholder="e.g. Fever, Consultation"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13.5px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              {/* Informative Auto Check-in Notice */}
              <div style={{
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12px',
                color: '#065F46',
                lineHeight: 1.4
              }}>
                <strong>Automatic Same-Day Check-In:</strong> Because this appointment date is set to today, confirming will automatically check the patient into the doctor's queue and allocate their official consultation token. Future dates remain scheduled until that day.
              </div>

              {/* Modal Actions */}
              {pendingCheckInAppointment ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', width: '100%' }}>
                  <div style={{
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '12.5px',
                    color: '#991B1B',
                    lineHeight: '1.4'
                  }}>
                    <strong>Appointment Record Created:</strong> The appointment has been scheduled in the clinic system, but doctor queue check-in encountered an error. You can retry check-in directly below without creating duplicate appointments or patient records.
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={handleCompleteWithoutCheckIn}
                      style={{
                        padding: '9px 15px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: '#475569',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Complete Without Check-In
                    </button>
                    <button
                      type="button"
                      onClick={handleRetryCheckIn}
                      disabled={retryCheckInSubmitting}
                      style={{
                        padding: '9px 18px',
                        borderRadius: '8px',
                        border: 'none',
                        background: retryCheckInSubmitting ? '#94A3B8' : '#D97706',
                        color: '#FFFFFF',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: retryCheckInSubmitting ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '7px'
                      }}
                    >
                      <RefreshCw size={14} className={retryCheckInSubmitting ? 'animate-spin' : ''} />
                      {retryCheckInSubmitting ? 'Retrying Check-In...' : 'Retry Check-In Now'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedTicketForIntake(null)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      background: '#FFFFFF',
                      color: '#475569',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={intakeSubmitting}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      background: intakeSubmitting ? '#94A3B8' : '#0D9488',
                      color: '#FFFFFF',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      cursor: intakeSubmitting ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {intakeSubmitting ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        Processing Intake...
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        Confirm Booking & Check-In
                      </>
                    )}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceptionQueuePanel;
