import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../utils/socket';

const originalFetch = window.fetch;
const fetch = async (url, options = {}) => {
  const baseUrl = import.meta.env.VITE_API_URL || '/api';
  let targetUrl = url;
  if (url && typeof url === 'string' && url.startsWith('/api')) {
    if (baseUrl.startsWith('http')) {
      targetUrl = url.replace('/api', baseUrl);
    }
  }
  return originalFetch(targetUrl, options);
};

export default function GlobalSupportWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [newTicketDesc, setNewTicketDesc] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [supportTab, setSupportTab] = useState('raised'); // 'raised' or 'general'
  
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{}'));
  
  const chatEndRef = useRef(null);

  useEffect(() => {
    const handleLogin = () => {
      setToken(localStorage.getItem('token'));
      setCurrentUser(JSON.parse(localStorage.getItem('user') || '{}'));
    };
    const handleLogout = () => {
      setToken(null);
      setCurrentUser({});
      setIsOpen(false);
      setTickets([]);
      setActiveTicket(null);
    };

    window.addEventListener('curoxa_login_success', handleLogin);
    window.addEventListener('curoxa_logout', handleLogout);
    return () => {
      window.removeEventListener('curoxa_login_success', handleLogin);
      window.removeEventListener('curoxa_logout', handleLogout);
    };
  }, []);

  useEffect(() => {
    if (isOpen && token && currentUser?.role !== 'superadmin' && currentUser?.role !== 'patient') {
      fetchTickets();
    }
  }, [isOpen, token]);

  useEffect(() => {
    if (!token) return;

    if (!socket.connected) {
      socket.connect();
    }

    const handleTicketMessage = (data) => {
      console.log('[SOCKET] GlobalSupportWidget received ticket_message:', data);
      setActiveTicket((prev) => {
        if (prev && (prev._id === data.ticketId || prev.id === data.ticketId)) {
          const msgExists = prev.messages.some(
            (m) => m.timestamp === data.message.timestamp && m.text === data.message.text
          );
          if (msgExists) return prev;
          return {
            ...prev,
            messages: [...prev.messages, data.message]
          };
        }
        return prev;
      });

      setTickets((prevTickets) => {
        return prevTickets.map((t) => {
          if (t._id === data.ticketId || t.id === data.ticketId) {
            const msgExists = t.messages.some(
              (m) => m.timestamp === data.message.timestamp && m.text === data.message.text
            );
            if (msgExists) return t;
            return {
              ...t,
              messages: [...t.messages, data.message]
            };
          }
          return t;
        });
      });
    };

    const handleTicketStatus = (data) => {
      console.log('[SOCKET] GlobalSupportWidget received ticket_status_changed:', data);
      setActiveTicket((prev) => {
        if (prev && (prev._id === data.ticketId || prev.id === data.ticketId)) {
          return {
            ...prev,
            status: data.status
          };
        }
        return prev;
      });

      setTickets((prevTickets) => {
        return prevTickets.map((t) => {
          if (t._id === data.ticketId || t.id === data.ticketId) {
            return {
              ...t,
              status: data.status
            };
          }
          return t;
        });
      });
    };

    const handleTicketCreated = (newTicket) => {
      console.log('[SOCKET] GlobalSupportWidget received ticket_created:', newTicket);
      const hospitalName = currentUser?.name || currentUser?.tenantId;
      if (newTicket.hospital === hospitalName) {
        setTickets((prev) => {
          if (prev.some((t) => t._id === newTicket._id)) return prev;
          return [newTicket, ...prev];
        });
      }
    };

    socket.on('ticket_message', handleTicketMessage);
    socket.on('ticket_status_changed', handleTicketStatus);
    socket.on('ticket_created', handleTicketCreated);

    return () => {
      socket.off('ticket_message', handleTicketMessage);
      socket.off('ticket_status_changed', handleTicketStatus);
      socket.off('ticket_created', handleTicketCreated);
    };
  }, [token, currentUser]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTicket?.messages]);

  const fetchTickets = async () => {
    try {
      const res = await fetch('/api/auth/support/tickets', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data);
        // Refresh active ticket details if open
        if (activeTicket) {
          const updated = data.find(t => t._id === activeTicket._id);
          if (updated) setActiveTicket(updated);
        }
      }
    } catch (err) {
      console.error('Error fetching support tickets:', err);
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!newTicketDesc.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          description: newTicketDesc,
          department: currentUser?.role ? currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1) : 'General',
          category: 'Technical Issue'
        })
      });

      if (res.ok) {
        setNewTicketDesc('');
        await fetchTickets();
      }
    } catch (err) {
      console.error('Failed to log support ticket:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatMessage.trim() || !activeTicket) return;

    const messageText = chatMessage;
    setChatMessage('');

    try {
      const res = await fetch(`/api/auth/support/tickets/${activeTicket._id}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text: messageText
        })
      });

      if (res.ok) {
        await fetchTickets();
      }
    } catch (err) {
      console.error('Failed to send support reply:', err);
    }
  };

  // Do not render if not logged in, or if user is superadmin/patient
  if (!token || currentUser?.role === 'superadmin' || currentUser?.role === 'patient') {
    return null;
  }

  return (
    <>
      {/* FLOATING ACTION BUTTON */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: isOpen ? '424px' : '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
          boxShadow: '0 8px 30px rgba(37, 99, 235, 0.4)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          zIndex: 9999,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isOpen ? 'rotate(90deg) scale(0.95)' : 'rotate(0) scale(1)'
        }}
        title="Contact Platform Support"
      >
        {isOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v5"/><path d="M12 16h.01"/></svg>
        )}
      </button>

      {/* SUPPORT DRAWER PANEL */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '400px',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(16px)',
            boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.12)',
            zIndex: 9998,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid rgba(226, 232, 240, 0.8)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
          }}
        >
          {/* Header */}
          <div style={{ padding: '20px', borderBottom: '1px solid #E2E8F0', background: 'linear-gradient(to right, #F8FAFC, #FFFFFF)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#EFF6FF', color: '#2563EB', padding: '8px', borderRadius: '8px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>Platform Help Center</h3>
                <span style={{ fontSize: '11px', color: '#10B981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', background: '#10B981', borderRadius: '50%', display: 'inline-block' }}></span>
                  Quroxa Support Desk Live
                </span>
              </div>
            </div>
          </div>

          {/* Body Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {activeTicket ? (
              /* ACTIVE CHAT SCREEN */
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Back Link */}
                <button
                  onClick={() => setActiveTicket(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#2563EB',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '0 0 12px 0',
                    alignSelf: 'flex-start'
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" x2="5" y1="12" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                  Back to Tickets
                </button>

                {/* Ticket Summary Card */}
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: '#1E293B' }}>{activeTicket.id}</span>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      background: activeTicket.status === 'Open' ? '#FEF3C7' : '#D1FAE5',
                      color: activeTicket.status === 'Open' ? '#D97706' : '#065F46',
                      padding: '2px 8px',
                      borderRadius: '12px'
                    }}>
                      {activeTicket.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '8px' }}>
                    Dept: {activeTicket.department}
                  </div>
                  <p style={{ fontSize: '12px', color: '#334155', margin: 0, lineHeight: 1.4 }}>
                    {activeTicket.description}
                  </p>
                </div>

                {/* Messages Box */}
                <div style={{ flex: 1, minHeight: '150px', overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid #F1F5F9', borderRadius: '8px', background: '#FFFFFF' }}>
                  {activeTicket.messages?.map((msg, index) => {
                    const isSelf = msg.sender === currentUser.name || msg.sender === currentUser.staff_id;
                    return (
                      <div
                        key={index}
                        style={{
                          alignSelf: isSelf ? 'flex-end' : 'flex-start',
                          maxWidth: '80%',
                          background: isSelf ? '#2563EB' : '#F1F5F9',
                          color: isSelf ? 'white' : '#1E293B',
                          padding: '10px 14px',
                          borderRadius: '12px',
                          borderTopRightRadius: isSelf ? '2px' : '12px',
                          borderTopLeftRadius: isSelf ? '12px' : '2px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                      >
                        {!isSelf && <div style={{ fontSize: '9px', fontWeight: 700, opacity: 0.8, marginBottom: '2px' }}>{msg.sender}</div>}
                        <div style={{ fontSize: '12px', lineHeight: 1.4 }}>{msg.text}</div>
                        <div style={{ fontSize: '8px', opacity: 0.7, textAlign: 'right', marginTop: '4px' }}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>

                {/* Message Input */}
                {activeTicket.status === 'Resolved' ? (
                  <div style={{ padding: '12px', textAlign: 'center', background: '#F8FAFC', color: '#64748B', borderRadius: '8px', fontSize: '11px', fontWeight: 600, marginTop: '10px', border: '1px solid #E2E8F0' }}>
                    This ticket has been marked as resolved and is now closed to new messages.
                  </div>
                ) : (
                  <form onSubmit={handleSendChatMessage} style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                    <input
                      type="text"
                      placeholder="Type support reply..."
                      style={{
                        flex: 1,
                        border: '1px solid #CBD5E1',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '12px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                    />
                    <button
                      type="submit"
                      style={{
                        background: '#2563EB',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 700
                      }}
                    >
                      Send
                    </button>
                  </form>
                )}
              </div>
            ) : (
              /* TICKETS DASHBOARD & SUBMISSION FORM */
              <>
                {/* Submit Ticket Form */}
                <form onSubmit={handleCreateTicket} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Submit Support Request
                  </h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>DEPARTMENT</label>
                    <div style={{ padding: '8px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
                      {currentUser?.role ? currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1) : 'General'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>ISSUE DETAILS</label>
                    <textarea
                      placeholder="Describe your issue or question in detail..."
                      required
                      style={{
                        height: '70px',
                        padding: '8px',
                        border: '1px solid #CBD5E1',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        fontFamily: 'inherit',
                        resize: 'none',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                      value={newTicketDesc}
                      onChange={(e) => setNewTicketDesc(e.target.value)}
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 700,
                      textAlign: 'center',
                      boxShadow: '0 2px 4px rgba(37,99,235,0.15)'
                    }}
                  >
                    {loading ? 'Submitting...' : 'Submit Support Request'}
                  </button>
                </form>

                {/* Ticket Logs List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h4 style={{ margin: '0 0 2px 0', fontSize: '13px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Your Support Tickets
                  </h4>
                  
                  {/* Tabs */}
                  {(() => {
                    const raisedTickets = tickets.filter(t => 
                      t.status === 'Open' && (
                        t.contact === currentUser?.email || 
                        t.contact === currentUser?.staff_id || 
                        (t.messages && t.messages[0] && (t.messages[0].sender === currentUser?.name || t.messages[0].sender === currentUser?.staff_id))
                      )
                    );
                    const generalTickets = tickets.filter(t => 
                      t.status === 'Open' && 
                      !(t.contact === currentUser?.email || 
                        t.contact === currentUser?.staff_id || 
                        (t.messages && t.messages[0] && (t.messages[0].sender === currentUser?.name || t.messages[0].sender === currentUser?.staff_id)))
                    );
                    const activeList = supportTab === 'raised' ? raisedTickets : generalTickets;

                    return (
                      <>
                        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px', marginBottom: '4px' }}>
                          <button
                            type="button"
                            onClick={() => setSupportTab('raised')}
                            style={{
                              background: supportTab === 'raised' ? '#2563EB' : 'transparent',
                              color: supportTab === 'raised' ? '#FFFFFF' : '#64748B',
                              border: 'none',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.2s',
                              textTransform: 'uppercase',
                              letterSpacing: '0.3px'
                            }}
                          >
                            Raised by You
                            <span style={{
                              background: supportTab === 'raised' ? 'rgba(255,255,255,0.2)' : '#E2E8F0',
                              color: supportTab === 'raised' ? '#FFFFFF' : '#64748B',
                              padding: '1px 6px',
                              borderRadius: '10px',
                              fontSize: '9px',
                              fontWeight: 800
                            }}>
                              {raisedTickets.length}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSupportTab('general')}
                            style={{
                              background: supportTab === 'general' ? '#2563EB' : 'transparent',
                              color: supportTab === 'general' ? '#FFFFFF' : '#64748B',
                              border: 'none',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.2s',
                              textTransform: 'uppercase',
                              letterSpacing: '0.3px'
                            }}
                          >
                            General
                            <span style={{
                              background: supportTab === 'general' ? 'rgba(255,255,255,0.2)' : '#E2E8F0',
                              color: supportTab === 'general' ? '#FFFFFF' : '#64748B',
                              padding: '1px 6px',
                              borderRadius: '10px',
                              fontSize: '9px',
                              fontWeight: 800
                            }}>
                              {generalTickets.length}
                            </span>
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {activeList.length === 0 ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '12px', background: '#F8FAFC', border: '1px dashed #E2E8F0', borderRadius: '8px' }}>
                              {supportTab === 'raised' ? 'No tickets raised by you.' : 'No general support tickets.'}
                            </div>
                          ) : (
                            activeList.map(t => {
                              const raisedDate = t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : t.createdOn || '';
                              return (
                                <div
                                  key={t._id}
                                  onClick={() => setActiveTicket(t)}
                                  style={{
                                    padding: '12px',
                                    background: 'white',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '10px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.transform = 'none'; }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontWeight: 800, fontSize: '12px', color: '#1E293B' }}>{t.id}</span>
                                      <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600 }}>• {raisedDate}</span>
                                    </div>
                                    <span style={{
                                      fontSize: '9px',
                                      fontWeight: 700,
                                      background: t.status === 'Open' ? '#FEF3C7' : '#D1FAE5',
                                      color: t.status === 'Open' ? '#D97706' : '#065F46',
                                      padding: '2px 6px',
                                      borderRadius: '10px'
                                    }}>
                                      {t.status}
                                    </span>
                                  </div>
                                  <p style={{ fontSize: '12px', color: '#475569', margin: '0 0 6px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {t.description}
                                  </p>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#94A3B8' }}>
                                    <span>Dept: {t.department}</span>
                                    {supportTab === 'general' && t.messages && t.messages[0] && (
                                      <span style={{ fontSize: '9px', color: '#64748B', fontWeight: 600 }}>By: {t.messages[0].sender}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* Slide-in keyframe animation */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
