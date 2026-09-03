import React from 'react';
import { useNavigate } from 'react-router-dom';
import { clearPortalAuthContext, performLogout } from '../utils/api';

const DashboardTemplate = ({ title, role }) => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const handleLogout = () => {
    performLogout(navigate);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F8FAFC' }}>
      <div className="sidebar" style={{ width: '220px', background: '#0F172A', color: 'white', padding: '20px' }}>
        <h2 style={{ marginBottom: '32px' }}>Curoxa {role}</h2>
        <div style={{ marginTop: 'auto', marginBottom: '20px' }}>
          Welcome, {user.name}
        </div>
        <button onClick={handleLogout} className="btn btn-secondary" style={{ width: '100%' }}>Logout</button>
      </div>
      <div style={{ flex: 1, padding: '32px', marginLeft: '220px' }}>
        <h1>{title}</h1>
        <p style={{ marginTop: '16px' }}>This dashboard is restricted to {role} roles.</p>
        <div className="glass-card" style={{ marginTop: '24px', padding: '24px' }}>
          <h3>Migrated HTML Content Placeholder</h3>
          <p>The static HTML design for {role} can be placed here.</p>
        </div>
      </div>
    </div>
  );
};

export default DashboardTemplate;
