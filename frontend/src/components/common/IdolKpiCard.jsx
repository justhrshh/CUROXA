import React from 'react';

/**
 * IdolKpiCard.jsx
 * Reference healthcare KPI card architecture based on Doctor Live Waiting Queue.
 * Supports 6 clinical palettes: amber, blue, emerald, purple, rose, teal.
 */
const THEMES = {
  amber: {
    bg: 'radial-gradient(circle at 100% 100%, rgba(245, 158, 11, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 45%, #FEF3C7 100%)',
    border: '#FDE68A',
    shadow: '0 8px 24px rgba(245, 158, 11, 0.08)',
    text: '#B45309',
    subText: '#78350F',
    grad: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
    iconShadow: 'rgba(217, 119, 6, 0.3)',
    accent: 'linear-gradient(90deg, #F59E0B, #D97706)'
  },
  blue: {
    bg: 'radial-gradient(circle at 100% 100%, rgba(37, 99, 235, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 45%, #DBEAFE 100%)',
    border: '#BFDBFE',
    shadow: '0 8px 24px rgba(37, 99, 235, 0.08)',
    text: '#1D4ED8',
    subText: '#1E40AF',
    grad: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)',
    iconShadow: 'rgba(37, 99, 235, 0.3)',
    accent: 'linear-gradient(90deg, #3B82F6, #1D4ED8)'
  },
  emerald: {
    bg: 'radial-gradient(circle at 100% 100%, rgba(16, 185, 129, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 45%, #D1FAE5 100%)',
    border: '#A7F3D0',
    shadow: '0 8px 24px rgba(16, 185, 129, 0.08)',
    text: '#047857',
    subText: '#065F46',
    grad: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
    iconShadow: 'rgba(5, 150, 105, 0.3)',
    accent: 'linear-gradient(90deg, #10B981, #059669)'
  },
  purple: {
    bg: 'radial-gradient(circle at 100% 100%, rgba(139, 92, 246, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 45%, #EDE9FE 100%)',
    border: '#DDD6FE',
    shadow: '0 8px 24px rgba(139, 92, 246, 0.08)',
    text: '#6D28D9',
    subText: '#5B21B6',
    grad: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)',
    iconShadow: 'rgba(124, 58, 237, 0.3)',
    accent: 'linear-gradient(90deg, #8B5CF6, #7C3AED)'
  },
  rose: {
    bg: 'radial-gradient(circle at 100% 100%, rgba(244, 63, 94, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFF1F2 45%, #FFE4E6 100%)',
    border: '#FECDD3',
    shadow: '0 8px 24px rgba(244, 63, 94, 0.08)',
    text: '#BE123C',
    subText: '#9F1239',
    grad: 'linear-gradient(135deg, #E11D48 0%, #F43F5E 100%)',
    iconShadow: 'rgba(225, 29, 72, 0.3)',
    accent: 'linear-gradient(90deg, #F43F5E, #E11D48)'
  },
  teal: {
    bg: 'radial-gradient(circle at 100% 100%, rgba(20, 184, 166, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F0FDFA 45%, #CCFBF1 100%)',
    border: '#99F6E4',
    shadow: '0 8px 24px rgba(20, 184, 166, 0.08)',
    text: '#0F766E',
    subText: '#115E59',
    grad: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
    iconShadow: 'rgba(13, 148, 136, 0.3)',
    accent: 'linear-gradient(90deg, #14B8A6, #0D9488)'
  }
};

const IdolKpiCard = ({
  label,
  value,
  unit,
  context,
  icon,
  theme = 'amber',
  onClick,
  active = false,
  className = ''
}) => {
  const t = THEMES[theme] || THEMES.amber;

  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        background: t.bg,
        borderRadius: '16px',
        border: active ? `2px solid ${t.text}` : `1.5px solid ${t.border}`,
        boxShadow: active ? `0 12px 28px ${t.shadow}` : t.shadow,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        minHeight: '110px'
      }}
      onMouseEnter={e => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = `0 12px 30px ${t.shadow}`;
        }
      }}
      onMouseLeave={e => {
        if (onClick) {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = active ? `0 12px 28px ${t.shadow}` : t.shadow;
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', fontWeight: 800, color: t.text, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '10px',
          background: t.grad,
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 3px 8px ${t.iconShadow}`,
          flexShrink: 0
        }}>
          {icon}
        </div>
      </div>
      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", lineHeight: 1 }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: '12px', fontWeight: 700, color: t.text }}>
            {unit}
          </span>
        )}
      </div>
      {context && (
        <div style={{ fontSize: '11.5px', color: t.subText, fontWeight: 650, marginTop: '6px' }}>
          {context}
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: t.accent }} />
    </div>
  );
};

export default IdolKpiCard;
