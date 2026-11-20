import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../utils/api';
import { socket } from '../utils/socket';
import { 
  Users, Clock, Play, SkipForward, CheckCircle, AlertTriangle, 
  UserCheck, UserPlus, Calendar, Phone, Mail, RefreshCw, X, 
  ArrowRight, Search, Check, ShieldAlert, AlertCircle, Sparkles,
  QrCode, User, Hash, Stethoscope, ChevronRight, Filter
} from 'lucide-react';
import ReceptionQRModal from './ReceptionQRModal';

const ReceptionQueuePanel = ({
  doctors = [],
  appointments = [],
  setAppointments,
  showToast,
  fetchData,
  onProcessIntake
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
  const [searchQuery, setSearchQuery] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);

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

    // Pick pre-selected doctor and date if specified on the reception ticket
    const ticketDocId = ticket.doctorId?._id || ticket.doctorId || '';
    const defaultDocId = ticketDocId || (doctors && doctors.length > 0 ? doctors[0]._id : '');
    const ticketDate = ticket.targetAppointmentDate || '';
    const authoritativeToday = ticketDate || queueData.queueDate || new Date().toISOString().split('T')[0];

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
          setPendingCheckInAppointment(newAppt);
          setIntakeError(`Appointment booked successfully, but doctor check-in failed: ${checkInErr.response?.data?.error || checkInErr.message}. You can retry check-in below without creating a duplicate appointment.`);
        }
      } else {
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

  // Handle manual retry of check-in
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

  // Helper: Waiting duration formatter
  const getWaitDuration = (createdAt) => {
    if (!createdAt) return '';
    const diffMs = Date.now() - new Date(createdAt).getTime();
    const diffMins = Math.max(0, Math.floor(diffMs / 60000));
    if (diffMins < 1) return 'Just arrived';
    if (diffMins < 60) return `${diffMins}m waiting`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m waiting`;
  };

  // Filtered lists for each subtab
  const filteredWaiting = useMemo(() => {
    if (!searchQuery.trim()) return queueData.waitingTickets;
    const q = searchQuery.toLowerCase().trim();
    return queueData.waitingTickets.filter(t => {
      const name = (t.patientType === 'Existing' ? t.existingPatientDetails?.name : t.preliminaryDetails?.name) || '';
      const phone = t.preliminaryDetails?.contact || (t.patientId && typeof t.patientId === 'object' ? t.patientId.contact : '') || '';
      const token = t.ticketDisplay || '';
      return name.toLowerCase().includes(q) || phone.includes(q) || token.toLowerCase().includes(q);
    });
  }, [queueData.waitingTickets, searchQuery]);

  const filteredSkipped = useMemo(() => {
    if (!searchQuery.trim()) return queueData.skippedTickets;
    const q = searchQuery.toLowerCase().trim();
    return queueData.skippedTickets.filter(t => {
      const name = (t.patientType === 'Existing' ? t.existingPatientDetails?.name : t.preliminaryDetails?.name) || '';
      const phone = t.preliminaryDetails?.contact || (t.patientId && typeof t.patientId === 'object' ? t.patientId.contact : '') || '';
      const token = t.ticketDisplay || '';
      return name.toLowerCase().includes(q) || phone.includes(q) || token.toLowerCase().includes(q);
    });
  }, [queueData.skippedTickets, searchQuery]);

  const filteredCompleted = useMemo(() => {
    if (!searchQuery.trim()) return queueData.completedTickets;
    const q = searchQuery.toLowerCase().trim();
    return queueData.completedTickets.filter(t => {
      const name = (t.patientType === 'Existing' ? t.existingPatientDetails?.name : t.preliminaryDetails?.name) || '';
      const token = t.ticketDisplay || '';
      return name.toLowerCase().includes(q) || token.toLowerCase().includes(q);
    });
  }, [queueData.completedTickets, searchQuery]);

  return (
    <div className="w-full flex flex-col gap-4 sm:gap-5 box-border font-sans select-none antialiased">
      
      {/* ── 1. RECEPTION WORKSTATION HEADER ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
                Reception Queue Workstation
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Desk
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
              {queueData.hospital?.name || 'Main OPD Counter'} · Front Desk Intake &amp; Triage
            </p>
          </div>
        </div>

        {/* Header Action Button Cluster */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {/* Refresh Action */}
          <button
            type="button"
            onClick={() => loadQueueData()}
            disabled={actionLoading || loading}
            className="flex-1 sm:flex-none min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 active:scale-98 border border-slate-200 text-xs font-bold text-slate-700 transition cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
            title="Refresh live queue status"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading || actionLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {/* QR Signage Poster Action */}
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="flex-1 sm:flex-none min-h-[42px] px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 active:scale-98 border border-blue-200/80 text-xs font-bold text-blue-700 transition cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
            title="View, Print or Download Reception Check-In QR Signage"
          >
            <QrCode className="w-4 h-4 text-blue-600" />
            <span>Reception QR</span>
          </button>
        </div>
      </div>

      {/* ── DRAINING MODE ALERT (WHEN SUPER ADMIN DISABLED MODULE) ── */}
      {queueData.isDrainingMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-900 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <strong className="block text-sm font-extrabold text-amber-950 mb-0.5">
              Queue Draining Mode Active
            </strong>
            The Reception Queue module is currently disabled by administrator policy. New public patient registrations are paused, but front-desk intake may clear all remaining tickets.
          </div>
        </div>
      )}

      {/* ── 2. METRICS OVERVIEW BAR (STANDARDIZED FLAT KPI CARDS) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3.5">
        
        {/* KPI 1: Waiting Now */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-xs flex flex-col justify-between min-h-[78px] sm:min-h-[86px] transition hover:border-blue-300">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
              Waiting Now
            </span>
            <span className="w-2 h-2 rounded-full bg-teal-500" />
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none">
              {queueData.metrics.waitingCount}
            </div>
            <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
              In Line
            </span>
          </div>
        </div>

        {/* KPI 2: Desk Status */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-xs flex flex-col justify-between min-h-[78px] sm:min-h-[86px] transition hover:border-blue-300">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
              Desk Status
            </span>
            <span className={`w-2 h-2 rounded-full ${queueData.currentServing ? 'bg-blue-600 animate-pulse' : 'bg-slate-300'}`} />
          </div>
          <div className="flex items-baseline justify-between mt-1 min-w-0">
            <div className={`text-base sm:text-xl font-black tracking-tight leading-none truncate ${queueData.currentServing ? 'text-blue-700' : 'text-slate-500'}`}>
              {queueData.currentServing ? queueData.currentServing.ticketDisplay : 'Desk Free'}
            </div>
            <span className={`text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${queueData.currentServing ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              {queueData.currentServing ? 'Active' : 'Idle'}
            </span>
          </div>
        </div>

        {/* KPI 3: Skipped */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-xs flex flex-col justify-between min-h-[78px] sm:min-h-[86px] transition hover:border-blue-300">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
              Skipped
            </span>
            <span className="w-2 h-2 rounded-full bg-amber-400" />
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none">
              {queueData.metrics.skippedCount}
            </div>
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
              Recoverable
            </span>
          </div>
        </div>

        {/* KPI 4: Completed Today */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-xs flex flex-col justify-between min-h-[78px] sm:min-h-[86px] transition hover:border-blue-300">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
              Completed Today
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none">
              {queueData.metrics.completedCount}
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
              Processed
            </span>
          </div>
        </div>

      </div>

      {/* ── 3. NOW SERVING HERO CALLOUT ── */}
      <div className={`rounded-2xl border p-4 sm:p-5 shadow-xs transition-all ${
        queueData.currentServing 
          ? 'bg-gradient-to-r from-teal-50/70 via-white to-blue-50/60 border-teal-300/90' 
          : 'bg-white border-slate-200/90'
      }`}>
        
        {queueData.currentServing ? (
          /* ACTIVE SERVING PATIENT */
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            {/* Left: Token & Patient Info */}
            <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
              {/* Token Pill */}
              <div className="flex flex-col items-center justify-center px-3.5 py-2 rounded-xl bg-teal-600 text-white shadow-xs shrink-0">
                <span className="text-[9px] font-extrabold uppercase tracking-wider opacity-80 leading-none">TOKEN</span>
                <span className="text-xl sm:text-2xl font-black font-mono leading-tight">
                  {queueData.currentServing.ticketDisplay}
                </span>
              </div>

              {/* Patient Details */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">
                    {(queueData.currentServing.patientType === 'Existing'
                      ? queueData.currentServing.existingPatientDetails?.name
                      : queueData.currentServing.preliminaryDetails?.name) || 'Patient'}
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-100/80 text-teal-800">
                    {queueData.currentServing.patientType === 'Existing' ? 'Existing Patient' : 'Walk-in Registration'}
                  </span>
                </div>

                {/* Subtitle Details */}
                <div className="flex items-center gap-3 text-xs text-slate-500 font-medium mt-1 flex-wrap">
                  {queueData.currentServing.preliminaryDetails?.contact && (
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Phone className="w-3 h-3 text-slate-400" />
                      {queueData.currentServing.preliminaryDetails.contact}
                    </span>
                  )}
                  {queueData.currentServing.preliminaryDetails?.gender && (
                    <span>{queueData.currentServing.preliminaryDetails.gender}</span>
                  )}
                  {queueData.currentServing.preliminaryDetails?.age && (
                    <span>{queueData.currentServing.preliminaryDetails.age} Yrs</span>
                  )}
                  <span className="text-slate-400">·</span>
                  <span className="inline-flex items-center gap-1 text-slate-600 font-semibold">
                    <Clock className="w-3 h-3 text-slate-400" />
                    Arrived {new Date(queueData.currentServing.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
              {/* Process Intake */}
              <button
                type="button"
                onClick={() => {
                  if (onProcessIntake) {
                    onProcessIntake(queueData.currentServing);
                  } else {
                    openIntakeModal(queueData.currentServing);
                  }
                }}
                className="flex-1 sm:flex-none min-h-[44px] px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-bold text-xs transition cursor-pointer shadow-xs flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Process Intake</span>
              </button>

              {/* Skip */}
              <button
                type="button"
                onClick={() => handleSkip(queueData.currentServing._id)}
                disabled={actionLoading}
                className="flex-1 sm:flex-none min-h-[44px] px-3.5 py-2.5 rounded-xl bg-white hover:bg-amber-50 active:scale-98 border border-amber-300 text-amber-800 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                title="Mark this patient as skipped and advance queue"
              >
                <SkipForward className="w-4 h-4 text-amber-600" />
                <span>Skip</span>
              </button>

              {/* Next Patient */}
              <button
                type="button"
                onClick={handleNext}
                disabled={actionLoading}
                className="flex-1 sm:flex-none min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-98 text-white font-bold text-xs transition cursor-pointer shadow-xs flex items-center justify-center gap-2"
                title="Complete current patient and call next ticket"
              >
                <span>Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        ) : (
          /* IDLE / DESK FREE (COMPACT STREAMLINED LAYOUT) */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                  Reception Counter is Free
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {queueData.metrics.waitingCount > 0 
                    ? `${queueData.metrics.waitingCount} patient(s) waiting in queue. Call the next patient to begin intake.`
                    : 'No patients waiting in queue right now. Ready for walk-in arrivals.'}
                </p>
              </div>
            </div>

            {queueData.metrics.waitingCount > 0 && (
              <button
                type="button"
                onClick={handleNext}
                disabled={actionLoading}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-extrabold text-xs transition cursor-pointer shadow-xs flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Call Next Patient ({queueData.waitingTickets[0]?.ticketDisplay})</span>
              </button>
            )}
          </div>
        )}

      </div>

      {/* ── 4. QUEUE TABS & FILTER WORKSTATION ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col gap-4">
        
        {/* Controls Bar: Sub-tabs + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          
          {/* Segmented Pill Tabs */}
          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80 self-start sm:self-auto overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setActiveSubTab('waiting')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeSubTab === 'waiting'
                  ? 'bg-white text-teal-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Waiting Queue</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeSubTab === 'waiting' ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {queueData.waitingTickets.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('skipped')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeSubTab === 'skipped'
                  ? 'bg-white text-amber-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <SkipForward className="w-3.5 h-3.5" />
              <span>Skipped</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeSubTab === 'skipped' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {queueData.skippedTickets.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('completed')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeSubTab === 'completed'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Completed Today</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeSubTab === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {queueData.completedTickets.length}
              </span>
            </button>
          </div>

          {/* Quick Filter Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter by token, name, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
          </div>

        </div>

        {/* ── 5. SUBTAB LISTS ── */}

        {/* SUBTAB 1: WAITING QUEUE LIST */}
        {activeSubTab === 'waiting' && (
          <div>
            {filteredWaiting.length === 0 ? (
              <div className="text-center py-10 px-4 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-700">No Waiting Patients in Queue</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  {searchQuery 
                    ? `No waiting tickets match "${searchQuery}". Clear your search query to see all tickets.`
                    : 'Patients arriving at front desk or scanning the check-in QR code will appear here automatically.'}
                </p>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition cursor-pointer"
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredWaiting.map((t, idx) => {
                  const pName = t.patientType === 'Existing' ? t.existingPatientDetails?.name : t.preliminaryDetails?.name;
                  const pContact = t.preliminaryDetails?.contact || (t.patientId && typeof t.patientId === 'object' ? t.patientId.contact : 'N/A');
                  const arrivalTime = new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const waitLabel = getWaitDuration(t.createdAt);
                  const isFirstInQueue = idx === 0;

                  return (
                    <div
                      key={t._id}
                      className={`p-3.5 sm:p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isFirstInQueue 
                          ? 'bg-teal-50/40 border-teal-200/90 shadow-2xs' 
                          : 'bg-white hover:bg-slate-50/80 border-slate-200/80'
                      }`}
                    >
                      {/* Left: Token, Patient Info & Metadata */}
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        {/* Token Badge */}
                        <div className={`px-2.5 py-1.5 rounded-lg font-mono font-black text-sm text-center shrink-0 border ${
                          isFirstInQueue 
                            ? 'bg-teal-600 text-white border-teal-700' 
                            : 'bg-slate-100 text-slate-800 border-slate-200'
                        }`}>
                          {t.ticketDisplay}
                        </div>

                        {/* Patient Text */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-extrabold text-slate-900 tracking-tight truncate">
                              {pName || 'Patient'}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              t.patientType === 'Existing'
                                ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {t.patientType}
                            </span>
                            {isFirstInQueue && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-100 text-teal-800">
                                Next Up
                              </span>
                            )}
                          </div>

                          {/* Metadata inline */}
                          <div className="flex items-center gap-2.5 text-xs text-slate-500 mt-1 flex-wrap font-medium">
                            {pContact && pContact !== 'N/A' && (
                              <span className="inline-flex items-center gap-1 font-mono">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {pContact}
                              </span>
                            )}
                            <span className="text-slate-300">·</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {arrivalTime}
                            </span>
                            {waitLabel && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span className="text-slate-600 font-semibold">{waitLabel}</span>
                              </>
                            )}
                            {t.doctorId?.name && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span className="inline-flex items-center gap-1 text-blue-600 font-semibold">
                                  <Stethoscope className="w-3 h-3" />
                                  Dr. {t.doctorId.name}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 self-stretch sm:self-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            if (onProcessIntake) {
                              onProcessIntake(t);
                            } else {
                              openIntakeModal(t);
                            }
                          }}
                          className="flex-1 sm:flex-none min-h-[42px] px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-bold text-xs transition cursor-pointer shadow-2xs flex items-center justify-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Process Intake</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSkip(t._id)}
                          disabled={actionLoading}
                          className="min-h-[42px] px-3 py-2 rounded-xl bg-white hover:bg-slate-100 active:scale-98 border border-slate-200 text-slate-600 hover:text-slate-900 font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1"
                          title="Skip ticket"
                        >
                          <SkipForward className="w-3.5 h-3.5 text-slate-400" />
                          <span>Skip</span>
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 2: SKIPPED TICKETS LIST */}
        {activeSubTab === 'skipped' && (
          <div>
            {filteredSkipped.length === 0 ? (
              <div className="text-center py-10 px-4 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                <SkipForward className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-700">No Skipped Tickets</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Tickets skipped from the counter appear here and can be referenced for recall or queue triage.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSkipped.map((t) => {
                  const pName = t.patientType === 'Existing' ? t.existingPatientDetails?.name : t.preliminaryDetails?.name;
                  const pContact = t.preliminaryDetails?.contact || (t.patientId && typeof t.patientId === 'object' ? t.patientId.contact : 'N/A');

                  return (
                    <div
                      key={t._id}
                      className="p-3.5 rounded-xl border border-amber-200/80 bg-amber-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-900 font-mono font-black text-sm border border-amber-200">
                          {t.ticketDisplay}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 truncate">
                              {pName || 'Patient'}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100/80 text-amber-800">
                              Skipped
                            </span>
                          </div>
                          <div className="text-xs text-amber-800/80 font-medium mt-0.5 flex items-center gap-2">
                            <span>Phone: <strong>{pContact}</strong></span>
                            <span>·</span>
                            <span>Skipped at: {t.skippedAt ? new Date(t.skippedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-800 text-xs font-semibold self-start sm:self-auto">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Retained for Recall</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 3: COMPLETED TICKETS LIST */}
        {activeSubTab === 'completed' && (
          <div>
            {filteredCompleted.length === 0 ? (
              <div className="text-center py-10 px-4 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                <CheckCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-700">No Completed Tickets Yet Today</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Patients who finish their intake and check into consultation will be recorded here.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredCompleted.map((t) => {
                  const pName = t.patientType === 'Existing' ? t.existingPatientDetails?.name : t.preliminaryDetails?.name;

                  return (
                    <div
                      key={t._id}
                      className="p-3 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 transition flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                          {t.ticketDisplay}
                        </span>
                        <span className="text-xs font-bold text-slate-800 truncate">
                          {pName || 'Patient'}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 hidden sm:inline-block">
                          Completed
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono shrink-0">
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

      {/* ── 6. RECEPTION QR SIGNAGE MODAL (PHASE 5) ── */}
      <ReceptionQRModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        clinicCode={queueData.hospital?.code || localStorage.getItem('tenantId')}
        clinicName={queueData.hospital?.name || 'Front Desk Reception'}
      />

      {/* ── 7. FALLBACK INTAKE & APPOINTMENT MODAL (IF NOT HANDLED VIA FULL WORKSTATION) ── */}
      {!onProcessIntake && selectedTicketForIntake && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 sm:p-7 shadow-2xl border border-slate-100 flex flex-col gap-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  Reception Intake &amp; Triage
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ticket: <strong className="text-teal-700">{selectedTicketForIntake.ticketDisplay}</strong> ({selectedTicketForIntake.patientType})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicketForIntake(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Banner */}
            {intakeError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{intakeError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmitIntake} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Patient Full Name *</label>
                  <input
                    type="text"
                    required
                    value={intakeFormData.name}
                    onChange={(e) => setIntakeFormData({ ...intakeFormData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="e.g. Rahul Sharma"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Number (10 Digits) *</label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={intakeFormData.contact}
                    onChange={(e) => setIntakeFormData({ ...intakeFormData, contact: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="9876543210"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
                  <select
                    value={intakeFormData.gender}
                    onChange={(e) => setIntakeFormData({ ...intakeFormData, gender: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Age (Years)</label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={intakeFormData.age}
                    onChange={(e) => setIntakeFormData({ ...intakeFormData, age: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none"
                    placeholder="e.g. 32"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assign Doctor *</label>
                <select
                  required
                  value={intakeFormData.doctorId}
                  onChange={(e) => setIntakeFormData({ ...intakeFormData, doctorId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none"
                >
                  <option value="">-- Choose Consulting Doctor --</option>
                  {doctors.map(d => (
                    <option key={d._id} value={d._id}>
                      Dr. {d.name} ({d.specialty || d.department || 'General'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={intakeFormData.date}
                    onChange={(e) => setIntakeFormData({ ...intakeFormData, date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Consultation Time</label>
                  <input
                    type="text"
                    value={intakeFormData.time}
                    onChange={(e) => setIntakeFormData({ ...intakeFormData, time: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none"
                    placeholder="10:00 AM"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedTicketForIntake(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={intakeSubmitting}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white text-xs font-bold transition cursor-pointer shadow-xs min-h-[42px] flex items-center gap-2"
                >
                  {intakeSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Confirm &amp; Check In</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default ReceptionQueuePanel;
