import React, { createContext, useContext, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../utils/api';

const PortalBrandingContext = createContext(null);

export const usePortalBranding = () => {
  return useContext(PortalBrandingContext);
};

/**
 * Reusable branding badge component for rendering hospital logo or monogram.
 * Strictly adheres to Curoxa design system:
 * - Real image URL -> <img> with graceful fallback
 * - Monogram / Short string -> CSS gradient badge
 * - Missing / empty -> 2-letter derived monogram
 */
export const HospitalBrandLogo = ({
  hospital,
  size = 44,
  borderRadius = 12,
  fontSize = 16,
  className = '',
  style = {}
}) => {
  const [imgError, setImgError] = useState(false);

  const rawLogo = hospital?.logo || '';
  const cleanLogo = typeof rawLogo === 'string' ? rawLogo.trim() : '';

  // Reset imgError when logo or hospitalId changes
  useEffect(() => {
    setImgError(false);
  }, [cleanLogo, hospital?.hospitalId]);

  if (!hospital) return null;

  // Determine if cleanLogo is an image (URL, data URI, blob, or raw base64)
  const isImageFormat = Boolean(
    cleanLogo &&
    cleanLogo !== 'H' &&
    (
      cleanLogo.startsWith('data:image/') ||
      cleanLogo.startsWith('http://') ||
      cleanLogo.startsWith('https://') ||
      cleanLogo.startsWith('/uploads/') ||
      cleanLogo.startsWith('blob:') ||
      cleanLogo.startsWith('/9j/') ||
      cleanLogo.startsWith('iVBOR') ||
      cleanLogo.startsWith('R0lGOD') ||
      cleanLogo.startsWith('PHN2Zw')
    )
  );

  const imageSrc = cleanLogo.startsWith('/9j/') ? `data:image/jpeg;base64,${cleanLogo}`
    : cleanLogo.startsWith('iVBOR') ? `data:image/png;base64,${cleanLogo}`
    : cleanLogo.startsWith('R0lGOD') ? `data:image/gif;base64,${cleanLogo}`
    : cleanLogo.startsWith('PHN2Zw') ? `data:image/svg+xml;base64,${cleanLogo}`
    : cleanLogo;

  const isImageUrl = !imgError && isImageFormat;

  // Derive monogram fallback: ignore schema default 'H' when computing monogram
  const monogram = (cleanLogo && cleanLogo !== 'H' && cleanLogo.length <= 4 && !isImageUrl)
    ? cleanLogo.toUpperCase()
    : (hospital.name ? hospital.name.slice(0, 2).toUpperCase() : 'HP');

  if (isImageUrl) {
    return (
      <img
        src={imageSrc}
        alt={hospital.name || 'Hospital Logo'}
        onError={() => setImgError(true)}
        className={className}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: `${borderRadius}px`,
          objectFit: 'cover',
          border: '1px solid rgba(226, 232, 240, 0.9)',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
          flexShrink: 0,
          background: '#FFFFFF',
          ...style
        }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${borderRadius}px`,
        background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 55%, #06B6D4 100%)',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 900,
        fontSize: `${fontSize}px`,
        letterSpacing: '0.03em',
        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.22)',
        border: '1.5px solid rgba(255, 255, 255, 0.8)',
        flexShrink: 0,
        userSelect: 'none',
        ...style
      }}
    >
      {monogram}
    </div>
  );
};

/**
 * Generates an SVG data URI favicon for text/monogram logos
 */
export const createMonogramFaviconUri = (text, bgColor = '#2563EB', textColor = '#FFFFFF') => {
  const label = (text || 'HP').slice(0, 2).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='${encodeURIComponent(bgColor)}'/><text x='50%' y='55%' dominant-baseline='central' text-anchor='middle' fill='${encodeURIComponent(textColor)}' font-family='-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' font-size='14' font-weight='900'>${label}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
};

export const PortalBrandingProvider = ({ children, hospitalIdOverride }) => {
  const params = useParams();
  const rawId = hospitalIdOverride || params.hospitalId;
  const hospitalId = rawId ? String(rawId).trim().toUpperCase() : null;

  const [hospital, setHospital] = useState(() => {
    // Check in-memory/storage cache to avoid blank flicker on navigation and page reload
    try {
      const cached = sessionStorage.getItem(`curoxa_portal_${hospitalId}`) || localStorage.getItem(`curoxa_portal_${hospitalId}`);
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });

  const [loading, setLoading] = useState(!hospital && !!hospitalId);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!hospitalId) {
      setLoading(false);
      setError('missing_id');
      return;
    }

    let isMounted = true;
    const fetchBranding = async () => {
      // Only trigger full loading spinner if we don't have any cached data
      if (!hospital) {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await api.get(`/public/portal/${hospitalId}`);
        if (!isMounted) return;

        if (res.data && res.data.hospitalId) {
          setHospital(res.data);
          try {
            sessionStorage.setItem(`curoxa_portal_${hospitalId}`, JSON.stringify(res.data));
            localStorage.setItem(`curoxa_portal_${hospitalId}`, JSON.stringify(res.data));
            localStorage.setItem('curoxa_active_portal_id', hospitalId);
          } catch (storageErr) {
            // Ignore storage quota errors
          }
        } else {
          if (!hospital) setError('not_found');
        }
      } catch (err) {
        if (!isMounted) return;
        if (err.response?.status === 404) {
          setError('not_found');
        } else if (err.response?.status === 403 || err.response?.data?.status === 'Suspended') {
          setError('suspended');
          if (err.response?.data?.name) {
            setHospital({ hospitalId, name: err.response.data.name, status: 'Suspended' });
          }
        } else {
          // If we already have cached data, don't flash an error screen on transient network issue
          if (!hospital) {
            setError('network_error');
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchBranding();

    // Cross-tab and in-tab branding update listener (e.g. after Super Admin saves branding)
    const handleBrandingUpdate = (e) => {
      if (!e?.detail?.hospitalId || e.detail.hospitalId === hospitalId) {
        fetchBranding();
      }
    };
    const handleStorageChange = (e) => {
      if (e.key === `curoxa_portal_${hospitalId}` && e.newValue) {
        try {
          setHospital(JSON.parse(e.newValue));
        } catch (err) {}
      }
    };

    window.addEventListener('curoxa_portal_branding_updated', handleBrandingUpdate);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      isMounted = false;
      window.removeEventListener('curoxa_portal_branding_updated', handleBrandingUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [hospitalId]);

  // White-label dynamic favicon and document title synchronization
  useEffect(() => {
    const originalTitle = document.title;
    let faviconEl = document.getElementById('curoxa-dynamic-favicon') || document.querySelector("link[rel*='icon']");
    const originalFavicon = faviconEl ? faviconEl.getAttribute('href') : '/curoxa_icon_logo.png';

    if (hospital && hospital.name) {
      syncPortalDocumentMetadata(hospital);
    }

    return () => {
      document.title = originalTitle || 'Curoxa - Healthcare Dashboard';
      if (faviconEl) {
        faviconEl.setAttribute('href', originalFavicon || '/curoxa_icon_logo.png');
      }
    };
  }, [hospital]);

  const value = {
    hospitalId,
    hospital,
    loading,
    error,
    isPortalSession: !!hospital
  };

  return (
    <PortalBrandingContext.Provider value={value}>
      {children}
    </PortalBrandingContext.Provider>
  );
};

/**
 * Synchronizes document title and favicon with a given hospital branding object.
 */
export const syncPortalDocumentMetadata = (hospital) => {
  if (!hospital || !hospital.name) return;
  try {
    document.title = `${hospital.name} | Curoxa`;
    let faviconEl = document.getElementById('curoxa-dynamic-favicon') || document.querySelector("link[rel*='icon']");
    if (!faviconEl) return;

    const rawLogo = hospital.logo || '';
    const cleanLogo = typeof rawLogo === 'string' ? rawLogo.trim() : '';
    const isImageFormat = Boolean(
      cleanLogo &&
      cleanLogo !== 'H' &&
      (
        cleanLogo.startsWith('data:image/') ||
        cleanLogo.startsWith('http://') ||
        cleanLogo.startsWith('https://') ||
        cleanLogo.startsWith('/uploads/') ||
        cleanLogo.startsWith('blob:') ||
        cleanLogo.startsWith('/9j/') ||
        cleanLogo.startsWith('iVBOR') ||
        cleanLogo.startsWith('R0lGOD') ||
        cleanLogo.startsWith('PHN2Zw')
      )
    );
    const imageSrc = cleanLogo.startsWith('/9j/') ? `data:image/jpeg;base64,${cleanLogo}`
      : cleanLogo.startsWith('iVBOR') ? `data:image/png;base64,${cleanLogo}`
      : cleanLogo.startsWith('R0lGOD') ? `data:image/gif;base64,${cleanLogo}`
      : cleanLogo.startsWith('PHN2Zw') ? `data:image/svg+xml;base64,${cleanLogo}`
      : cleanLogo;

    let targetFavicon = '/curoxa_icon_logo.png';
    if (isImageFormat) {
      targetFavicon = imageSrc;
    } else if (cleanLogo && cleanLogo !== 'H' && cleanLogo.length <= 4) {
      targetFavicon = createMonogramFaviconUri(cleanLogo, hospital.theme_color || '#2563EB');
    } else if (hospital.name) {
      targetFavicon = createMonogramFaviconUri(hospital.name.slice(0, 2), hospital.theme_color || '#2563EB');
    }

    faviconEl.setAttribute('href', targetFavicon);
  } catch (e) {}
};

/**
 * Restores dynamic document title and favicon from active cached portal branding on page reload.
 * No-op if there is no active portal session (generic Curoxa).
 */
export const restoreActivePortalDocumentMetadata = () => {
  const activeHospital = getActivePortalBranding();
  if (activeHospital) {
    syncPortalDocumentMetadata(activeHospital);
  }
};

/**
 * Synchronous helper to read currently active portal branding from cache (if in a portal session).
 * Used by dashboard sidebars/headers to render hospital identity without extra API requests.
 */
export const getActivePortalBranding = () => {
  try {
    const activeId = localStorage.getItem('curoxa_active_portal_id');
    if (!activeId) return null;
    const cached = sessionStorage.getItem(`curoxa_portal_${activeId}`) || localStorage.getItem(`curoxa_portal_${activeId}`);
    return cached ? JSON.parse(cached) : null;
  } catch (e) {
    return null;
  }
};
