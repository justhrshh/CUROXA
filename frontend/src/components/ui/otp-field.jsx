import React, { createContext, useContext, useRef } from 'react';

const OTPContext = createContext(null);

export const OTPField = ({ length = 6, value = '', onChange, children, className = '', ...props }) => {
  const inputRefs = useRef([]);

  const handleChange = (index, char) => {
    const valArr = (value || '').padEnd(length, ' ').split('');
    valArr[index] = char || ' ';
    const newOtp = valArr.join('').trimEnd();
    if (onChange) onChange(newOtp);

    // Auto focus next input
    if (char && index < length - 1 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      const valArr = (value || '').split('');
      if (!valArr[index] && index > 0 && inputRefs.current[index - 1]) {
        inputRefs.current[index - 1].focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (onChange) onChange(pasted);
    const focusIdx = Math.min(pasted.length, length - 1);
    inputRefs.current[focusIdx]?.focus();
  };

  return (
    <OTPContext.Provider value={{ length, value, handleChange, handleKeyDown, handlePaste, inputRefs }}>
      <div className={`flex items-center justify-center gap-1.5 sm:gap-3 ${className}`} onPaste={handlePaste} {...props}>
        {React.Children.map(children, (child, idx) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child, { index: idx });
          }
          return child;
        })}
      </div>
    </OTPContext.Provider>
  );
};

export const OTPFieldInput = ({ index = 0, className = '', ...props }) => {
  const context = useContext(OTPContext);
  if (!context) return null;

  const { value, handleChange, handleKeyDown, inputRefs } = context;
  const char = (value || '')[index] || '';

  return (
    <input
      ref={(el) => (inputRefs.current[index] = el)}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={1}
      value={char}
      onChange={(e) => {
        const val = e.target.value.replace(/\D/g, '');
        handleChange(index, val.slice(-1));
      }}
      onKeyDown={(e) => handleKeyDown(index, e)}
      className={`w-10 sm:w-12 h-12 sm:h-14 text-center text-lg sm:text-2xl font-bold rounded-xl sm:rounded-2xl border-2 transition-all duration-150 shadow-sm caret-blue-600 flex-shrink-0 ${
        char
          ? 'bg-white border-slate-300 text-slate-900'
          : 'bg-slate-50/80 border-slate-200 text-slate-900'
      } focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/15 focus:outline-none ${className}`}
      {...props}
    />
  );
};
