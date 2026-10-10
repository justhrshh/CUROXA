/**
 * FieldRenderer — Dynamically renders individual master fields adhering strictly
 * to the Master Schema Registry metadata.
 *
 * Rules:
 * - Uses exact clientHeader for UI metadata & Excel alignment.
 * - Formats camelCase headers for clean, modern readability.
 * - Respects readOnly attributes (e.g. S.No, Category, Status).
 * - Distinguishes systemRequired from clientRequired (no fake * on unconfirmed fields).
 * - Compact horizontal layout: Label on left, input on right (height 25px).
 * - Native datalist for sample suggestions without wasting vertical card space.
 */

// Helper to format camelCase / raw headers into clean title-cased labels
function formatLabelDisplay(header) {
  if (!header) return '';
  const trimmed = String(header).trim();
  const known = {
    'itemTypeName': 'Item Type Name',
    'MakeandModelNo': 'Make & Model No.',
    'ManufactureID': 'Manufacture ID',
    'ManufactureName': 'Manufacture Name',
    'MachineID': 'Machine ID',
    'MachineName': 'Machine Name',
    'CatalogNo': 'Catalog No.',
    'PurchasedUnit': 'Purchased Unit',
    'ConsumptionUnit': 'Consumption Unit',
    'PackSize': 'Pack Size',
    'IssueMultiplier': 'Issue Multiplier',
    'ExpiryDateCutoff': 'Expiry Cutoff (Days)',
    'GSTNTax': 'GST / Tax (%)',
    'HSNCode': 'HSN Code',
    'dosageForm': 'Dosage Form',
    'sampleType': 'Sample Type',
    'sampleOption': 'Sample Option',
    'doctorsName': "Doctor's Name",
    'doctorId': 'Doctor ID',
    'requiredPrescription': 'Prescription Req.',
    'itemCode': 'Item Code',
    'itemName': 'Item Name',
    'genericName': 'Generic Name',
    'brandName': 'Brand Name',
    'sNo': 'S.No.'
  };
  if (known[trimmed]) return known[trimmed];
  return trimmed
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

export default function FieldRenderer({
  field,
  value,
  onChange,
  disabled = false,
  error = null,
  layout = 'horizontal',
  labelWidth = '130px',
  departmentList = []
}) {
  const {
    clientHeader,
    fieldKey,
    excelColumn,
    inputType,
    systemRequired,
    optionsSource,
    allowedValues,
    readOnly,
    pricingScope
  } = field;

  const isPricingField = pricingScope === 'HOSPITAL_SPECIFIC';
  const isReadOnly = readOnly;
  const isStrictSelect = (optionsSource === 'CLIENT_CONFIRMED' && Array.isArray(allowedValues) && allowedValues.length > 0) || (fieldKey === 'department' && departmentList.length > 0);
  const selectOptions = fieldKey === 'department' && departmentList.length > 0 ? departmentList : (allowedValues || []);
  const hasSampleSuggestions = optionsSource === 'SAMPLE_VALUES_ONLY' && Array.isArray(allowedValues) && allowedValues.length > 0;

  const displayVal = value !== undefined && value !== null ? value : '';
  const formattedLabel = formatLabelDisplay(clientHeader);

  // Render control element
  const renderControl = () => {
    // 1. Expirable Checkbox Control
    if (fieldKey === 'expirable') {
      const isChecked = displayVal === 'Yes' || displayVal === true || String(displayVal).toLowerCase() === 'yes';
      return (
        <label style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '7px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          height: '24px',
          userSelect: 'none'
        }}>
          <input
            type="checkbox"
            checked={isChecked}
            disabled={disabled}
            onChange={(e) => {
              const nextVal = e.target.checked ? 'Yes' : 'No';
              onChange(fieldKey, nextVal);
            }}
            style={{
              width: '16px',
              height: '16px',
              accentColor: '#2563EB',
              cursor: disabled ? 'not-allowed' : 'pointer',
              margin: 0
            }}
          />
          <span style={{
            fontSize: '11.5px',
            fontWeight: 700,
            color: isChecked ? '#1D4ED8' : '#64748B'
          }}>
            {isChecked ? 'Yes (Expirable Item)' : 'No (Non-Expirable)'}
          </span>
        </label>
      );
    }

    // 2. Conditionally Disabled / Greyed-out Control (e.g. Expiry Cutoff when Expirable is No)
    if (disabled) {
      return (
        <div style={{ position: 'relative', width: '100%' }}>
          <input
            type="text"
            disabled={true}
            value={displayVal !== '' && displayVal !== undefined && displayVal !== null ? displayVal : ''}
            placeholder={fieldKey === 'expiryDateCutoff' ? 'Disabled (Non-Expirable)' : '—'}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              height: '24px',
              border: '1px solid #E2E8F0',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '11.5px',
              color: '#94A3B8',
              background: '#F1F5F9',
              cursor: 'not-allowed'
            }}
          />
        </div>
      );
    }

    // 3. System Read-Only Fields
    if (isReadOnly) {
      // Special badge for Status
      if (fieldKey === 'status') {
        const isActive = String(displayVal).toLowerCase() === 'active';
        return (
          <div style={{
            height: '25px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            background: isActive ? '#F0FDF4' : '#FEF2F2',
            border: isActive ? '1px solid #BBF7D0' : '1px solid #FECACA',
            borderRadius: '4px',
            padding: '0 8px',
            fontSize: '11px',
            color: isActive ? '#15803D' : '#B91C1C',
            fontWeight: 700,
            width: 'fit-content'
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: isActive ? '#22C55E' : '#EF4444'
            }} />
            {displayVal || 'Active'}
          </div>
        );
      }

      // Special badge for Item Code
      if (fieldKey === 'itemCode' && displayVal) {
        return (
          <div style={{
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            background: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: '4px',
            padding: '0 8px',
            fontSize: '11.5px',
            fontFamily: 'monospace',
            color: '#0284C7',
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {displayVal}
          </div>
        );
      }

      return (
        <div style={{
          height: '24px',
          lineHeight: '22px',
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '4px',
          padding: '0 8px',
          fontSize: '11.5px',
          color: '#475569',
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {displayVal || '—'}
        </div>
      );
    }

    if (isStrictSelect) {
      return (
        <select
          value={displayVal}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          style={{
            width: '100%',
            height: '24px',
            border: error ? '1.5px solid #EF4444' : (systemRequired ? '1px solid #94A3B8' : '1px solid #CBD5E1'),
            borderLeft: error ? '3.5px solid #EF4444' : (systemRequired ? '3.5px solid #2563EB' : '1px solid #CBD5E1'),
            borderRadius: '4px',
            padding: '0 6px',
            fontSize: '11.5px',
            color: '#0F172A',
            background: '#FFFFFF',
            outline: 'none',
            cursor: 'pointer',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#2563EB';
            e.target.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.12)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error ? '#EF4444' : (systemRequired ? '1px solid #94A3B8' : '#CBD5E1');
            e.target.style.borderLeft = error ? '3.5px solid #EF4444' : (systemRequired ? '3.5px solid #2563EB' : '#CBD5E1');
            e.target.style.boxShadow = 'none';
          }}
        >
          <option value="">-- Select {formattedLabel} {systemRequired ? '(Required)' : ''} --</option>
          {selectOptions.map((opt) => (
            <option key={String(opt)} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    return (
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          type={inputType === 'number' ? 'number' : 'text'}
          list={hasSampleSuggestions ? `datalist-${fieldKey}` : undefined}
          value={displayVal}
          onChange={(e) => {
            const val = e.target.value;
            onChange(fieldKey, inputType === 'number' ? (val === '' ? '' : Number(val)) : val);
          }}
          placeholder={`Enter ${formattedLabel}${systemRequired ? ' (Required)' : ''}...`}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            height: '24px',
            border: error ? '1.5px solid #EF4444' : (systemRequired ? '1px solid #94A3B8' : '1px solid #CBD5E1'),
            borderLeft: error ? '3.5px solid #EF4444' : (systemRequired ? '3.5px solid #2563EB' : '1px solid #CBD5E1'),
            borderRadius: '4px',
            padding: '2px 8px',
            fontSize: '11.5px',
            color: '#0F172A',
            outline: 'none',
            background: '#FFFFFF',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#2563EB';
            e.target.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.12)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error ? '#EF4444' : (systemRequired ? '1px solid #94A3B8' : '#CBD5E1');
            e.target.style.borderLeft = error ? '3.5px solid #EF4444' : (systemRequired ? '3.5px solid #2563EB' : '#CBD5E1');
            e.target.style.boxShadow = 'none';
          }}
        />

        {hasSampleSuggestions && (
          <datalist id={`datalist-${fieldKey}`}>
            {allowedValues.map((opt) => (
              <option key={String(opt)} value={opt} />
            ))}
          </datalist>
        )}
      </div>
    );
  };

  // Layout: Horizontal (Dense Enterprise Grid)
  if (layout === 'horizontal') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        width: '100%',
        minWidth: 0
      }}>
        {/* Left: Label with tooltip showing Col number */}
        <label
          style={{
            width: labelWidth,
            minWidth: '95px',
            fontSize: '11px',
            fontWeight: systemRequired ? 800 : 600,
            color: systemRequired ? '#0F172A' : '#475569',
            textAlign: 'right',
            paddingRight: '6px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            userSelect: 'none',
            lineHeight: 1.2
          }}
          title={`${clientHeader} (Excel Col ${excelColumn})${systemRequired ? ' [System Required Field]' : ''}${isPricingField ? ' [Clinic Price]' : ''}`}
        >
          <span>{formattedLabel}</span>
          {systemRequired && <span style={{ color: '#E11D48', marginLeft: '3px', fontWeight: 900, fontSize: '13px' }}>*</span>}
          <span style={{ color: '#94A3B8', marginLeft: '2px', fontWeight: 400 }}>:</span>
        </label>

        {/* Right: Input Control + Error message */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {renderControl()}
          {error && (
            <span style={{ fontSize: '10px', color: '#DC2626', fontWeight: 600, marginTop: '1px' }}>
              {error}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Layout: Vertical (Fallback / Modal)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, color: '#1E293B' }}>
          <span>{formattedLabel}</span>
          {systemRequired && <span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>}
        </label>
        <span style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 600, background: '#F1F5F9', padding: '0 4px', borderRadius: '3px' }}>
          Col {excelColumn}
        </span>
      </div>
      {renderControl()}
      {error && (
        <span style={{ fontSize: '10.5px', color: '#DC2626', fontWeight: 600 }}>
          {error}
        </span>
      )}
    </div>
  );
}

