import React, { useState, useRef, useEffect } from 'react';

const SearchableDropdown = ({
  options = [],
  value = '',
  onChange,
  placeholder = 'Select option...',
  disabled = false,
  style = {},
  selectStyle = {}
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  // Normalize options to [{ value, label }]
  const normalizedOptions = options.map(opt => {
    if (typeof opt === 'string' || typeof opt === 'number') {
      return { value: opt, label: String(opt) };
    }
    return { value: opt.value, label: opt.label || String(opt.value) };
  });

  // Find currently selected label
  const selectedOption = normalizedOptions.find(opt => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : '';

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Filter and sort options based on search query
  const filteredOptions = normalizedOptions
    .filter(opt => opt.label.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div 
      ref={containerRef} 
      style={{ 
        position: 'relative', 
        width: '100%', 
        fontFamily: "'Outfit', sans-serif",
        ...style 
      }}
    >
      <style>{`
        .hr-searchable-dropdown-item:hover {
          background-color: #F8FAFC !important;
          color: #1E293B !important;
        }
        @keyframes hrSlideIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      {/* Display box (looks like select input) */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          height: '40px',
          padding: '0 12px',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          background: disabled ? '#F8FAFC' : '#FFFFFF',
          color: disabled ? '#94A3B8' : '#334155',
          fontSize: '13px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          boxShadow: isOpen ? '0 0 0 2px rgba(37, 99, 235, 0.15)' : 'none',
          borderColor: isOpen ? '#2563EB' : '#E2E8F0',
          transition: 'all 0.2s',
          ...selectStyle
        }}
      >
        <span style={{ 
          whiteSpace: 'nowrap', 
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          flex: 1,
          textAlign: 'left'
        }}>
          {displayLabel || placeholder}
        </span>
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          style={{ 
            marginLeft: '8px', 
            transition: 'transform 0.2s',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            color: '#64748B',
            flexShrink: 0
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Floating Options Panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.05)',
            zIndex: 99999,
            overflow: 'hidden',
            animation: 'hrSlideIn 0.15s ease-out'
          }}
          data-lenis-prevent
        >
          {/* Search box inside panel */}
          <div style={{ padding: '8px', borderBottom: '1px solid #F1F5F9', position: 'relative' }}>
            <svg 
              style={{ position: 'absolute', left: '16px', top: '18px', color: '#94A3B8' }} 
              xmlns="http://www.w3.org/2000/svg" 
              width="14" 
              height="14" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5"
            >
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filteredOptions.length > 0) {
                    onChange(filteredOptions[0].value);
                    setIsOpen(false);
                    setSearch('');
                  }
                } else if (e.key === 'Escape') {
                  setIsOpen(false);
                }
              }}
              style={{
                width: '100%',
                height: '34px',
                paddingLeft: '30px',
                paddingRight: '8px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                outline: 'none',
                fontSize: '12px',
                fontWeight: 600,
                color: '#334155'
              }}
              autoFocus
            />
          </div>

          {/* List items */}
          <div 
            style={{ 
              maxHeight: '200px', 
              overflowY: 'auto', 
              padding: '4px' 
            }}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      fontWeight: isSelected ? 800 : 600,
                      color: isSelected ? '#2563EB' : '#475569',
                      background: isSelected ? '#EFF6FF' : 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s'
                    }}
                    className="hr-searchable-dropdown-item"
                  >
                    <span>{opt.label}</span>
                    {isSelected && (
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        width="14" 
                        height="14" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="#2563EB" 
                        strokeWidth="3" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '16px', textAlign: 'center', color: '#94A3B8', fontSize: '12px' }}>
                No options found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableDropdown;
