import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../utils/api';

const DOCTOR_CARD_THEMES = [
  {
    // Blue / Ocean (Dermatology / General)
    bg: 'radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 35%, #EFF6FF 100%)',
    border: '#BFDBFE',
    borderActive: '#3B82F6',
    accentGrad: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)',
    avatarShadow: '0 4px 10px rgba(37, 99, 235, 0.3)',
    badgeBg: '#EFF6FF',
    badgeColor: '#1D4ED8',
    badgeBorder: '#BFDBFE',
    cardShadow: '0 10px 24px rgba(37, 99, 235, 0.08)',
    waveColor: '#2563EB'
  },
  {
    // Purple / Violet (Neurology)
    bg: 'radial-gradient(circle at 100% 100%, rgba(139, 92, 246, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FAF5FF 35%, #EDE9FE 100%)',
    border: '#DDD6FE',
    borderActive: '#8B5CF6',
    accentGrad: 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 100%)',
    avatarShadow: '0 4px 10px rgba(109, 40, 217, 0.3)',
    badgeBg: '#F5F3FF',
    badgeColor: '#6D28D9',
    badgeBorder: '#DDD6FE',
    cardShadow: '0 10px 24px rgba(109, 40, 217, 0.08)',
    waveColor: '#7C3AED'
  },
  {
    // Teal / Mint (ENT / Respiratory)
    bg: 'radial-gradient(circle at 100% 100%, rgba(20, 184, 166, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F0FDFA 35%, #CCFBF1 100%)',
    border: '#99F6E4',
    borderActive: '#14B8A6',
    accentGrad: 'linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)',
    avatarShadow: '0 4px 10px rgba(15, 118, 110, 0.3)',
    badgeBg: '#F0FDFA',
    badgeColor: '#0F766E',
    badgeBorder: '#99F6E4',
    cardShadow: '0 10px 24px rgba(15, 118, 110, 0.08)',
    waveColor: '#0D9488'
  },
  {
    // Amber / Sunset (Nephrology / Cardiology)
    bg: 'radial-gradient(circle at 100% 100%, rgba(245, 158, 11, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 35%, #FEF3C7 100%)',
    border: '#FDE68A',
    borderActive: '#F59E0B',
    accentGrad: 'linear-gradient(135deg, #B45309 0%, #F59E0B 100%)',
    avatarShadow: '0 4px 10px rgba(217, 119, 6, 0.3)',
    badgeBg: '#FFFBEB',
    badgeColor: '#B45309',
    badgeBorder: '#FDE68A',
    cardShadow: '0 10px 24px rgba(217, 119, 6, 0.08)',
    waveColor: '#D97706'
  },
  {
    // Rose / Coral
    bg: 'radial-gradient(circle at 100% 100%, rgba(244, 63, 94, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFF1F2 35%, #FFE4E6 100%)',
    border: '#FECDD3',
    borderActive: '#F43F5E',
    accentGrad: 'linear-gradient(135deg, #BE123C 0%, #F43F5E 100%)',
    avatarShadow: '0 4px 10px rgba(190, 18, 60, 0.3)',
    badgeBg: '#FFF1F2',
    badgeColor: '#BE123C',
    badgeBorder: '#FECDD3',
    cardShadow: '0 10px 24px rgba(190, 18, 60, 0.08)',
    waveColor: '#E11D48'
  }
];

const WaitingQueuePanel = ({
  doctors = [],
  appointments = [],
  openDetailsModal,
  handleCheckInAppointment,
  showToast,
  fetchData: refreshParentData
}) => {
  const getLocalDateString = (d) => {
    const dateObj = d ? new Date(d) : new Date();
    if (isNaN(dateObj.getTime())) return '';
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState('all');
  const [selectedCategoryPill, setSelectedCategoryPill] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('detailed');
  const [expandedDoctors, setExpandedDoctors] = useState({});
  const [queueDataMap, setQueueDataMap] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Filter out non-doctor accounts (e.g. laboratory1)
  const actualDoctors = useMemo(() => {
    return (doctors || []).filter(doc => {
      const role = (doc.role || '').toLowerCase();
      const name = (doc.name || '').toLowerCase();
      if (role && role !== 'doctor') return false;
      if (name.includes('lab') || name.includes('pharm') || name.includes('reception')) return false;
      return true;
    });
  }, [doctors]);

  // Clean formatting for doctor names ("doctor-1" -> "Dr. Doctor 1")
  const formatDoctorName = (name) => {
    if (!name) return 'Doctor';
    const clean = String(name).trim();
    if (/^dr\.?\s+/i.test(clean)) return clean;
    const formatted = clean
      .replace(/(\d+)/g, ' $1')
      .replace(/[-_]+/g, ' ')
      .trim();
    const capitalized = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    return `Dr. ${capitalized}`;
  };

  // Fetch queue state for a single doctor
  const fetchQueueForDoctor = useCallback(async (docId, dateStr) => {
    if (!docId) return null;
    try {
      const res = await api.get(`/appointments/doctor-queue/${docId}?date=${dateStr}`);
      return res.data;
    } catch (err) {
      console.warn(`Failed to fetch live queue for doctor ${docId}:`, err);
      return null;
    }
  }, []);

  // Fetch queue state for all doctors in tenant
  const fetchAllQueues = useCallback(async (targetDate = selectedDate) => {
    if (!actualDoctors || actualDoctors.length === 0) return;
    setIsLoading(true);
    try {
      const results = await Promise.all(
        actualDoctors.map(async (doc) => {
          const docId = doc._id || doc.id;
          const qData = await fetchQueueForDoctor(docId, targetDate);
          return { docId, qData };
        })
      );

      const newMap = {};
      results.forEach(({ docId, qData }) => {
        if (qData) {
          newMap[String(docId)] = qData;
        }
      });
      setQueueDataMap(newMap);
    } catch (err) {
      console.error("Error fetching multi-doctor queues:", err);
    } finally {
      setIsLoading(false);
      setTimeout(() => window.lucide && window.lucide.createIcons(), 100);
    }
  }, [actualDoctors, selectedDate, fetchQueueForDoctor]);

  useEffect(() => {
    fetchAllQueues(selectedDate);
  }, [fetchAllQueues, selectedDate]);

  // Real-time synchronization via Socket.IO curoxa_sync event
  useEffect(() => {
    const handleSync = async (e) => {
      if (!autoRefresh) return;
      const detail = e.detail || {};
      if (detail.type === 'appointments' || detail.subType === 'doctor_queue') {
        console.log('[SOCKET] WaitingQueuePanel received queue update:', detail);
        if (detail.doctorId) {
          const qData = await fetchQueueForDoctor(detail.doctorId, selectedDate);
          if (qData) {
            setQueueDataMap(prev => ({
              ...prev,
              [String(detail.doctorId)]: qData
            }));
          }
        } else {
          fetchAllQueues(selectedDate);
        }
      }
    };

    window.addEventListener('curoxa_sync', handleSync);
    return () => window.removeEventListener('curoxa_sync', handleSync);
  }, [autoRefresh, selectedDate, fetchQueueForDoctor, fetchAllQueues]);

  useEffect(() => {
    setTimeout(() => window.lucide && window.lucide.createIcons(), 100);
  }, [viewMode, expandedDoctors, selectedCategoryPill]);

  const handleManualRefresh = () => {
    fetchAllQueues(selectedDate);
    if (refreshParentData) refreshParentData();
    if (showToast) showToast('Refreshed live doctor queues', 'info');
  };

  const toggleExpandDoctor = (docId) => {
    setExpandedDoctors(prev => ({
      ...prev,
      [docId]: !prev[docId]
    }));
  };

  const getDoctorInitials = (name) => {
    if (!name) return 'DR';
    const clean = String(name).replace(/^Dr\.?\s+/i, '').trim();
    const parts = clean.split(/[\s-_]+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return clean.slice(0, 2).toUpperCase() || 'DR';
  };

  // Distinct departments available among actual doctors
  const departments = useMemo(() => {
    const set = new Set();
    actualDoctors.forEach(d => {
      if (d.specialty) set.add(d.specialty);
    });
    return Array.from(set);
  }, [actualDoctors]);

  // Filtered doctors list based on user selections, category pill, and search
  const filteredDoctors = useMemo(() => {
    return actualDoctors.filter(doc => {
      const docId = String(doc._id || doc.id);
      const q = queueDataMap[docId];
      const isServing = q?.currentToken !== null && q?.currentToken !== undefined;
      const isWaiting = (q?.waitingCount || 0) > 0;

      // 1. Doctor dropdown filter
      if (selectedDoctorFilter !== 'all' && docId !== selectedDoctorFilter) {
        return false;
      }

      // 2. Category pill filter
      if (selectedCategoryPill === 'serving' && !isServing) return false;
      if (selectedCategoryPill === 'waiting' && !isWaiting) return false;
      if (selectedCategoryPill === 'idle' && (isServing || isWaiting)) return false;
      if (selectedCategoryPill.startsWith('dept:') && doc.specialty !== selectedCategoryPill.replace('dept:', '')) {
        return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const docName = formatDoctorName(doc.name).toLowerCase();
        const rawName = (doc.name || '').toLowerCase();
        const specMatch = (doc.specialty || '').toLowerCase().includes(query);
        const nameMatch = docName.includes(query) || rawName.includes(query);
        const currentPatientMatch = (q?.currentPatient?.name || '').toLowerCase().includes(query);
        const tokenMatch = q?.queueAppointments?.some(a => 
          String(a.tokenNumber).includes(query) || 
          (a.patientName || '').toLowerCase().includes(query)
        );

        return nameMatch || specMatch || currentPatientMatch || tokenMatch;
      }

      return true;
    });
  }, [actualDoctors, selectedDoctorFilter, selectedCategoryPill, searchQuery, queueDataMap]);

  // Overall KPIs
  const totalWaitingAllDoctors = useMemo(() => {
    return Object.values(queueDataMap).reduce((sum, q) => sum + (q?.waitingCount || 0), 0);
  }, [queueDataMap]);

  const totalServingAllDoctors = useMemo(() => {
    return Object.values(queueDataMap).filter(q => q?.currentToken !== null && q?.currentToken !== undefined).length;
  }, [queueDataMap]);

  const totalIdleDoctors = useMemo(() => {
    return actualDoctors.length - totalServingAllDoctors;
  }, [actualDoctors.length, totalServingAllDoctors]);

  return (
    <div className="tab-content active" style={{ animation: 'slideUp 0.3s ease-out', paddingBottom: '40px' }}>
      
      {/* 1. PAGE HEADER */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>
              Doctor Live Waiting Queue
            </h2>
            <span style={{
              fontSize: '11px',
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
              color: '#1D4ED8',
              border: '1px solid #93C5FD',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(37,99,235,0.1)'
            }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#2563EB', boxShadow: '0 0 8px #2563EB' }}></span>
              Live OPD
            </span>
          </div>
          <p style={{ fontSize: '12.5px', color: '#64748B', margin: '3px 0 0 0', fontWeight: 500 }}>
            Real-time OPD queue status for all doctors
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '20px',
              background: autoRefresh ? 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)' : '#F1F5F9',
              border: autoRefresh ? '1px solid #A7F3D0' : '1px solid #CBD5E1',
              color: autoRefresh ? '#065F46' : '#64748B',
              fontSize: '12px',
              fontWeight: 750,
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'all 0.2s',
              boxShadow: autoRefresh ? '0 2px 8px rgba(16, 185, 129, 0.15)' : 'none'
            }}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? "Auto-refresh active via live WebSockets. Click to pause." : "Auto-refresh paused. Click to enable."}
          >
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: autoRefresh ? '#10B981' : '#94A3B8',
              boxShadow: autoRefresh ? '0 0 8px rgba(16, 185, 129, 0.8)' : 'none',
              display: 'inline-block'
            }}></span>
            Auto Refresh
          </div>

          <button
            className="btn btn-secondary"
            onClick={handleManualRefresh}
            disabled={isLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 14px',
              height: '34px',
              fontSize: '12px',
              fontWeight: 750,
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#334155',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}
          >
            <i data-lucide="refresh-cw" style={{ width: '13px', height: '13px' }}></i>
            Refresh Now
          </button>
        </div>
      </div>

      {/* 2. DOCTOR LIVE STATUS CARDS (RICH COLORFUL GRADIENTS LIKE ADMIN CARDS) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(235px, 1fr))',
        gap: '14px',
        marginBottom: '16px'
      }}>
        {actualDoctors.map((doc, idx) => {
          const docId = String(doc._id || doc.id);
          const q = queueDataMap[docId] || {};
          const isServing = q.currentToken !== null && q.currentToken !== undefined;
          const isExpanded = !!expandedDoctors[docId];
          const displayName = formatDoctorName(doc.name);
          const theme = DOCTOR_CARD_THEMES[idx % DOCTOR_CARD_THEMES.length];

          return (
            <div
              key={docId}
              style={{
                background: theme.bg,
                borderRadius: '16px',
                border: isServing ? `1.5px solid ${theme.borderActive}` : `1px solid ${theme.border}`,
                boxShadow: isServing ? theme.cardShadow : '0 4px 14px rgba(15, 23, 42, 0.03)',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.25s ease',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Bottom Right Organic Wave Graphic (Like Admin Dashboard Cards) */}
              <svg 
                viewBox="0 0 64 36" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  width: '64px',
                  height: '36px',
                  pointerEvents: 'none',
                  opacity: isServing ? 0.35 : 0.2,
                  zIndex: 0
                }}
              >
                <path d="M4 36 C18 30 26 14 38 18 C46 22 54 6 64 8 L64 36 Z" fill={theme.waveColor} />
                <path d="M4 36 C18 30 26 14 38 18 C46 22 54 6 64 8" stroke={theme.waveColor} strokeWidth="1.2" />
              </svg>

              {/* Active Serving Top Accent Line */}
              {isServing && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '3.5px',
                  background: theme.accentGrad
                }} />
              )}

              <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Doctor Header Strip */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: theme.accentGrad,
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 850,
                      fontSize: '11.5px',
                      boxShadow: theme.avatarShadow,
                      flexShrink: 0
                    }}>
                      {getDoctorInitials(doc.name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }} title={displayName}>
                        {displayName}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
                        {doc.specialty || 'General OPD'}
                      </div>
                    </div>
                  </div>

                  <span style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: isServing ? theme.badgeBg : '#FFFFFF',
                    color: isServing ? theme.badgeColor : '#94A3B8',
                    border: isServing ? `1px solid ${theme.badgeBorder}` : '1px solid #E2E8F0',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    flexShrink: 0,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                  }}>
                    <span style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      background: isServing ? theme.badgeColor : '#CBD5E1',
                      boxShadow: isServing ? `0 0 6px ${theme.badgeColor}` : 'none'
                    }}></span>
                    {isServing ? 'Serving' : 'Idle'}
                  </span>
                </div>

                {/* Frosted Middle Banner: CURRENTLY SERVING */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.82)',
                  backdropFilter: 'blur(6px)',
                  borderRadius: '10px',
                  padding: '7px 10px',
                  border: isServing ? `1px solid ${theme.border}` : '1px solid rgba(226, 232, 240, 0.8)',
                  marginBottom: '8px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                }}>
                  <div style={{ fontSize: '8.5px', fontWeight: 800, color: isServing ? theme.badgeColor : '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    CURRENTLY SERVING
                  </div>
                  {isServing ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '2px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: theme.badgeColor, fontFamily: "'Outfit', sans-serif" }}>
                        Token #{q.currentToken}
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E293B', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {q.currentPatient?.name || 'In Consultation'}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '11.5px', fontWeight: 650, color: '#94A3B8', marginTop: '2px' }}>
                      No Patient in Queue
                    </div>
                  )}
                </div>

                {/* Sub KPI Stats Strip */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                  <div style={{ background: 'rgba(255, 251, 235, 0.85)', border: '1px solid #FEF3C7', borderRadius: '7px', padding: '4px 5px', textAlign: 'center' }}>
                    <div style={{ fontSize: '8px', fontWeight: 800, color: '#B45309', textTransform: 'uppercase' }}>NEXT</div>
                    <div style={{ fontSize: '11.5px', fontWeight: 800, color: q.nextToken ? '#92400E' : '#B45309', marginTop: '1px' }}>
                      {q.nextToken ? `#${q.nextToken}` : '—'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(236, 253, 245, 0.85)', border: '1px solid #A7F3D0', borderRadius: '7px', padding: '4px 5px', textAlign: 'center' }}>
                    <div style={{ fontSize: '8px', fontWeight: 800, color: '#047857', textTransform: 'uppercase' }}>WAITING</div>
                    <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#065F46', marginTop: '1px' }}>
                      {q.waitingCount || 0}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255, 255, 255, 0.85)', border: '1px solid #E2E8F0', borderRadius: '7px', padding: '4px 5px', textAlign: 'center' }}>
                    <div style={{ fontSize: '8px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>LAST</div>
                    <div style={{ fontSize: '11.5px', fontWeight: 800, color: q.lastIssuedToken ? '#1E293B' : '#94A3B8', marginTop: '1px' }}>
                      {q.lastIssuedToken ? `#${q.lastIssuedToken}` : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom: View Queue Button */}
              <button
                type="button"
                onClick={() => toggleExpandDoctor(docId)}
                style={{
                  width: '100%',
                  padding: '5px 10px',
                  borderRadius: '7px',
                  border: isExpanded ? '1px solid #CBD5E1' : `1px solid ${theme.border}`,
                  background: isExpanded ? '#FFFFFF' : 'rgba(255, 255, 255, 0.9)',
                  color: isExpanded ? '#475569' : theme.badgeColor,
                  fontSize: '11px',
                  fontWeight: 750,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  transition: 'all 0.15s',
                  position: 'relative',
                  zIndex: 1,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}
              >
                {isExpanded ? 'Hide Queue' : 'View Queue'}
                <i data-lucide={isExpanded ? "chevron-up" : "chevron-down"} style={{ width: '12px', height: '12px' }}></i>
              </button>
            </div>
          );
        })}
      </div>

      {/* 3. COLORFUL FILTER PILLS (LIKE ADMIN ALERTS & TASKS) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
        marginBottom: '14px'
      }}>
        {/* All Doctors Pill */}
        <button
          type="button"
          onClick={() => setSelectedCategoryPill('all')}
          style={{
            padding: '5px 12px',
            borderRadius: '20px',
            border: selectedCategoryPill === 'all' ? '1px solid #2563EB' : '1px solid #E2E8F0',
            background: selectedCategoryPill === 'all' ? 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)' : '#FFFFFF',
            color: selectedCategoryPill === 'all' ? '#FFFFFF' : '#334155',
            fontSize: '11.5px',
            fontWeight: 750,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: selectedCategoryPill === 'all' ? '0 3px 8px rgba(37,99,235,0.25)' : '0 1px 3px rgba(0,0,0,0.02)',
            transition: 'all 0.15s'
          }}
        >
          <span>All Doctors</span>
          <span style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '10px',
            background: selectedCategoryPill === 'all' ? 'rgba(255,255,255,0.25)' : '#EFF6FF',
            color: selectedCategoryPill === 'all' ? '#FFFFFF' : '#1D4ED8',
            fontWeight: 800
          }}>
            {actualDoctors.length}
          </span>
        </button>

        {/* Serving Pill */}
        <button
          type="button"
          onClick={() => setSelectedCategoryPill('serving')}
          style={{
            padding: '5px 12px',
            borderRadius: '20px',
            border: selectedCategoryPill === 'serving' ? '1px solid #10B981' : '1px solid #A7F3D0',
            background: selectedCategoryPill === 'serving' ? 'linear-gradient(135deg, #059669 0%, #10B981 100%)' : '#ECFDF5',
            color: selectedCategoryPill === 'serving' ? '#FFFFFF' : '#047857',
            fontSize: '11.5px',
            fontWeight: 750,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: selectedCategoryPill === 'serving' ? '0 3px 8px rgba(16,185,129,0.25)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <span>In Consultation</span>
          <span style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '10px',
            background: selectedCategoryPill === 'serving' ? 'rgba(255,255,255,0.25)' : '#D1FAE5',
            color: selectedCategoryPill === 'serving' ? '#FFFFFF' : '#065F46',
            fontWeight: 800
          }}>
            {totalServingAllDoctors}
          </span>
        </button>

        {/* Waiting Queue Pill */}
        <button
          type="button"
          onClick={() => setSelectedCategoryPill('waiting')}
          style={{
            padding: '5px 12px',
            borderRadius: '20px',
            border: selectedCategoryPill === 'waiting' ? '1px solid #F59E0B' : '1px solid #FDE68A',
            background: selectedCategoryPill === 'waiting' ? 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)' : '#FFFBEB',
            color: selectedCategoryPill === 'waiting' ? '#FFFFFF' : '#92400E',
            fontSize: '11.5px',
            fontWeight: 750,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: selectedCategoryPill === 'waiting' ? '0 3px 8px rgba(245,158,11,0.25)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <span>With Waiting Patients</span>
          <span style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '10px',
            background: selectedCategoryPill === 'waiting' ? 'rgba(255,255,255,0.25)' : '#FEF3C7',
            color: selectedCategoryPill === 'waiting' ? '#FFFFFF' : '#B45309',
            fontWeight: 800
          }}>
            {totalWaitingAllDoctors}
          </span>
        </button>

        {/* Department Specific Pills */}
        {departments.map((dept, dIdx) => {
          const pillKey = `dept:${dept}`;
          const isSelected = selectedCategoryPill === pillKey;
          const theme = DOCTOR_CARD_THEMES[dIdx % DOCTOR_CARD_THEMES.length];
          const count = actualDoctors.filter(d => d.specialty === dept).length;

          return (
            <button
              key={dept}
              type="button"
              onClick={() => setSelectedCategoryPill(isSelected ? 'all' : pillKey)}
              style={{
                padding: '5px 12px',
                borderRadius: '20px',
                border: isSelected ? `1px solid ${theme.borderActive}` : `1px solid ${theme.badgeBorder}`,
                background: isSelected ? theme.accentGrad : theme.badgeBg,
                color: isSelected ? '#FFFFFF' : theme.badgeColor,
                fontSize: '11.5px',
                fontWeight: 750,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: isSelected ? theme.cardShadow : 'none',
                transition: 'all 0.15s'
              }}
            >
              <span>{dept}</span>
              <span style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '10px',
                background: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)',
                color: isSelected ? '#FFFFFF' : theme.badgeColor,
                fontWeight: 800
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 4. FILTER CONTROLS BAR */}
      <div style={{
        background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        padding: '10px 16px',
        marginBottom: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '10px',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
          {/* Date Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                fontWeight: 650,
                color: '#1E293B',
                background: '#FFFFFF'
              }}
            />
            {selectedDate !== getLocalDateString() && (
              <button
                type="button"
                onClick={() => setSelectedDate(getLocalDateString())}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: '6px',
                  border: '1px solid #93C5FD',
                  background: '#EFF6FF',
                  color: '#1D4ED8',
                  fontSize: '11px',
                  fontWeight: 750,
                  cursor: 'pointer'
                }}
              >
                Today
              </button>
            )}
          </div>

          {/* Doctor Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Doctor:</span>
            <select
              value={selectedDoctorFilter}
              onChange={e => setSelectedDoctorFilter(e.target.value)}
              style={{
                height: '32px',
                padding: '0 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                fontWeight: 650,
                color: '#1E293B',
                background: '#FFFFFF',
                minWidth: '150px'
              }}
            >
              <option value="all">All Doctors ({actualDoctors.length})</option>
              {actualDoctors.map(d => (
                <option key={d._id || d.id} value={String(d._id || d.id)}>
                  {formatDoctorName(d.name)} ({d.specialty || 'General'})
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
            <input
              type="text"
              placeholder="Search patient name, token..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: '32px',
                padding: '0 10px 0 30px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                color: '#1E293B',
                background: '#FFFFFF'
              }}
            />
            <div style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>
              <i data-lucide="search" style={{ width: '13px', height: '13px' }}></i>
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* View Mode Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', background: '#F1F5F9', padding: '2px', borderRadius: '6px' }}>
          <button
            type="button"
            onClick={() => setViewMode('compact')}
            style={{
              padding: '4px 10px',
              borderRadius: '5px',
              border: 'none',
              background: viewMode === 'compact' ? '#FFFFFF' : 'transparent',
              color: viewMode === 'compact' ? '#0F172A' : '#64748B',
              fontWeight: 750,
              fontSize: '11px',
              cursor: 'pointer',
              boxShadow: viewMode === 'compact' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s'
            }}
          >
            Compact
          </button>
          <button
            type="button"
            onClick={() => setViewMode('detailed')}
            style={{
              padding: '4px 10px',
              borderRadius: '5px',
              border: 'none',
              background: viewMode === 'detailed' ? '#FFFFFF' : 'transparent',
              color: viewMode === 'detailed' ? '#0F172A' : '#64748B',
              fontWeight: 750,
              fontSize: '11px',
              cursor: 'pointer',
              boxShadow: viewMode === 'detailed' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s'
            }}
          >
            Detailed
          </button>
        </div>
      </div>

      {/* 5. DETAILED WAITING QUEUE TABLE */}
      <div className="glass-card" style={{ padding: '0px', overflow: 'hidden', border: '1px solid #E2E8F0', borderRadius: '14px', background: '#FFFFFF', boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 850, color: '#0F172A', margin: 0, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Detailed Waiting Queue
            </h3>
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '1px', fontWeight: 500 }}>
              All patients waiting in queue across doctors
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 750, padding: '2px 8px', borderRadius: '12px', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
              {filteredDoctors.length} Active Doctor{filteredDoctors.length === 1 ? '' : 's'}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 750, padding: '2px 8px', borderRadius: '12px', background: totalWaitingAllDoctors > 0 ? '#ECFDF5' : '#F1F5F9', color: totalWaitingAllDoctors > 0 ? '#047857' : '#64748B', border: totalWaitingAllDoctors > 0 ? '1px solid #A7F3D0' : '1px solid #CBD5E1' }}>
              {totalWaitingAllDoctors} Waiting
            </span>
          </div>
        </div>

        <div className="table-responsive" style={{ margin: 0 }}>
          <table className="elite-table" style={{ margin: 0 }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>
                <th style={{ paddingLeft: '18px' }}>Doctor / Department</th>
                <th>Currently Serving</th>
                <th>Waiting Patients (In Order)</th>
                <th>Next Token</th>
                <th>Total Waiting</th>
                <th>Last Issued</th>
                <th style={{ textAlign: 'right', paddingRight: '18px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredDoctors.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '36px 18px', color: '#64748B', fontWeight: 600 }}>
                    {searchQuery ? `No doctor queues matching "${searchQuery}"` : "No doctor queue records found for this date."}
                  </td>
                </tr>
              ) : (
                filteredDoctors.map((doc, idx) => {
                  const docId = String(doc._id || doc.id);
                  const q = queueDataMap[docId] || {};
                  const isServing = q.currentToken !== null && q.currentToken !== undefined;
                  const isExpanded = !!expandedDoctors[docId];
                  const qList = q.queueAppointments || [];
                  const waitingList = qList.filter(a => a.tokenNumber !== q.currentToken);
                  const docDisplayName = formatDoctorName(doc.name);
                  const theme = DOCTOR_CARD_THEMES[idx % DOCTOR_CARD_THEMES.length];

                  return (
                    <React.Fragment key={docId}>
                      {/* Main Doctor Queue Row */}
                      <tr style={{
                        background: isExpanded ? '#F8FAFC' : 'transparent',
                        borderBottom: isExpanded ? 'none' : '1px solid #F1F5F9',
                        borderLeft: isServing ? `3.5px solid ${theme.borderActive}` : '3.5px solid transparent',
                        transition: 'background 0.15s'
                      }}>
                        {/* Doctor / Department */}
                        <td style={{ paddingLeft: '18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '30px',
                              height: '30px',
                              borderRadius: '8px',
                              background: theme.accentGrad,
                              color: '#FFFFFF',
                              fontWeight: 850,
                              fontSize: '11px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: theme.avatarShadow,
                              flexShrink: 0
                            }}>
                              {getDoctorInitials(doc.name)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '12.5px' }}>
                                {docDisplayName}
                              </div>
                              <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>
                                {doc.specialty || 'General Medicine'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Currently Serving */}
                        <td>
                          {isServing ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{
                                padding: '2px 7px',
                                borderRadius: '5px',
                                background: theme.badgeBg,
                                color: theme.badgeColor,
                                border: `1px solid ${theme.badgeBorder}`,
                                fontWeight: 850,
                                fontSize: '11px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: theme.badgeColor }}></span>
                                #{q.currentToken}
                              </span>
                              <span style={{ fontWeight: 700, color: '#1E293B', fontSize: '11.5px' }}>
                                {q.currentPatient?.name || 'In Consultation'}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 600 }}>
                              No Patient
                            </span>
                          )}
                        </td>

                        {/* Waiting Patients (In Order) */}
                        <td>
                          {viewMode === 'compact' ? (
                            <span style={{
                              padding: '2px 7px',
                              borderRadius: '5px',
                              background: (q.waitingCount || 0) > 0 ? '#ECFDF5' : '#F1F5F9',
                              color: (q.waitingCount || 0) > 0 ? '#059669' : '#94A3B8',
                              fontWeight: 750,
                              fontSize: '11px'
                            }}>
                              {q.waitingCount || 0} waiting
                            </span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', maxWidth: '320px' }}>
                              {waitingList.length === 0 ? (
                                <span style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 600 }}>None</span>
                              ) : (
                                <>
                                  {waitingList.slice(0, 3).map(p => (
                                    <span
                                      key={p._id}
                                      style={{
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        background: '#F8FAFC',
                                        border: '1px solid #E2E8F0',
                                        fontSize: '10.5px',
                                        fontWeight: 700,
                                        color: '#334155',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px'
                                      }}
                                    >
                                      <strong style={{ color: '#2563EB' }}>#{p.tokenNumber}</strong> {p.patientName}
                                    </span>
                                  ))}
                                  {waitingList.length > 3 && (
                                    <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 750, background: '#F1F5F9', padding: '1px 5px', borderRadius: '4px' }}>
                                      +{waitingList.length - 3} more
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Next Token */}
                        <td>
                          {q.nextToken ? (
                            <span style={{
                              padding: '2px 7px',
                              borderRadius: '5px',
                              background: '#FFFBEB',
                              color: '#B45309',
                              border: '1px solid #FDE68A',
                              fontWeight: 800,
                              fontSize: '11px'
                            }}>
                              #{q.nextToken}
                            </span>
                          ) : (
                            <span style={{ color: '#94A3B8', fontSize: '11px' }}>—</span>
                          )}
                        </td>

                        {/* Total Waiting */}
                        <td>
                          <span style={{
                            fontSize: '12.5px',
                            fontWeight: 850,
                            color: (q.waitingCount || 0) > 0 ? '#0F172A' : '#94A3B8'
                          }}>
                            {q.waitingCount || 0}
                          </span>
                        </td>

                        {/* Last Issued */}
                        <td>
                          <span style={{
                            fontSize: '11.5px',
                            fontWeight: 750,
                            color: q.lastIssuedToken ? '#475569' : '#94A3B8'
                          }}>
                            {q.lastIssuedToken ? `#${q.lastIssuedToken}` : '—'}
                          </span>
                        </td>

                        {/* Action: Expand toggle */}
                        <td style={{ textAlign: 'right', paddingRight: '18px' }}>
                          <button
                            type="button"
                            onClick={() => toggleExpandDoctor(docId)}
                            style={{
                              padding: '0 10px',
                              height: '28px',
                              fontSize: '11px',
                              fontWeight: 750,
                              background: isExpanded ? '#FFFFFF' : theme.badgeBg,
                              color: isExpanded ? '#334155' : theme.badgeColor,
                              border: isExpanded ? '1px solid #CBD5E1' : `1px solid ${theme.badgeBorder}`,
                              borderRadius: '5px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap',
                              transition: 'all 0.15s',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                            }}
                          >
                            {isExpanded ? 'Hide Queue' : 'View Queue →'}
                          </button>
                        </td>
                      </tr>

                      {/* 6. EXPANDABLE DOCTOR ROW SUB-PANEL */}
                      {isExpanded && (
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                          <td colSpan="7" style={{ padding: '0 18px 16px 18px' }}>
                            <div style={{
                              background: '#FFFFFF',
                              borderRadius: '10px',
                              border: '1px solid #CBD5E1',
                              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.03)',
                              overflow: 'hidden'
                            }}>
                              {/* Sub-table Header */}
                              <div style={{
                                padding: '10px 16px',
                                background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                                color: '#FFFFFF',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#38BDF8', boxShadow: '0 0 8px #38BDF8' }}></span>
                                  <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em' }}>
                                    LIVE QUEUE — {docDisplayName.toUpperCase()}
                                  </span>
                                  <span style={{ fontSize: '10.5px', color: '#94A3B8', fontWeight: 600 }}>
                                    ({doc.specialty || 'General OPD'})
                                  </span>
                                </div>
                                <div style={{ fontSize: '11px', color: '#CBD5E1', fontWeight: 600 }}>
                                  Date: <strong style={{ color: '#FFFFFF' }}>{selectedDate}</strong> • {qList.length} total in queue
                                </div>
                              </div>

                              {/* Patients Table */}
                              {qList.length === 0 ? (
                                <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '12px', fontWeight: 600 }}>
                                  No checked-in patients currently in queue for this doctor on {selectedDate}.
                                </div>
                              ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                                  <thead>
                                    <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569', fontSize: '10px', textTransform: 'uppercase' }}>
                                      <th style={{ padding: '8px 14px', fontWeight: 800 }}>Token</th>
                                      <th style={{ padding: '8px 14px', fontWeight: 800 }}>Patient Name</th>
                                      <th style={{ padding: '8px 14px', fontWeight: 800 }}>Time / Slot</th>
                                      <th style={{ padding: '8px 14px', fontWeight: 800 }}>Queue Status</th>
                                      <th style={{ padding: '8px 14px', fontWeight: 800, textAlign: 'right' }}>Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {qList.map((item, pIdx) => {
                                      const isServingToken = item.tokenNumber === q.currentToken;
                                      const isNextToken = item.tokenNumber === q.nextToken;

                                      return (
                                        <tr
                                          key={item._id || pIdx}
                                          style={{
                                            borderBottom: '1px solid #F1F5F9',
                                            background: isServingToken ? '#EFF6FF' : (isNextToken ? '#FFFDF7' : '#FFFFFF'),
                                            transition: 'background 0.15s'
                                          }}
                                        >
                                          {/* Token # */}
                                          <td style={{ padding: '8px 14px' }}>
                                            <span style={{
                                              padding: '2px 7px',
                                              borderRadius: '5px',
                                              fontSize: '11px',
                                              fontWeight: 900,
                                              background: isServingToken ? 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)' : (isNextToken ? 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)' : '#EFF6FF'),
                                              color: (isServingToken || isNextToken) ? '#FFFFFF' : '#1D4ED8',
                                              border: isServingToken ? 'none' : (isNextToken ? 'none' : '1px solid #BFDBFE'),
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              boxShadow: (isServingToken || isNextToken) ? '0 2px 5px rgba(0,0,0,0.1)' : 'none'
                                            }}>
                                              #{item.tokenNumber}
                                            </span>
                                          </td>

                                          {/* Patient Name */}
                                          <td style={{ padding: '8px 14px', fontWeight: 750, color: '#1E293B' }}>
                                            {item.patientName}
                                            {item.age ? ` (${item.age}y/${item.gender || 'M'})` : ''}
                                          </td>

                                          {/* Slot / Time */}
                                          <td style={{ padding: '8px 14px', color: '#475569', fontWeight: 600 }}>
                                            {item.tokenSlotId || item.time || 'General OPD'}
                                          </td>

                                          {/* Queue Status (Color System) */}
                                          <td style={{ padding: '8px 14px' }}>
                                            {isServingToken ? (
                                              <span style={{ padding: '2px 8px', borderRadius: '10px', background: '#DBEAFE', color: '#1E40AF', fontWeight: 800, fontSize: '10.5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#2563EB', boxShadow: '0 0 6px #2563EB' }}></span>
                                                Currently Serving
                                              </span>
                                            ) : isNextToken ? (
                                              <span style={{ padding: '2px 8px', borderRadius: '10px', background: '#FEF3C7', color: '#92400E', fontWeight: 800, fontSize: '10.5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#D97706', boxShadow: '0 0 6px #D97706' }}></span>
                                                Next in Line
                                              </span>
                                            ) : (
                                              <span style={{ padding: '2px 8px', borderRadius: '10px', background: '#ECFDF5', color: '#065F46', fontWeight: 750, fontSize: '10.5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10B981' }}></span>
                                                Waiting
                                              </span>
                                            )}
                                          </td>

                                          {/* Actions */}
                                          <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                                            {openDetailsModal && (
                                              <button
                                                type="button"
                                                className="btn btn-secondary"
                                                onClick={() => {
                                                  const fullAppt = appointments.find(a => String(a._id) === String(item._id)) || item;
                                                  openDetailsModal(fullAppt);
                                                }}
                                                style={{
                                                  padding: '0 8px',
                                                  height: '24px',
                                                  fontSize: '10.5px',
                                                  fontWeight: 700,
                                                  borderRadius: '4px',
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  gap: '3px'
                                                }}
                                              >
                                                View Details
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. SUMMARY SECTION AT BOTTOM */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 20px',
        background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
        borderRadius: '12px',
        border: '1px solid #BFDBFE',
        marginTop: '18px',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: '0 2px 8px rgba(37,99,235,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(37,99,235,0.25)',
            flexShrink: 0
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Queue Information
            </div>
            <div style={{ fontSize: '12px', color: '#334155', fontWeight: 650, marginTop: '2px' }}>
              Tokens are assigned during patient check-in. Queue status updates in real time as doctors complete consultations.
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: '#FFFFFF',
          padding: '8px 16px',
          borderRadius: '8px',
          border: '1px solid #BFDBFE',
          boxShadow: '0 2px 6px rgba(37,99,235,0.06)'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#2563EB', lineHeight: 1, fontFamily: "'Outfit', sans-serif" }}>
            {totalWaitingAllDoctors}
          </div>
          <div style={{ fontSize: '11px', fontWeight: 750, color: '#1E3A8A', lineHeight: 1.2 }}>
            Total Patients<br />Waiting Across Doctors
          </div>
        </div>
      </div>

    </div>
  );
};

export default WaitingQueuePanel;
