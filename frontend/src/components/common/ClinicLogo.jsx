import React, { useState, useEffect } from 'react';

/**
 * Reusable Clinic Logo component.
 * 
 * CRITICAL DESIGN REQUIREMENT:
 * Never forces clinic logos into square containers or artificial square cards.
 * Maintains natural aspect ratio (horizontal, vertical, or rectangular) across all viewports.
 * Uses transparent background and contains the full artwork without cropping or distortion.
 *
 * @param {Object} props
 * @param {Object} [props.hospital] - Hospital branding object with { logo, name, ... }
 * @param {string} [props.src] - Direct logo image URL or base64 data
 * @param {string} [props.name] - Clinic / hospital name for monogram fallback or alt text
 * @param {number} [props.maxHeight=44] - Maximum height constraint in px
 * @param {number} [props.maxWidth=180] - Maximum width constraint in px
 * @param {string} [props.className=''] - Additional CSS classes
 * @param {Object} [props.style={}] - Additional inline styles
 * @param {boolean} [props.showMonogramFallback=true] - Whether to show monogram badge if logo is absent
 */
export const ClinicLogo = ({
  hospital,
  src,
  name,
  maxHeight = 44,
  maxWidth = 180,
  className = '',
  style = {},
  showMonogramFallback = true,
  alt
}) => {
  const [imgError, setImgError] = useState(false);

  const rawLogo = src || hospital?.logo || '';
  const cleanLogo = typeof rawLogo === 'string' ? rawLogo.trim() : '';
  const hospitalName = name || hospital?.name || 'Clinic';

  useEffect(() => {
    setImgError(false);
  }, [cleanLogo, hospital?.hospitalId, hospital?.code]);

  // Determine if cleanLogo is an image format (URL, data URI, blob, or raw base64)
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

  if (isImageUrl) {
    return (
      <div
        className={`inline-flex items-center justify-center flex-shrink-0 ${className}`}
        style={{
          maxHeight: `${maxHeight}px`,
          maxWidth: `${maxWidth}px`,
          background: 'transparent',
          ...style
        }}
      >
        <img
          src={imageSrc}
          alt={alt || hospitalName}
          onError={() => setImgError(true)}
          style={{
            maxHeight: `${maxHeight}px`,
            maxWidth: `${maxWidth}px`,
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            background: 'transparent',
            display: 'block'
          }}
        />
      </div>
    );
  }

  if (!showMonogramFallback) {
    return null;
  }

  // Fallback monogram badge if no image is present
  const monogram = (cleanLogo && cleanLogo !== 'H' && cleanLogo.length <= 4 && !isImageUrl)
    ? cleanLogo.toUpperCase()
    : (hospitalName ? hospitalName.slice(0, 2).toUpperCase() : 'CL');

  const badgeSize = Math.min(maxHeight, 44);

  return (
    <div
      className={`inline-flex items-center justify-center font-black select-none text-white flex-shrink-0 ${className}`}
      style={{
        width: `${badgeSize}px`,
        height: `${badgeSize}px`,
        borderRadius: '10px',
        background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 55%, #06B6D4 100%)',
        fontSize: `${Math.round(badgeSize * 0.42)}px`,
        letterSpacing: '0.04em',
        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.2)',
        ...style
      }}
      title={hospitalName}
    >
      {monogram}
    </div>
  );
};

export default ClinicLogo;
