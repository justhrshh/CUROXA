import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../utils/api';
import {
  PACKAGING_PURCHASE_UNITS,
  INTERMEDIATE_PACKAGING_UNITS,
  CONSUMPTION_INDIVIDUAL_UNITS,
  PROCUREMENT_UNITS,
  BREAKDOWN_UNITS,
  CONSUMPTION_UNITS,
  calculateConversionFactor,
  getDerivedConsumptionUnit,
  generatePackSizeDescription,
  validatePackagingUnits
} from '../../utils/packagingUnits';

const DEFAULT_CATEGORIES = ['Drugs', 'Surgical', 'Consumable', 'General Store', 'Equipment', 'Laboratory', 'Diagnostics'];
const DEFAULT_DEPARTMENTS = ['Pharmacy', 'OT', 'General', 'ICU', 'Laboratory', 'Emergency', 'Central Store'];
const ITEM_TYPES = ['Medicine', 'Consumable', 'Reagent', 'Asset', 'Non-Consumable'];
const TEMPERATURE_OPTIONS = ['Room Temperature', '2-8°C (Cold Chain)', 'Deep Freeze (< -20°C)', 'Cool (< 25°C)'];
const BARCODE_OPTIONS = ['System Generated', 'Batch Wise', 'Item Wise', 'Manufacturer Scanned'];
const GST_RATES = [0, 5, 12, 18, 28];

export default function ItemMasterForm({ mode = 'create', itemId: propItemId, showToast, onCancel, onSaveSuccess }) {
  const navigate = useNavigate();
  const routeParams = useParams();
  const effectiveItemId = propItemId || routeParams?.id;
  const isEdit = mode === 'edit' || Boolean(effectiveItemId);

  // Dynamic dropdown options with inline Add New support
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [departments, setDepartments] = useState(DEFAULT_DEPARTMENTS);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [showAddDeptModal, setShowAddDeptModal] = useState(false);
  const [newDeptInput, setNewDeptInput] = useState('');

  // Primary Item Details State
  const [formData, setFormData] = useState({
    itemCode: '',
    itemName: '',
    brandName: '',
    itemDescription: '',
    categoryType: 'Drugs',
    departmentType: 'Pharmacy',
    itemType: 'Medicine',
    hsnCode: '',
    itemSpecification: '',
    makeModelNo: '',
    barcodeOption: 'System Generated',
    defaultGst: 12,
    storageTemperature: 'Room Temperature',
    inventoryRule: 'FEFO', // 'FEFO' or 'FIFO'
    isExpirable: true,
    expiryCutoffDays: 90,
    status: 'Active'
  });

  // Dynamic Packaging & Inventory Builder State
  const [purchasedUnit, setPurchasedUnit] = useState('Box');
  const [isBrokenDown, setIsBrokenDown] = useState(true);
  const [packagingLevels, setPackagingLevels] = useState([
    { levelIndex: 0, parentUnit: 'Box', quantity: 10, childUnit: 'Strip' },
    { levelIndex: 1, parentUnit: 'Strip', quantity: 10, childUnit: 'Tablet' }
  ]);
  const [issueMultiplier, setIssueMultiplier] = useState(1);
  const [isCustomPackDesc, setIsCustomPackDesc] = useState(false);
  const [customPackDesc, setCustomPackDesc] = useState('');

  // Computed Packaging Hierarchy Properties
  const computedConverter = useMemo(() => {
    return calculateConversionFactor(isBrokenDown, packagingLevels);
  }, [isBrokenDown, packagingLevels]);

  const derivedConsumptionUnit = useMemo(() => {
    return getDerivedConsumptionUnit(purchasedUnit, isBrokenDown, packagingLevels);
  }, [purchasedUnit, isBrokenDown, packagingLevels]);

  const autoPackDesc = useMemo(() => {
    return generatePackSizeDescription(purchasedUnit, isBrokenDown, packagingLevels);
  }, [purchasedUnit, isBrokenDown, packagingLevels]);

  const effectivePackDesc = isCustomPackDesc && customPackDesc.trim() ? customPackDesc.trim() : autoPackDesc;

  // Manufacturer Configuration State
  const [manufacturers, setManufacturers] = useState([]);
  const [mfgEntry, setMfgEntry] = useState({
    manufacturer: '',
    catalogNo: '',
    machineCompatibility: '',
    purchasedUnit: 'Box',
    converterFactor: 100,
    packSizeDescription: '10 Strips × 10 Tablets (100 Tablets / Box)',
    consumptionUnit: 'Tablet',
    issueMultiplier: 1,
    isActive: true
  });
  const [editingMfgIndex, setEditingMfgIndex] = useState(null);

  // Component UI State
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [hasActiveStock, setHasActiveStock] = useState(false);

  // Keep manufacturer entry packaging defaults in sync with main packaging
  useEffect(() => {
    if (editingMfgIndex === null && !mfgEntry.manufacturer) {
      setMfgEntry(prev => ({
        ...prev,
        purchasedUnit,
        converterFactor: computedConverter,
        packSizeDescription: effectivePackDesc,
        consumptionUnit: derivedConsumptionUnit,
        issueMultiplier
      }));
    }
  }, [purchasedUnit, computedConverter, effectivePackDesc, derivedConsumptionUnit, issueMultiplier, editingMfgIndex]);

  // Load existing ItemMaster when in edit mode
  useEffect(() => {
    if (isEdit && effectiveItemId) {
      const fetchItem = async () => {
        try {
          setLoading(true);
          setServerError('');
          const res = await api.get(`/item-master/${effectiveItemId}`);
          const item = res.data;
          if (item) {
            setFormData({
              itemCode: item.itemCode || '',
              itemName: item.genericName || item.brandName || '',
              brandName: item.brandName || '',
              itemDescription: item.itemDescription || '',
              categoryType: item.categoryType || 'Drugs',
              departmentType: item.departmentType || 'Pharmacy',
              itemType: item.itemType || 'Medicine',
              hsnCode: item.hsnCode || '',
              itemSpecification: item.itemSpecification || '',
              makeModelNo: item.makeModelNo || '',
              barcodeOption: item.barcodeOption || 'System Generated',
              defaultGst: item.defaultGst !== undefined ? item.defaultGst : 12,
              storageTemperature: item.storageTemperature || 'Room Temperature',
              inventoryRule: item.inventoryRule || 'FEFO',
              isExpirable: item.isExpirable !== undefined ? item.isExpirable : true,
              expiryCutoffDays: item.expiryCutoffDays !== undefined ? item.expiryCutoffDays : 90,
              status: item.status || 'Active'
            });

            // Ensure category & department are in list
            if (item.categoryType && !categories.includes(item.categoryType)) {
              setCategories(prev => [...prev, item.categoryType]);
            }
            if (item.departmentType && !departments.includes(item.departmentType)) {
              setDepartments(prev => [...prev, item.departmentType]);
            }

            // Packaging & Conversion setup
            const loadedPurchUnit = item.purchasedUnit || 'Box';
            const loadedConsUnit = item.consumptionUnit || 'Tablet';
            const loadedConvFactor = Number(item.converterFactor) || 1;
            setPurchasedUnit(loadedPurchUnit);
            setIssueMultiplier(Number(item.issueMultiplier) || 1);

            if (item.packSizeDescription) {
              setCustomPackDesc(item.packSizeDescription);
              setIsCustomPackDesc(true);
            }

            if (item.packagingHierarchy && typeof item.packagingHierarchy === 'object') {
              setIsBrokenDown(Boolean(item.packagingHierarchy.isBrokenDown));
              if (Array.isArray(item.packagingHierarchy.levels) && item.packagingHierarchy.levels.length > 0) {
                setPackagingLevels(item.packagingHierarchy.levels);
              } else if (item.packagingHierarchy.isBrokenDown) {
                setPackagingLevels([
                  { levelIndex: 0, parentUnit: loadedPurchUnit, quantity: loadedConvFactor, childUnit: loadedConsUnit }
                ]);
              } else {
                setPackagingLevels([]);
              }
            } else if (loadedConvFactor === 1 && loadedPurchUnit.toLowerCase() === loadedConsUnit.toLowerCase()) {
              setIsBrokenDown(false);
              setPackagingLevels([]);
            } else {
              setIsBrokenDown(true);
              setPackagingLevels([
                { levelIndex: 0, parentUnit: loadedPurchUnit, quantity: loadedConvFactor, childUnit: loadedConsUnit }
              ]);
            }

            // Populate manufacturers array
            if (Array.isArray(item.manufacturers) && item.manufacturers.length > 0) {
              setManufacturers(item.manufacturers);
            } else if (item.manufacturer) {
              setManufacturers([{
                manufacturer: item.manufacturer,
                catalogNo: item.catalogNo || '',
                machineCompatibility: item.machineCompatibility || '',
                purchasedUnit: loadedPurchUnit,
                converterFactor: loadedConvFactor,
                packSizeDescription: item.packSizeDescription || '',
                consumptionUnit: loadedConsUnit,
                issueMultiplier: item.issueMultiplier || 1,
                isActive: true
              }]);
            }
          }
        } catch (err) {
          console.error('Failed to load item master:', err);
          const msg = err.response?.data?.error || err.message || 'Failed to load item master.';
          setServerError(msg);
          if (showToast) showToast(msg, 'error');
        } finally {
          setLoading(false);
        }
      };

      fetchItem();

      // Check if active stock exists for mutability warning
      const checkStock = async () => {
        try {
          const res = await api.get(`/medicines?itemMasterId=${effectiveItemId}`);
          const batches = res.data?.data || res.data || [];
          const inStock = batches.some(b => (b.availableQuantity || b.stock || 0) > 0);
          setHasActiveStock(inStock);
        } catch (e) {
          // Non-blocking
        }
      };
      checkStock();
    }
  }, [isEdit, effectiveItemId]);

  // Handle Field Changes
  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  // Packaging Hierarchy Handlers
  const handlePurchasedUnitChange = (newPUnit) => {
    if (hasActiveStock) return;
    setPurchasedUnit(newPUnit);

    // If item is single unit (e.g. Bottle, Vial, Tube, Piece) and not currently broken down, keep as-is
    const singleUnits = ['Bottle', 'Vial', 'Tube', 'Ampoule', 'Piece'];
    if (singleUnits.includes(newPUnit) && !isBrokenDown) {
      setIsBrokenDown(false);
      setPackagingLevels([]);
      return;
    }

    if (isBrokenDown && packagingLevels.length > 0) {
      setPackagingLevels(prev => {
        const updated = [...prev];
        let child = updated[0].childUnit;
        if (child && child.toLowerCase() === newPUnit.toLowerCase()) {
          child = newPUnit === 'Box' ? 'Strip' : 'Piece';
        }
        updated[0] = { ...updated[0], parentUnit: newPUnit, childUnit: child };
        return updated;
      });
    }
  };

  const handleSelectPackagingMode = (targetMode) => {
    if (hasActiveStock) return;

    if (targetMode === 'as_is') {
      setIsBrokenDown(false);
      setPackagingLevels([]);
      setErrors(prev => ({ ...prev, packagingHierarchy: null }));
    } else if (targetMode === 'direct') {
      setIsBrokenDown(true);
      setErrors(prev => ({ ...prev, packagingHierarchy: null }));
      let defaultChild = 'Mask';
      if (purchasedUnit === 'Strip') defaultChild = 'Tablet';
      else if (purchasedUnit === 'Carton') defaultChild = 'Piece';
      else if (purchasedUnit === 'Box') defaultChild = 'Mask';
      else defaultChild = 'Piece';

      if (packagingLevels.length >= 1) {
        const first = packagingLevels[0];
        let child = first.childUnit;
        if (!child || child.toLowerCase() === purchasedUnit.toLowerCase()) {
          child = defaultChild;
        }
        setPackagingLevels([{ levelIndex: 0, parentUnit: purchasedUnit, quantity: Number(first.quantity) || 50, childUnit: child }]);
      } else {
        setPackagingLevels([{ levelIndex: 0, parentUnit: purchasedUnit, quantity: 50, childUnit: defaultChild }]);
      }
    } else if (targetMode === 'multi') {
      setIsBrokenDown(true);
      setErrors(prev => ({ ...prev, packagingHierarchy: null }));
      if (packagingLevels.length >= 2) {
        // Keep existing multi-level
      } else if (packagingLevels.length === 1) {
        let intermediate = packagingLevels[0].childUnit;
        if (!intermediate || intermediate.toLowerCase() === purchasedUnit.toLowerCase() || intermediate.toLowerCase() === 'tablet' || intermediate.toLowerCase() === 'capsule') {
          intermediate = purchasedUnit === 'Carton' ? 'Box' : 'Strip';
        }
        let finalChild = 'Tablet';
        if (intermediate.toLowerCase() === 'box') finalChild = 'Strip';
        else if (intermediate.toLowerCase() === 'pack') finalChild = 'Mask';
        else finalChild = 'Tablet';

        setPackagingLevels([
          { levelIndex: 0, parentUnit: purchasedUnit, quantity: Number(packagingLevels[0].quantity) || 10, childUnit: intermediate },
          { levelIndex: 1, parentUnit: intermediate, quantity: 10, childUnit: finalChild }
        ]);
      } else {
        const intermediate = purchasedUnit === 'Carton' ? 'Box' : 'Strip';
        const finalChild = intermediate === 'Box' ? 'Strip' : 'Tablet';
        setPackagingLevels([
          { levelIndex: 0, parentUnit: purchasedUnit, quantity: 10, childUnit: intermediate },
          { levelIndex: 1, parentUnit: intermediate, quantity: 10, childUnit: finalChild }
        ]);
      }
    }
  };

  const handlePackagingModeChange = (brokenDown) => {
    handleSelectPackagingMode(brokenDown ? 'multi' : 'as_is');
  };

  const handleLevelChange = (index, field, value) => {
    if (hasActiveStock) return;
    setPackagingLevels(prev => {
      const updated = [...prev];
      const current = { ...updated[index] };
      if (field === 'quantity') {
        const val = Number(value);
        current.quantity = Number.isFinite(val) && val >= 1 ? val : value;
      } else if (field === 'childUnit') {
        current.childUnit = value;
        // Automatically cascade childUnit to next level's parentUnit
        if (updated[index + 1]) {
          let nextChild = updated[index + 1].childUnit;
          // If next child matches new parent unit, pick a different child unit
          if (nextChild && nextChild.toLowerCase() === value.toLowerCase()) {
            nextChild = value.toLowerCase() === 'strip' ? 'Tablet' : 'Piece';
          }
          updated[index + 1] = { ...updated[index + 1], parentUnit: value, childUnit: nextChild };
        }
      }
      updated[index] = current;
      return updated;
    });

    if (errors.packagingHierarchy) {
      setErrors(prev => ({ ...prev, packagingHierarchy: null }));
    }
  };

  const handleAddPackagingLevel = () => {
    if (hasActiveStock) return;
    setPackagingLevels(prev => {
      const last = prev[prev.length - 1];
      const parentUnit = last ? (last.childUnit || 'Unit') : purchasedUnit;
      let defaultChild = 'Tablet';
      if (parentUnit.toLowerCase() === 'tablet') defaultChild = 'Piece';
      else if (parentUnit.toLowerCase().includes('strip')) defaultChild = 'Tablet';
      else if (parentUnit.toLowerCase().includes('box')) defaultChild = 'Strip';
      else defaultChild = 'Piece';

      return [
        ...prev,
        {
          levelIndex: prev.length,
          parentUnit,
          quantity: 10,
          childUnit: defaultChild
        }
      ];
    });
  };

  const handleRemovePackagingLevel = (index) => {
    if (hasActiveStock || packagingLevels.length <= 1) return;
    setPackagingLevels(prev => {
      const filtered = prev.filter((_, i) => i !== index);
      return filtered.map((lvl, idx) => {
        const parent = idx === 0 ? purchasedUnit : filtered[idx - 1].childUnit;
        return { ...lvl, levelIndex: idx, parentUnit: parent };
      });
    });
  };

  // Manufacturer Configuration Entry Handlers
  const handleAddOrUpdateMfg = (e) => {
    e.preventDefault();
    if (!mfgEntry.manufacturer.trim()) {
      setErrors(prev => ({ ...prev, mfg_manufacturer: 'Manufacturer Company is required' }));
      return;
    }
    const conv = Number(mfgEntry.converterFactor);
    if (!Number.isFinite(conv) || conv < 1) {
      setErrors(prev => ({ ...prev, mfg_converter: 'Converter must be at least 1' }));
      return;
    }

    setErrors(prev => ({ ...prev, mfg_manufacturer: null, mfg_converter: null }));

    const updatedRow = {
      ...mfgEntry,
      manufacturer: mfgEntry.manufacturer.trim(),
      catalogNo: mfgEntry.catalogNo.trim(),
      machineCompatibility: mfgEntry.machineCompatibility.trim(),
      converterFactor: conv,
      issueMultiplier: Number(mfgEntry.issueMultiplier) || 1
    };

    if (editingMfgIndex !== null) {
      const updated = [...manufacturers];
      updated[editingMfgIndex] = updatedRow;
      setManufacturers(updated);
      setEditingMfgIndex(null);
    } else {
      setManufacturers(prev => [...prev, updatedRow]);
    }

    // Reset entry controls to main packaging values
    setMfgEntry({
      manufacturer: '',
      catalogNo: '',
      machineCompatibility: '',
      purchasedUnit,
      converterFactor: computedConverter,
      packSizeDescription: effectivePackDesc,
      consumptionUnit: derivedConsumptionUnit,
      issueMultiplier,
      isActive: true
    });
  };

  const handleEditMfg = (index) => {
    const target = manufacturers[index];
    if (!target) return;
    setMfgEntry({ ...target });
    setEditingMfgIndex(index);
  };

  const handleToggleMfgActive = (index) => {
    setManufacturers(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], isActive: !copy[index].isActive };
      return copy;
    });
  };

  const handleRemoveMfg = (index) => {
    setManufacturers(prev => prev.filter((_, i) => i !== index));
    if (editingMfgIndex === index) {
      setEditingMfgIndex(null);
      setMfgEntry({
        manufacturer: '',
        catalogNo: '',
        machineCompatibility: '',
        purchasedUnit,
        converterFactor: computedConverter,
        packSizeDescription: effectivePackDesc,
        consumptionUnit: derivedConsumptionUnit,
        issueMultiplier,
        isActive: true
      });
    }
  };

  // Add custom Category
  const handleAddNewCategory = () => {
    const trimmed = newCategoryInput.trim();
    if (trimmed && !categories.includes(trimmed)) {
      setCategories(prev => [...prev, trimmed]);
      setFormData(prev => ({ ...prev, categoryType: trimmed }));
    }
    setNewCategoryInput('');
    setShowAddCategoryModal(false);
  };

  // Add custom Department
  const handleAddNewDept = () => {
    const trimmed = newDeptInput.trim();
    if (trimmed && !departments.includes(trimmed)) {
      setDepartments(prev => [...prev, trimmed]);
      setFormData(prev => ({ ...prev, departmentType: trimmed }));
    }
    setNewDeptInput('');
    setShowAddDeptModal(false);
  };

  // Reset form to defaults
  const handleReset = () => {
    if (window.confirm('Reset all fields to default values?')) {
      setFormData({
        itemCode: '',
        itemName: '',
        brandName: '',
        itemDescription: '',
        categoryType: 'Drugs',
        departmentType: 'Pharmacy',
        itemType: 'Medicine',
        hsnCode: '',
        itemSpecification: '',
        makeModelNo: '',
        barcodeOption: 'System Generated',
        defaultGst: 12,
        storageTemperature: 'Room Temperature',
        inventoryRule: 'FEFO',
        isExpirable: true,
        expiryCutoffDays: 90,
        status: 'Active'
      });
      setPurchasedUnit('Box');
      setIsBrokenDown(true);
      setPackagingLevels([
        { levelIndex: 0, parentUnit: 'Box', quantity: 10, childUnit: 'Strip' },
        { levelIndex: 1, parentUnit: 'Strip', quantity: 10, childUnit: 'Tablet' }
      ]);
      setIssueMultiplier(1);
      setIsCustomPackDesc(false);
      setCustomPackDesc('');
      setManufacturers([]);
      setErrors({});
      setServerError('');
    }
  };

  // Validate form
  const validateForm = () => {
    const newErrors = {};

    if (!formData.itemName.trim()) {
      newErrors.itemName = 'Item Name is required.';
    }
    if (!formData.categoryType) {
      newErrors.categoryType = 'Category Type is required.';
    }
    if (!formData.departmentType) {
      newErrors.departmentType = 'Department Type is required.';
    }
    if (!formData.itemType) {
      newErrors.itemType = 'Item Type is required.';
    }
    if (!formData.hsnCode.trim()) {
      newErrors.hsnCode = 'HSN Code is required.';
    }

    if (!purchasedUnit.trim()) {
      newErrors.purchasedUnit = 'Purchased Unit is required.';
    }

    if (isBrokenDown) {
      if (!packagingLevels.length) {
        newErrors.packagingHierarchy = 'At least one packaging breakdown level is required when broken down mode is enabled.';
      } else {
        const hierarchyErr = validatePackagingUnits(purchasedUnit, isBrokenDown, packagingLevels);
        if (hierarchyErr) {
          newErrors.packagingHierarchy = hierarchyErr;
        }
        for (let i = 0; i < packagingLevels.length; i++) {
          const lvl = packagingLevels[i];
          const q = Number(lvl.quantity);
          if (!Number.isFinite(q) || q < 1) {
            newErrors[`level_qty_${i}`] = `Level ${i + 1} quantity must be 1 or greater.`;
          }
          if (!lvl.childUnit || !lvl.childUnit.trim()) {
            newErrors[`level_unit_${i}`] = `Level ${i + 1} unit is required.`;
          }
        }
      }
    }

    if (computedConverter < 1) {
      newErrors.converterFactor = 'Calculated conversion factor must be at least 1.';
    }

    if (!derivedConsumptionUnit.trim()) {
      newErrors.consumptionUnit = 'Inventory Consumption Unit is required.';
    }

    if (formData.isExpirable) {
      const cutoff = Number(formData.expiryCutoffDays);
      if (!Number.isFinite(cutoff) || cutoff < 0) {
        newErrors.expiryCutoffDays = 'Expiry cutoff must be 0 or more days.';
      }
    }

    // Require at least one manufacturer configuration (either in table or in entry form)
    if (manufacturers.length === 0 && !mfgEntry.manufacturer.trim()) {
      newErrors.manufacturers = 'At least one Manufacturer Configuration is required for store cataloging.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validateForm()) {
      const firstError = Object.values(errors)[0] || 'Please complete all required fields.';
      if (showToast) showToast(firstError, 'error');
      window.scrollTo({ top: 100, behavior: 'smooth' });
      return;
    }

    try {
      setSaving(true);
      setServerError('');

      // Auto-include entry area manufacturer if user entered it but forgot to click "+ Add"
      let finalManufacturers = [...manufacturers];
      if (mfgEntry.manufacturer.trim()) {
        const rowFromEntry = {
          ...mfgEntry,
          manufacturer: mfgEntry.manufacturer.trim(),
          catalogNo: mfgEntry.catalogNo.trim(),
          machineCompatibility: mfgEntry.machineCompatibility.trim(),
          converterFactor: Number(mfgEntry.converterFactor) || computedConverter,
          issueMultiplier: Number(mfgEntry.issueMultiplier) || 1
        };
        if (editingMfgIndex !== null) {
          finalManufacturers[editingMfgIndex] = rowFromEntry;
        } else if (!finalManufacturers.some(m => m.manufacturer.toLowerCase() === rowFromEntry.manufacturer.toLowerCase())) {
          finalManufacturers.push(rowFromEntry);
        }
      }

      const primaryMfg = finalManufacturers[0] || {};

      const payload = {
        itemCode: isEdit ? formData.itemCode : undefined,
        genericName: formData.itemName.trim(),
        brandName: (formData.brandName || formData.itemName).trim(),
        itemName: formData.itemName.trim(),
        itemDescription: formData.itemDescription.trim(),
        categoryType: formData.categoryType,
        departmentType: formData.departmentType,
        itemType: formData.itemType,
        hsnCode: formData.hsnCode.trim(),
        itemSpecification: formData.itemSpecification.trim(),
        makeModelNo: formData.makeModelNo.trim(),
        barcodeOption: formData.barcodeOption,
        defaultGst: Number(formData.defaultGst) || 0,
        storageTemperature: formData.storageTemperature,
        inventoryRule: formData.inventoryRule,
        isExpirable: Boolean(formData.isExpirable),
        expiryCutoffDays: formData.isExpirable ? (Number(formData.expiryCutoffDays) || 0) : 0,

        // Packaging & Inventory (Derived & Authoritative)
        purchasedUnit: purchasedUnit.trim(),
        converterFactor: computedConverter,
        packSizeDescription: effectivePackDesc,
        consumptionUnit: derivedConsumptionUnit.trim(),
        issueMultiplier: Number(issueMultiplier) || 1,
        packagingHierarchy: {
          isBrokenDown,
          levels: isBrokenDown ? packagingLevels : []
        },

        // Manufacturer Hierarchy
        manufacturer: primaryMfg.manufacturer || '',
        catalogNo: primaryMfg.catalogNo || '',
        machineCompatibility: primaryMfg.machineCompatibility || '',
        manufacturers: finalManufacturers,

        status: formData.status
      };

      if (isEdit) {
        await api.put(`/item-master/${effectiveItemId}`, payload);
        if (showToast) showToast('Item Master updated successfully', 'success');
      } else {
        await api.post('/item-master', payload);
        if (showToast) showToast('Item Master created successfully', 'success');
      }

      if (onSaveSuccess) {
        onSaveSuccess();
      } else {
        navigate('/procurement/item-master');
      }
    } catch (err) {
      console.error('Save item master error:', err);
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to save item master.';
      setServerError(msg);
      if (showToast) showToast(msg, 'error');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate('/procurement/item-master');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', margin: '20px 0' }}>
        <div style={{ display: 'inline-block', width: '36px', height: '36px', border: '3.5px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ marginTop: '14px', fontWeight: 700, color: '#334155', fontSize: '15px' }}>Loading Store Item Master...</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: '1240px', margin: '0 auto', width: '100%', paddingBottom: '90px' }}>
      
      {/* 1. TOP PAGE HEADER & BREADCRUMB */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '14px',
        border: '1px solid #E2E8F0',
        padding: '20px 24px',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handleBack}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#F1F5F9',
                border: '1px solid #CBD5E1',
                padding: '6px 12px',
                borderRadius: '8px',
                color: '#334155',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <span>←</span> Back to Item Master
            </button>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 10px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              background: isEdit ? '#EFF6FF' : '#F0FDF4',
              color: isEdit ? '#1D4ED8' : '#15803D',
              border: `1px solid ${isEdit ? '#BFDBFE' : '#BBF7D0'}`
            }}>
              {isEdit ? `EDIT MODE — ${formData.itemCode || 'CATALOG ITEM'}` : 'NEW STORE ITEM ENTRY'}
            </span>
          </div>

          <h1 style={{ margin: '6px 0 0', fontSize: '24px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif" }}>
            ITEM MASTER
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748B', fontWeight: 500 }}>
            Manage the hospital's canonical store and inventory item catalog.
          </p>
        </div>

        {/* Top-Right Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isEdit ? (
            <>
              <button
                type="button"
                onClick={handleBack}
                disabled={saving}
                style={{
                  background: '#FFFFFF',
                  color: '#475569',
                  border: '1px solid #CBD5E1',
                  padding: '9px 18px',
                  borderRadius: '9px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                style={{
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '9px 22px',
                  borderRadius: '9px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {saving ? 'Saving Changes...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                style={{
                  background: '#FFFFFF',
                  color: '#64748B',
                  border: '1px solid #CBD5E1',
                  padding: '9px 18px',
                  borderRadius: '9px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                style={{
                  background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '9px 24px',
                  borderRadius: '9px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {saving ? 'Saving Item...' : 'Save Item'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* SERVER ERROR ALERT */}
      {serverError && (
        <div style={{
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '12px',
          padding: '14px 18px',
          color: '#991B1B',
          fontSize: '13px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <span>{serverError}</span>
        </div>
      )}

      {/* ACTIVE STOCK IMMUTABILITY GUARD NOTICE */}
      {isEdit && hasActiveStock && (
        <div style={{
          background: '#FFFBEB',
          border: '1px solid #FDE68A',
          borderRadius: '12px',
          padding: '14px 18px',
          color: '#92400E',
          fontSize: '12.5px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{ fontSize: '18px' }}>🔒</span>
          <span>
            <strong>Active Inventory Guard Active:</strong> This item has active batches currently in clinical stock. Packaging units and Conversion Factor cannot be changed to prevent corrupting inventory valuations and dispensing integrity.
          </span>
        </div>
      )}

      {/* FORM WRAPPER */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
        
        {/* 2. SECTION — ITEM DETAILS (Two Column Modern Form Grid) */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.02)',
          overflow: 'hidden'
        }}>
          {/* Section Header */}
          <div style={{
            padding: '16px 22px',
            background: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ITEM DETAILS
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                Classification, departmental routing, clinical specification, and regulatory identifiers.
              </p>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '4px 10px', borderRadius: '6px' }}>
              Step 1 of 3
            </span>
          </div>

          <div style={{ padding: '22px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
              gap: '24px'
            }}>
              
              {/* LEFT COLUMN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* Category Type * */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
                      Category Type <span style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAddCategoryModal(true)}
                      style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                    >
                      + Add New
                    </button>
                  </div>
                  <select
                    value={formData.categoryType}
                    onChange={(e) => handleFieldChange('categoryType', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${errors.categoryType ? '#EF4444' : '#CBD5E1'}`,
                      fontSize: '13px',
                      color: '#0F172A',
                      background: '#FFFFFF'
                    }}
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {errors.categoryType && (
                    <div style={{ color: '#DC2626', fontSize: '11.5px', marginTop: '4px' }}>{errors.categoryType}</div>
                  )}
                </div>

                {/* Department Type * */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
                      Department Type <span style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAddDeptModal(true)}
                      style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                    >
                      + Add New
                    </button>
                  </div>
                  <select
                    value={formData.departmentType}
                    onChange={(e) => handleFieldChange('departmentType', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${errors.departmentType ? '#EF4444' : '#CBD5E1'}`,
                      fontSize: '13px',
                      color: '#0F172A',
                      background: '#FFFFFF'
                    }}
                  >
                    {departments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  {errors.departmentType && (
                    <div style={{ color: '#DC2626', fontSize: '11.5px', marginTop: '4px' }}>{errors.departmentType}</div>
                  )}
                </div>

                {/* Item Type * */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Item Type <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <select
                    value={formData.itemType}
                    onChange={(e) => handleFieldChange('itemType', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${errors.itemType ? '#EF4444' : '#CBD5E1'}`,
                      fontSize: '13px',
                      color: '#0F172A',
                      background: '#FFFFFF'
                    }}
                  >
                    {ITEM_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {errors.itemType && (
                    <div style={{ color: '#DC2626', fontSize: '11.5px', marginTop: '4px' }}>{errors.itemType}</div>
                  )}
                </div>

                {/* HSN Code * */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    HSN Code <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.hsnCode}
                    onChange={(e) => handleFieldChange('hsnCode', e.target.value)}
                    placeholder="e.g. 30049099"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${errors.hsnCode ? '#EF4444' : '#CBD5E1'}`,
                      fontSize: '13px',
                      color: '#0F172A',
                      boxSizing: 'border-box'
                    }}
                  />
                  {errors.hsnCode ? (
                    <div style={{ color: '#DC2626', fontSize: '11.5px', marginTop: '4px' }}>{errors.hsnCode}</div>
                  ) : (
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
                      Harmonized System of Nomenclature code for statutory GST computation.
                    </div>
                  )}
                </div>

                {/* Item Specification */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Item Specification
                  </label>
                  <textarea
                    rows={2}
                    value={formData.itemSpecification}
                    onChange={(e) => handleFieldChange('itemSpecification', e.target.value)}
                    placeholder="Strength, composition, formulation (e.g. IP/BP, 500mg, film-coated)"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      color: '#0F172A',
                      boxSizing: 'border-box',
                      resize: 'vertical'
                    }}
                  />
                </div>

                {/* Make / Model No. */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Make / Model No.
                  </label>
                  <input
                    type="text"
                    value={formData.makeModelNo}
                    onChange={(e) => handleFieldChange('makeModelNo', e.target.value)}
                    placeholder="e.g. MK-2026 / Model RX-100"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      color: '#0F172A',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Barcode Option */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Barcode Option
                  </label>
                  <select
                    value={formData.barcodeOption}
                    onChange={(e) => handleFieldChange('barcodeOption', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      color: '#0F172A',
                      background: '#FFFFFF'
                    }}
                  >
                    {BARCODE_OPTIONS.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

              </div>

              {/* RIGHT COLUMN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* Item Name * */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Item Name (Generic / Chemical Title) <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.itemName}
                    onChange={(e) => handleFieldChange('itemName', e.target.value)}
                    placeholder="e.g. Paracetamol 500mg Tablets, Surgical Gloves 7.5, N95 Mask"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${errors.itemName ? '#EF4444' : '#CBD5E1'}`,
                      fontSize: '13px',
                      color: '#0F172A',
                      fontWeight: 600,
                      boxSizing: 'border-box'
                    }}
                  />
                  {errors.itemName ? (
                    <div style={{ color: '#DC2626', fontSize: '11.5px', marginTop: '4px' }}>{errors.itemName}</div>
                  ) : (
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
                      Primary canonical generic or catalog name across hospital operations.
                    </div>
                  )}
                </div>

                {/* Brand / Trade Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Brand / Trade Name <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>(For strict brand-isolated dispensing)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.brandName}
                    onChange={(e) => handleFieldChange('brandName', e.target.value)}
                    placeholder="e.g. Dolo 500, Calpol 500 (Defaults to Item Name if empty)"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      color: '#0F172A',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Item Description */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Item Description
                  </label>
                  <textarea
                    rows={2}
                    value={formData.itemDescription}
                    onChange={(e) => handleFieldChange('itemDescription', e.target.value)}
                    placeholder="Extended warehouse handling, storage notes, or clinical guidelines"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      color: '#0F172A',
                      boxSizing: 'border-box',
                      resize: 'vertical'
                    }}
                  />
                </div>

                {/* Item Code (System Generated) */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Item Code <span style={{ fontSize: '11px', color: '#059669', fontWeight: 700 }}>(System Generated)</span>
                  </label>
                  <div style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: '#F1F5F9',
                    border: '1px dashed #CBD5E1',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: formData.itemCode ? '#1E40AF' : '#64748B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span>{formData.itemCode || '[ Auto-generated upon Save: ITM-YYYY-XXXX ]'}</span>
                    <span style={{ fontSize: '10.5px', textTransform: 'uppercase', background: '#E2E8F0', padding: '2px 8px', borderRadius: '4px', color: '#475569' }}>
                      Canonical Sequence
                    </span>
                  </div>
                </div>

                {/* GST Tax % & Temperature Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      GST Tax %
                    </label>
                    <select
                      value={formData.defaultGst}
                      onChange={(e) => handleFieldChange('defaultGst', Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13px',
                        color: '#0F172A',
                        background: '#FFFFFF'
                      }}
                    >
                      {GST_RATES.map(r => (
                        <option key={r} value={r}>{r}% GST</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      Storage Temperature
                    </label>
                    <select
                      value={formData.storageTemperature}
                      onChange={(e) => handleFieldChange('storageTemperature', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13px',
                        color: '#0F172A',
                        background: '#FFFFFF'
                      }}
                    >
                      {TEMPERATURE_OPTIONS.map(temp => (
                        <option key={temp} value={temp}>{temp}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Issue in FIFO Order Toggle */}
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#1E293B' }}>
                      Issue Rule: {formData.inventoryRule === 'FIFO' ? 'FIFO (First In First Out)' : 'FEFO (First Expiry First Out)'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                      {formData.inventoryRule === 'FIFO' ? 'Stock consumed strictly by receipt sequence' : 'Recommended: Earliest expiry batch dispensed first'}
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={formData.inventoryRule === 'FIFO'}
                      onChange={(e) => handleFieldChange('inventoryRule', e.target.checked ? 'FIFO' : 'FEFO')}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    FIFO Mode
                  </label>
                </div>

                {/* Expiry Cutoff & Expirable Controls */}
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: formData.isExpirable ? '#FFF7ED' : '#F1F5F9',
                  border: `1px solid ${formData.isExpirable ? '#FFEDD5' : '#E2E8F0'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: formData.isExpirable ? '#9A3412' : '#475569' }}>
                        Is Expirable Item
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        Requires mandatory batch expiry tracking upon GRN receipt.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.isExpirable}
                      onChange={(e) => handleFieldChange('isExpirable', e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </div>

                  {formData.isExpirable && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid #FFEDD5', paddingTop: '10px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#7C2D12', whiteSpace: 'nowrap' }}>
                        Expiry Date Cutoff (Days):
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.expiryCutoffDays}
                        onChange={(e) => handleFieldChange('expiryCutoffDays', Number(e.target.value))}
                        style={{
                          width: '100px',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: `1px solid ${errors.expiryCutoffDays ? '#EF4444' : '#FDBA74'}`,
                          fontSize: '13px',
                          fontWeight: 700,
                          color: '#7C2D12',
                          background: '#FFFFFF'
                        }}
                      />
                      <span style={{ fontSize: '11px', color: '#9A3412' }}>
                        Minimum days before expiry for GRN inwarding acceptance.
                      </span>
                    </div>
                  )}
                </div>

              </div>

            </div>
          </div>
        </div>

        {/* 3. SECTION — DYNAMIC PACKAGING & INVENTORY BUILDER (COMPACT & INTUITIVE) */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.02)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '14px 20px',
            background: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                PACKAGING & INVENTORY
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#64748B' }}>
                Configure procurement packaging and intelligent unit conversion for medicines and general store items.
              </p>
            </div>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#166534', background: '#DCFCE7', padding: '3px 8px', borderRadius: '6px' }}>
              Step 2 of 3
            </span>
          </div>

          <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* COMPACT ROW 1: Purchased Unit + Packaging Structure Selector */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              gap: '16px',
              paddingBottom: '14px',
              borderBottom: '1px solid #F1F5F9'
            }}>
              {/* Purchased Unit Dropdown */}
              <div style={{ width: '220px', flexShrink: 0 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#1E293B', marginBottom: '5px' }}>
                  Purchased Unit <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <select
                  value={purchasedUnit}
                  disabled={isEdit && hasActiveStock}
                  onChange={(e) => handlePurchasedUnitChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${errors.purchasedUnit ? '#EF4444' : '#CBD5E1'}`,
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#0F172A',
                    background: (isEdit && hasActiveStock) ? '#F1F5F9' : '#FFFFFF'
                  }}
                >
                  {PACKAGING_PURCHASE_UNITS.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              {/* Packaging Structure Mode Selector (Compact Pills) */}
              <div style={{ flex: '1 1 400px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#1E293B', marginBottom: '5px' }}>
                  Packaging Structure
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={isEdit && hasActiveStock}
                    onClick={() => handleSelectPackagingMode('as_is')}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      border: `1.5px solid ${!isBrokenDown ? '#2563EB' : '#E2E8F0'}`,
                      background: !isBrokenDown ? '#EFF6FF' : '#FFFFFF',
                      color: !isBrokenDown ? '#1D4ED8' : '#475569',
                      fontWeight: !isBrokenDown ? 800 : 600,
                      fontSize: '12px',
                      cursor: (isEdit && hasActiveStock) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Complete Unit (e.g. 1 Bottle = 1 Bottle)
                  </button>

                  <button
                    type="button"
                    disabled={isEdit && hasActiveStock}
                    onClick={() => handleSelectPackagingMode('direct')}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      border: `1.5px solid ${(isBrokenDown && packagingLevels.length === 1) ? '#2563EB' : '#E2E8F0'}`,
                      background: (isBrokenDown && packagingLevels.length === 1) ? '#EFF6FF' : '#FFFFFF',
                      color: (isBrokenDown && packagingLevels.length === 1) ? '#1D4ED8' : '#475569',
                      fontWeight: (isBrokenDown && packagingLevels.length === 1) ? 800 : 600,
                      fontSize: '12px',
                      cursor: (isEdit && hasActiveStock) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Direct Conversion (e.g. 1 Box = 50 Masks)
                  </button>

                  <button
                    type="button"
                    disabled={isEdit && hasActiveStock}
                    onClick={() => handleSelectPackagingMode('multi')}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      border: `1.5px solid ${(isBrokenDown && packagingLevels.length >= 2) ? '#2563EB' : '#E2E8F0'}`,
                      background: (isBrokenDown && packagingLevels.length >= 2) ? '#EFF6FF' : '#FFFFFF',
                      color: (isBrokenDown && packagingLevels.length >= 2) ? '#1D4ED8' : '#475569',
                      fontWeight: (isBrokenDown && packagingLevels.length >= 2) ? 800 : 600,
                      fontSize: '12px',
                      cursor: (isEdit && hasActiveStock) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Multi-Level (e.g. 1 Box = 10 Strips = 100 Tablets)
                  </button>
                </div>
              </div>
            </div>

            {/* COMPACT ROW 2: DYNAMIC INLINE PACKAGING BUILDER */}
            {!isBrokenDown ? (
              /* As-is Complete Unit Mode */
              <div style={{
                background: '#F0F9FF',
                border: '1px solid #BAE6FD',
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '12.5px',
                color: '#0369A1'
              }}>
                <span style={{ fontSize: '16px' }}>📦</span>
                <div>
                  <strong>Complete Unit:</strong> 1 {purchasedUnit} is stocked and dispensed as <strong>1 {purchasedUnit}</strong> (Converter = 1).
                  <span style={{ marginLeft: '8px', color: '#0284C7', fontSize: '11.5px' }}>
                    (No secondary breakdown or volume conversion).
                  </span>
                </div>
              </div>
            ) : packagingLevels.length === 1 ? (
              /* Direct Conversion Mode (1 Step) */
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '12px'
              }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                  1 {purchasedUnit} contains:
                </span>

                <input
                  type="number"
                  min="1"
                  disabled={isEdit && hasActiveStock}
                  value={packagingLevels[0].quantity}
                  onChange={(e) => handleLevelChange(0, 'quantity', e.target.value)}
                  placeholder="50"
                  style={{
                    width: '80px',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: `1px solid ${errors['level_qty_0'] ? '#EF4444' : '#CBD5E1'}`,
                    fontSize: '13px',
                    fontWeight: 800,
                    textAlign: 'center',
                    background: (isEdit && hasActiveStock) ? '#F1F5F9' : '#FFFFFF'
                  }}
                />

                <select
                  value={packagingLevels[0].childUnit}
                  disabled={isEdit && hasActiveStock}
                  onChange={(e) => handleLevelChange(0, 'childUnit', e.target.value)}
                  style={{
                    width: '180px',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: `1px solid ${errors['level_unit_0'] ? '#EF4444' : '#CBD5E1'}`,
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#0F172A',
                    background: (isEdit && hasActiveStock) ? '#F1F5F9' : '#FFFFFF'
                  }}
                >
                  {CONSUMPTION_INDIVIDUAL_UNITS
                    .filter(u => u.toLowerCase() !== purchasedUnit.toLowerCase())
                    .map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                </select>

                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                  (Final Inventory Unit)
                </span>

                <button
                  type="button"
                  disabled={isEdit && hasActiveStock}
                  onClick={() => handleSelectPackagingMode('multi')}
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: (isEdit && hasActiveStock) ? 'not-allowed' : 'pointer',
                    textDecoration: 'underline',
                    padding: 0
                  }}
                >
                  + Add intermediate packaging (e.g. Strips)
                </button>
              </div>
            ) : (
              /* Multi-Level Breakdown Mode (2+ Steps) */
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                {packagingLevels.map((lvl, idx) => {
                  const parentName = idx === 0 ? purchasedUnit : (packagingLevels[idx - 1]?.childUnit || 'Unit');
                  const isFinal = idx === packagingLevels.length - 1;

                  // Filter options to strictly prevent adjacent or identical unit selections
                  const options = isFinal
                    ? CONSUMPTION_INDIVIDUAL_UNITS.filter(u => u.toLowerCase() !== parentName.toLowerCase() && u.toLowerCase() !== purchasedUnit.toLowerCase())
                    : INTERMEDIATE_PACKAGING_UNITS.filter(u => u.toLowerCase() !== parentName.toLowerCase() && u.toLowerCase() !== purchasedUnit.toLowerCase());

                  return (
                    <div key={idx} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        background: '#EFF6FF',
                        color: '#2563EB',
                        padding: '3px 8px',
                        borderRadius: '6px'
                      }}>
                        Step {idx + 1}
                      </span>

                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        1 {parentName} contains:
                      </span>

                      <input
                        type="number"
                        min="1"
                        disabled={isEdit && hasActiveStock}
                        value={lvl.quantity}
                        onChange={(e) => handleLevelChange(idx, 'quantity', e.target.value)}
                        placeholder="10"
                        style={{
                          width: '75px',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: `1px solid ${errors[`level_qty_${idx}`] ? '#EF4444' : '#CBD5E1'}`,
                          fontSize: '13px',
                          fontWeight: 800,
                          textAlign: 'center',
                          background: (isEdit && hasActiveStock) ? '#F1F5F9' : '#FFFFFF'
                        }}
                      />

                      <select
                        value={lvl.childUnit}
                        disabled={isEdit && hasActiveStock}
                        onChange={(e) => handleLevelChange(idx, 'childUnit', e.target.value)}
                        style={{
                          width: '160px',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: `1px solid ${errors[`level_unit_${idx}`] ? '#EF4444' : '#CBD5E1'}`,
                          fontSize: '13px',
                          fontWeight: 700,
                          color: '#0F172A',
                          background: (isEdit && hasActiveStock) ? '#F1F5F9' : '#FFFFFF'
                        }}
                      >
                        {options.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>

                      <span style={{ fontSize: '11.5px', color: isFinal ? '#166534' : '#64748B', fontWeight: 600 }}>
                        {isFinal ? '(Final Inventory Unit)' : '(Intermediate Packaging)'}
                      </span>

                      {idx > 1 && (
                        <button
                          type="button"
                          disabled={isEdit && hasActiveStock}
                          onClick={() => handleRemovePackagingLevel(idx)}
                          style={{
                            background: '#FEF2F2',
                            color: '#DC2626',
                            border: '1px solid #FECACA',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: (isEdit && hasActiveStock) ? 'not-allowed' : 'pointer',
                            marginLeft: 'auto'
                          }}
                        >
                          × Remove Step
                        </button>
                      )}
                    </div>
                  );
                })}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed #E2E8F0', paddingTop: '8px', marginTop: '2px' }}>
                  <button
                    type="button"
                    disabled={isEdit && hasActiveStock || packagingLevels.length >= 4}
                    onClick={handleAddPackagingLevel}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563EB',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: (isEdit && hasActiveStock || packagingLevels.length >= 4) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: 0
                    }}
                  >
                    <span>+</span> Add Another Step (e.g. Carton → Box)
                  </button>

                  <button
                    type="button"
                    disabled={isEdit && hasActiveStock}
                    onClick={() => handleSelectPackagingMode('direct')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748B',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: (isEdit && hasActiveStock) ? 'not-allowed' : 'pointer',
                      padding: 0
                    }}
                  >
                    Switch to Direct 1-Step Packaging
                  </button>
                </div>
              </div>
            )}

            {/* Validation Error Alert if any duplicate unit or adjacent error detected */}
            {errors.packagingHierarchy && (
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '8px',
                padding: '8px 12px',
                color: '#991B1B',
                fontSize: '12.5px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>⚠️</span>
                <span>{errors.packagingHierarchy}</span>
              </div>
            )}

            {/* COMPACT ROW 3: CONVERSION PREVIEW (Exact Box matching Section 12) */}
            <div style={{
              borderRadius: '8px',
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#166534', letterSpacing: '0.05em' }}>
                PACKAGING CONVERSION
              </div>
              
              <div style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                fontSize: '16px',
                fontWeight: 800,
                color: '#14532D',
                fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif"
              }}>
                {!isBrokenDown ? (
                  <>
                    <span>1 {purchasedUnit}</span>
                    <span style={{ color: '#16A34A', fontSize: '14px' }}>→</span>
                    <span>1 {purchasedUnit}</span>
                  </>
                ) : (
                  <>
                    <span>1 {purchasedUnit}</span>
                    {packagingLevels.map((lvl, idx) => (
                      <React.Fragment key={idx}>
                        <span style={{ color: '#16A34A', fontSize: '14px' }}>→</span>
                        <span>{lvl.quantity} {lvl.childUnit}s</span>
                      </React.Fragment>
                    ))}
                  </>
                )}
              </div>

              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '16px',
                fontSize: '12px',
                color: '#166534',
                borderTop: '1px solid #DCFCE7',
                paddingTop: '6px',
                marginTop: '2px'
              }}>
                <div>Inventory Unit: <strong>{derivedConsumptionUnit}</strong></div>
                <div>Total Converter: <strong>{!isBrokenDown ? '1' : `${computedConverter.toLocaleString()} ${derivedConsumptionUnit}s / ${purchasedUnit}`}</strong></div>
              </div>
            </div>

            {/* COMPACT ROW 4: Pack Size Description & Issue Multiplier */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '14px',
              borderTop: '1px solid #F1F5F9',
              paddingTop: '12px'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                    Pack Size Description
                  </label>
                  <label style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="checkbox"
                      checked={isCustomPackDesc}
                      onChange={(e) => {
                        setIsCustomPackDesc(e.target.checked);
                        if (e.target.checked && !customPackDesc) {
                          setCustomPackDesc(autoPackDesc);
                        }
                      }}
                    />
                    Customize Note
                  </label>
                </div>
                {isCustomPackDesc ? (
                  <input
                    type="text"
                    value={customPackDesc}
                    onChange={(e) => setCustomPackDesc(e.target.value)}
                    placeholder="Custom packaging description"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px', boxSizing: 'border-box' }}
                  />
                ) : (
                  <div style={{ padding: '7px 10px', borderRadius: '6px', background: '#F1F5F9', border: '1px solid #E2E8F0', fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
                    {autoPackDesc}
                  </div>
                )}
                <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>
                  Auto-generated packaging specification displayed on POs and supplier tenders.
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Issue Multiplier
                </label>
                <input
                  type="number"
                  min="1"
                  value={issueMultiplier}
                  onChange={(e) => setIssueMultiplier(Math.max(1, Number(e.target.value) || 1))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px', fontWeight: 700, boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>
                  Standard dispensing bundle increment (Defaults to 1 consumption unit).
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* 4. SECTION — MANUFACTURER CONFIGURATION (REPEATABLE STRUCTURE) */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.02)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '16px 22px',
            background: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                MANUFACTURER CONFIGURATION
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                Configure multi-vendor catalog identifiers, packaging sizes, and machine compatibility per manufacturer.
              </p>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#9333EA', background: '#F3E8FF', padding: '4px 10px', borderRadius: '6px' }}>
              Step 3 of 3
            </span>
          </div>

          <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Entry Controls Area */}
            <div style={{
              background: '#F8FAFC',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  {editingMfgIndex !== null ? `Edit Manufacturer Configuration (#${editingMfgIndex + 1})` : '+ Add Manufacturer Configuration'}
                </span>
                {editingMfgIndex !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMfgIndex(null);
                      setMfgEntry({
                        manufacturer: '',
                        catalogNo: '',
                        machineCompatibility: '',
                        purchasedUnit,
                        converterFactor: computedConverter,
                        packSizeDescription: effectivePackDesc,
                        consumptionUnit: derivedConsumptionUnit,
                        issueMultiplier,
                        isActive: true
                      });
                    }}
                    style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Cancel Editing
                  </button>
                )}
              </div>

              {/* Grid 1: Manufacturer, Catalog, Machine */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '14px'
              }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Manufacturer Company <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={mfgEntry.manufacturer}
                    onChange={(e) => setMfgEntry(prev => ({ ...prev, manufacturer: e.target.value }))}
                    placeholder="e.g. Cipla, Sun Pharma, Abbott"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${errors.mfg_manufacturer ? '#EF4444' : '#CBD5E1'}`,
                      fontSize: '13px',
                      color: '#0F172A',
                      boxSizing: 'border-box'
                    }}
                  />
                  {errors.mfg_manufacturer && (
                    <div style={{ color: '#DC2626', fontSize: '11px', marginTop: '3px' }}>{errors.mfg_manufacturer}</div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Catalog No.
                  </label>
                  <input
                    type="text"
                    value={mfgEntry.catalogNo}
                    onChange={(e) => setMfgEntry(prev => ({ ...prev, catalogNo: e.target.value }))}
                    placeholder="e.g. CIP-500-T"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      color: '#0F172A',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Machine Compatibility
                  </label>
                  <input
                    type="text"
                    value={mfgEntry.machineCompatibility}
                    onChange={(e) => setMfgEntry(prev => ({ ...prev, machineCompatibility: e.target.value }))}
                    placeholder="e.g. Roche Cobas, Sysmex XN"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      color: '#0F172A',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Grid 2: Packaging overrides for this Manufacturer */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '12px',
                borderTop: '1px solid #E2E8F0',
                paddingTop: '12px'
              }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Purchased Unit
                  </label>
                  <select
                    value={mfgEntry.purchasedUnit}
                    onChange={(e) => setMfgEntry(prev => ({ ...prev, purchasedUnit: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                  >
                    {PROCUREMENT_UNITS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Converter
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={mfgEntry.converterFactor}
                    onChange={(e) => setMfgEntry(prev => ({ ...prev, converterFactor: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Pack Size
                  </label>
                  <input
                    type="text"
                    value={mfgEntry.packSizeDescription}
                    onChange={(e) => setMfgEntry(prev => ({ ...prev, packSizeDescription: e.target.value }))}
                    placeholder="10 × 10 Tablets"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Consumption Unit
                  </label>
                  <select
                    value={mfgEntry.consumptionUnit}
                    onChange={(e) => setMfgEntry(prev => ({ ...prev, consumptionUnit: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                  >
                    {CONSUMPTION_UNITS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Issue Multiplier
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={mfgEntry.issueMultiplier}
                    onChange={(e) => setMfgEntry(prev => ({ ...prev, issueMultiplier: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleAddOrUpdateMfg}
                    style={{
                      width: '100%',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: editingMfgIndex !== null ? '#2563EB' : '#0F172A',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>{editingMfgIndex !== null ? '✓ Update Row' : '+ Add Configuration'}</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Manufacturer Configuration Table */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#334155' }}>
                  Configured Manufacturers ({manufacturers.length})
                </span>
                {errors.manufacturers && (
                  <span style={{ color: '#DC2626', fontSize: '12px', fontWeight: 600 }}>{errors.manufacturers}</span>
                )}
              </div>

              <div style={{
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                overflowX: 'auto',
                background: '#FFFFFF'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', textAlign: 'left' }}>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Active</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Manufacturer Company</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Catalog No.</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Machine Name</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Purchased Unit</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Converter</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Pack Size</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Consumption</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Multiplier</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manufacturers.length === 0 ? (
                      <tr>
                        <td colSpan="10" style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
                          No manufacturer configurations added yet. Use the entry fields above to add at least one manufacturer.
                        </td>
                      </tr>
                    ) : (
                      manufacturers.map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', background: row.isActive !== false ? '#FFFFFF' : '#F8FAFC' }}>
                          {/* Active */}
                          <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                            <span
                              onClick={() => handleToggleMfgActive(idx)}
                              style={{
                                cursor: 'pointer',
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: row.isActive !== false ? '#DCFCE7' : '#F1F5F9',
                                color: row.isActive !== false ? '#15803D' : '#64748B'
                              }}
                              title="Click to toggle active state"
                            >
                              {row.isActive !== false ? 'Active' : 'Inactive'}
                            </span>
                          </td>

                          {/* Manufacturer */}
                          <td style={{ padding: '10px 14px', verticalAlign: 'middle', fontWeight: 700, color: '#0F172A' }}>
                            {row.manufacturer}
                          </td>

                          {/* Catalog */}
                          <td style={{ padding: '10px 14px', verticalAlign: 'middle', fontFamily: 'monospace', color: '#334155' }}>
                            {row.catalogNo || '—'}
                          </td>

                          {/* Machine */}
                          <td style={{ padding: '10px 14px', verticalAlign: 'middle', color: '#475569' }}>
                            {row.machineCompatibility || 'General / Standard'}
                          </td>

                          {/* Unit */}
                          <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                            <span style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                              {row.purchasedUnit || 'Box'}
                            </span>
                          </td>

                          {/* Converter */}
                          <td style={{ padding: '10px 14px', verticalAlign: 'middle', fontWeight: 700, color: '#166534' }}>
                            {row.converterFactor || 100}
                          </td>

                          {/* Pack Size */}
                          <td style={{ padding: '10px 14px', verticalAlign: 'middle', color: '#64748B' }}>
                            {row.packSizeDescription || '—'}
                          </td>

                          {/* Consumption */}
                          <td style={{ padding: '10px 14px', verticalAlign: 'middle', fontWeight: 600 }}>
                            {row.consumptionUnit || 'Tablet'}
                          </td>

                          {/* Issue Multiplier */}
                          <td style={{ padding: '10px 14px', verticalAlign: 'middle', textAlign: 'center' }}>
                            {row.issueMultiplier || 1}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '10px 14px', verticalAlign: 'middle', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => handleEditMfg(idx)}
                                style={{
                                  background: '#EFF6FF',
                                  color: '#1D4ED8',
                                  border: '1px solid #BFDBFE',
                                  borderRadius: '5px',
                                  padding: '4px 8px',
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveMfg(idx)}
                                style={{
                                  background: '#FEF2F2',
                                  color: '#B91C1C',
                                  border: '1px solid #FECACA',
                                  borderRadius: '5px',
                                  padding: '4px 8px',
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>

        {/* 5. STICKY BOTTOM ACTION BAR */}
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: '256px',
          right: 0,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          borderTop: '1px solid #E2E8F0',
          padding: '14px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 -4px 16px rgba(15, 23, 42, 0.05)',
          zIndex: 40
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={handleBack}
              disabled={saving}
              style={{
                background: '#FFFFFF',
                color: '#334155',
                border: '1px solid #CBD5E1',
                padding: '9px 18px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ← Back to Catalog
            </button>
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              Changes will be committed directly to the canonical Store Item Master.
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isEdit ? (
              <>
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={saving}
                  style={{
                    background: '#F1F5F9',
                    color: '#475569',
                    border: '1px solid #CBD5E1',
                    padding: '9px 18px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  style={{
                    background: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '9px 24px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
                  }}
                >
                  {saving ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={saving}
                  style={{
                    background: '#F1F5F9',
                    color: '#64748B',
                    border: '1px solid #CBD5E1',
                    padding: '9px 18px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Reset Form
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  style={{
                    background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '9px 26px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)'
                  }}
                >
                  {saving ? 'Saving Item...' : 'Save Item Master'}
                </button>
              </>
            )}
          </div>
        </div>

      </form>

      {/* QUICK ADD CATEGORY MODAL */}
      {showAddCategoryModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '24px', width: '380px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>Add New Category</h3>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Critical Care Consumables"
              value={newCategoryInput}
              onChange={(e) => setNewCategoryInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddNewCategory(); }}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '7px 14px', borderRadius: '6px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddNewCategory}
                style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', padding: '7px 16px', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
              >
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK ADD DEPARTMENT MODAL */}
      {showAddDeptModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '24px', width: '380px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>Add New Department</h3>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Dialysis Unit"
              value={newDeptInput}
              onChange={(e) => setNewDeptInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddNewDept(); }}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setShowAddDeptModal(false)}
                style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '7px 14px', borderRadius: '6px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddNewDept}
                style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', padding: '7px 16px', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
              >
                Add Department
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
