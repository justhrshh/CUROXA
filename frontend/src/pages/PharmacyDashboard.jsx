import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import HRPayroll from './HRPayroll';
import SearchableDropdown from '../components/SearchableDropdown';
import ExpiryManagementPanel from '../components/ExpiryManagementPanel';
import { convertPdfToImage } from '../utils/pdfHelper';
import { printPO, printGRN } from '../utils/printDocHelper';
import curoxaSidebarLogo from '../assets/curoxa_sidebar_logo.png';
import ExportModal from '../components/export/ExportModal';
import { inventoryExportColumns, prescriptionExportColumns } from '../utils/exportEngine';

const permissionNames = {
  'dr-consult': 'Patient consultation notes',
  'dr-rx': 'Prescription writer',
  'dr-laborder': 'Test order / lab referral',
  'dr-history': 'Patient visit history',
  'dr-discharge': 'Discharge summary',
  'dr-stockview': 'Pharmacy stock view',
  'rc-register': 'Patient registration',
  'rc-appt': 'Appointment booking',
  'rc-queue': 'OPD token queue',
  'rc-upload': 'Lab report upload',
  'rc-billing': 'Billing & receipts',
  'rc-reorder': 'Pharmacy stock reorder',
  'rc-labprint': 'Lab slip printing',
  'lt-queue': 'Test order queue',
  'lt-upload': 'Report upload',
  'lt-reagents': 'Lab reagents inventory',
  'lt-dispatch': 'Report dispatch',
  'lt-extlab': 'External lab coordination',
  'ph-queue': 'Prescription queue',
  'ph-dispense': 'Medicine dispensing',
  'ph-stock': 'Stock inventory',
  'ph-reorder': 'Reorder management',
  'ph-billing': 'Prescription billing',
  'ph-controlled': 'Controlled drugs log',
  'nu-vitals': 'Patient vitals entry',
  'nu-ward': 'Ward round notes',
  'nu-labassist': 'Lab sample assist',
  'nu-dispense': 'Medicine dispensing (assist)'
};

// Safeguard React DOM reconciliation against external DOM mutations (e.g. Lucide CDN node replacement)
if (typeof window !== 'undefined') {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function(child) {
    if (child.parentNode !== this) {
      return child;
    }
    return originalRemoveChild.call(this, child);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function(newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      return originalInsertBefore.call(this, newNode, this.firstChild);
    }
    return originalInsertBefore.call(this, newNode, referenceNode);
  };
}

const PharmacyDashboard = () => {
  const tenantModules = (() => {
    try {
      return JSON.parse(localStorage.getItem('tenantModules') || '{}');
    } catch (e) {
      return {};
    }
  })();

  const [activeTab, setActiveTab] = useState('dash');
  const [showHomeCalendar, setShowHomeCalendar] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('All'); // 'All', 'Urgent', 'New', 'In Progress'
  const [prescriptionsFilter, setPrescriptionsFilter] = useState('Pending'); // 'All', 'Pending', 'In Progress', 'Dispensed', 'Cancelled'
  const navigate = useNavigate();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('curoxa_sidebar_collapsed') === 'true');
  const [sectionOpen, setSectionOpen] = useState({
    management: true,
    tools: true,
    coverages: true
  });
  const toggleSection = (sec) => {
    setSectionOpen(prev => ({ ...prev, [sec]: !prev[sec] }));
  };
  
  // Real logged-in user or premium default fallback
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{"name":"Ankit Sharma","role":"Pharmacy","email":"ankit.sharma@curoxa.com"}'));
  const user = currentUser;

  const [showProfileEditModal, setShowProfileEditModal] = useState(false);
  const [profileEditName, setProfileEditName] = useState('');
  const [profileEditEmail, setProfileEditEmail] = useState('');
  const [profileEditAvatar, setProfileEditAvatar] = useState('');
  const [profileEditLoading, setProfileEditLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [customPharmacyLetterhead, setCustomPharmacyLetterhead] = useState(() => localStorage.getItem('curoxa_pharmacy_letterhead') || null);

  const handlePharmacyLetterheadUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawResult = reader.result;
        const imgUrl = await convertPdfToImage(rawResult);
        localStorage.setItem('curoxa_pharmacy_letterhead', imgUrl);
        setCustomPharmacyLetterhead(imgUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    const checkAndConvertExisting = async () => {
      const stored = localStorage.getItem('curoxa_pharmacy_letterhead');
      if (stored && (stored.startsWith('data:application/pdf') || stored.endsWith('.pdf') || stored.includes('application/pdf'))) {
        const imgUrl = await convertPdfToImage(stored);
        localStorage.setItem('curoxa_pharmacy_letterhead', imgUrl);
        setCustomPharmacyLetterhead(imgUrl);
      }
    };
    checkAndConvertExisting();
  }, []);

  useEffect(() => {
    if (showProfileEditModal) {
      setProfileEditName(currentUser.name || '');
      setProfileEditEmail(currentUser.email || '');
      setProfileEditAvatar(currentUser.avatar || '');
      setProfileError('');
      setProfileSuccess('');
    }
  }, [showProfileEditModal, currentUser]);

  const handleUpdateProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileEditLoading(true);
    setProfileError('');
    setProfileSuccess('');
    try {
      const response = await api.put(`/auth/profile/${currentUser.id || currentUser._id}`, {
        name: profileEditName,
        email: profileEditEmail,
        avatar: profileEditAvatar
      });
      const updatedUser = {
        ...currentUser,
        name: response.data.name,
        email: response.data.email,
        avatar: response.data.avatar || ''
      };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
      setProfileSuccess('Profile updated successfully!');
      setTimeout(() => {
        setShowProfileEditModal(false);
        setProfileSuccess('');
      }, 1500);
    } catch (err) {
      console.error(err);
      setProfileError(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setProfileEditLoading(false);
    }
  };

  // Dynamic role coverage state & listener
  const [coverageState, setCoverageState] = useState(() => {
    const saved = localStorage.getItem('curoxa_pmState');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const userName = JSON.parse(localStorage.getItem('user') || '{}').name || '';
        if (parsed[userName]) return parsed[userName];
        const matchKey = Object.keys(parsed).find(k => k.toLowerCase().trim() === userName.toLowerCase().trim());
        return matchKey ? parsed[matchKey] : {};
      } catch (e) {}
    }
    return {};
  });

  // Dedicated state for Pharmacy Overview sales and metrics reconciliation
  const [overviewSales, setOverviewSales] = useState([]);
  const [isLoadingOverviewSales, setIsLoadingOverviewSales] = useState(false);

  const fetchOverviewSales = async () => {
    try {
      setIsLoadingOverviewSales(true);
      const res = await api.get('/pharmacy-sales', { params: { limit: 200 } });
      if (res.data) {
        setOverviewSales(res.data.sales || []);
      }
    } catch (err) {
      console.error("Failed to fetch overview sales:", err);
    } finally {
      setIsLoadingOverviewSales(false);
    }
  };

  // Dedicated Pharmacy Sales Ledger States
  const [pharmacySales, setPharmacySales] = useState([]);
  const [salesTotalCount, setSalesTotalCount] = useState(0);
  const [salesCurrentPage, setSalesCurrentPage] = useState(1);
  const [salesPageSize, setSalesPageSize] = useState(10);
  const [salesTotalPages, setSalesTotalPages] = useState(1);
  const [salesFilterType, setSalesFilterType] = useState('ALL'); // 'ALL', 'DIRECT', 'PRESCRIPTION'
  const [salesFilterStatus, setSalesFilterStatus] = useState('ALL'); // 'ALL', 'COMPLETED', 'CANCELLED', 'REFUNDED'
  const [salesFilterPaymentMethod, setSalesFilterPaymentMethod] = useState('ALL'); // 'ALL', 'Cash', 'UPI', 'Card'
  const [salesFilterDateRange, setSalesFilterDateRange] = useState('All Time'); // 'Today', 'This Week', 'This Month', 'All Time', 'Custom Range'
  const [salesCustomStartDate, setSalesCustomStartDate] = useState('');
  const [salesCustomEndDate, setSalesCustomEndDate] = useState('');
  const [salesSearchQuery, setSalesSearchQuery] = useState('');
  const [isLoadingSales, setIsLoadingSales] = useState(false);
  const [selectedSaleDetail, setSelectedSaleDetail] = useState(null);
  const [showSaleDetailModal, setShowSaleDetailModal] = useState(false);

  // Direct Sale POS Modal States
  const [showDirectSaleModal, setShowDirectSaleModal] = useState(false);
  const [directSaleCustomerType, setDirectSaleCustomerType] = useState('WALK_IN'); // 'WALK_IN', 'REGISTERED'
  const [directSaleSelectedPatientId, setDirectSaleSelectedPatientId] = useState('');
  const [directSaleCustomerName, setDirectSaleCustomerName] = useState('');
  const [directSaleCustomerMobile, setDirectSaleCustomerMobile] = useState('');
  const [directSaleSearchPatientText, setDirectSaleSearchPatientText] = useState('');
  const [directSalePatientHighlightIndex, setDirectSalePatientHighlightIndex] = useState(0);
  const [directSalePaymentMethod, setDirectSalePaymentMethod] = useState('Cash'); // 'Cash', 'UPI', 'Card'
  const [directSaleAmountReceived, setDirectSaleAmountReceived] = useState('');
  const [directSaleTransactionRef, setDirectSaleTransactionRef] = useState('');
  const [directSaleNotes, setDirectSaleNotes] = useState('');
  const [directSaleItems, setDirectSaleItems] = useState([]);
  const [directSaleSearchMedText, setDirectSaleSearchMedText] = useState('');
  const [directSaleMedHighlightIndex, setDirectSaleMedHighlightIndex] = useState(0);
  const [isSubmittingDirectSale, setIsSubmittingDirectSale] = useState(false);
  const directSaleSearchPatientInputRef = useRef(null);
  const directSaleSearchMedInputRef = useRef(null);

  // Dynamic role coverage subtab states
  const [receptionistSubTab, setReceptionistSubTab] = useState('queue');
  const [labSubTab, setLabSubTab] = useState('tests');

  // Dynamic role coverage real data / transaction states
  const [coverageQueue, setCoverageQueue] = useState([]);
  const [coverageAppts, setCoverageAppts] = useState([]);
  const [coverageBills, setCoverageBills] = useState([]);
  const [coverageReagents, setCoverageReagents] = useState([]);
  const [patients, setPatients] = useState([]);
  const [coverageDoctors, setCoverageDoctors] = useState([]);
  const [coverageLabRequests, setCoverageLabRequests] = useState([]);
  const [selectedPatForCoverAppt, setSelectedPatForCoverAppt] = useState('');
  const [selectedDocForCoverAppt, setSelectedDocForCoverAppt] = useState('');
  const [selectedSlotForCoverAppt, setSelectedSlotForCoverAppt] = useState('09:30 AM');
  const [selectedRegGender, setSelectedRegGender] = useState('Female');

  // Coverage Lab workflow states
  const [showCoverageLabModal, setShowCoverageLabModal] = useState(false);
  const [selectedCoverageLabTest, setSelectedCoverageLabTest] = useState(null);
  const [coverageLabRemarks, setCoverageLabRemarks] = useState('');
  const [coverageLabParams, setCoverageLabParams] = useState({ value: '', unit: '' });
  const [coverageLabFileName, setCoverageLabFileName] = useState('');
  const [showCoverageLabDetailsModal, setShowCoverageLabDetailsModal] = useState(false);

  // Procurement States
  const [procurementSubTab, setProcurementSubTab] = useState('vendors');
  const [vendors, setVendors] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [pharmacyTickets, setPharmacyTickets] = useState([]);
  const [showResolveTicketModal, setShowResolveTicketModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketResolutionReason, setTicketResolutionReason] = useState('');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [showAddMedicineApprovalModal, setShowAddMedicineApprovalModal] = useState(false);
  const [newMedApprovalData, setNewMedApprovalData] = useState({
    name: '',
    sku: '',
    price: '',
    gst: 12,
    available: true,
    mrp: '',
    comment: ''
  });
  const [isSubmittingMedApproval, setIsSubmittingMedApproval] = useState(false);
  const [showAddVendorModal, setShowAddVendorModal] = useState(false);
  const [newVendor, setNewVendor] = useState({
    name: '',
    code: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    type: 'Manufacturer',
    contactPerson: '',
    gstNumber: '',
    status: 'Proposed',
    panNumber: '',
    licenseNumber: '',
    zipCode: '',
    notes: '',
    alternatePhone: '',
    medicines: [{ name: '', sku: '', price: '', gst: 12, available: true }],
    
    // New Excel Fields
    supplierCategory: 'Medicine',
    organizationType: 'Private Ltd',
    houseNo: '',
    street: '',
    country: 'India',
    pinCode: '',
    landline: '',
    faxNo: '',
    website: '',
    primaryContactPerson: '',
    primaryContactPersonDesignation: '',
    primaryContactPersonMobileNo: '',
    primaryContactPersonEmailId: '',
    secondaryContactPerson: '',
    secondaryContactPersonDesignation: '',
    secondaryContactPersonMobileNo: '',
    secondaryContactPersonEmailId: '',
    cinNo: '',
    pfRegistrationNo: '',
    nameOnPanCard: '',
    panCardNo: '',
    rocNo: '',
    esiRegistrationNo: '',
    isoCertificationNo: ''
  });
  const [showPriceListModal, setShowPriceListModal] = useState(false);
  const [editablePriceList, setEditablePriceList] = useState([]);
  const [showCreatePOModal, setShowCreatePOModal] = useState(false);
  const [poDraftItems, setPoDraftItems] = useState([{ name: '', sku: '', qty: 100 }]);
  const [poSplitSummary, setPoSplitSummary] = useState([]);
  const [showGRNModal, setShowGRNModal] = useState(false);
  const [grnFlowType, setGrnFlowType] = useState('po'); // 'po' or 'direct'
  const [grnSelectedPOId, setGrnSelectedPOId] = useState('');
  const [grnDirectVendorId, setGrnDirectVendorId] = useState('');
  const [grnItems, setGrnItems] = useState([]);
  const [grnLocation, setGrnLocation] = useState('Main Pharmacy Store');
  const [grnInvoiceNumber, setGrnInvoiceNumber] = useState('');
  const [grnInvoiceDate, setGrnInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [grnInvoiceAmount, setGrnInvoiceAmount] = useState('');
  const [grnInvoiceFile, setGrnInvoiceFile] = useState(null);
  const [grnInvoiceFileName, setGrnInvoiceFileName] = useState('');
  const [grnUploadProgress, setGrnUploadProgress] = useState(0);
  const [grnIsUploading, setGrnIsUploading] = useState(false);
  const [grnNotes, setGrnNotes] = useState('');
  const [selectedGrnDetails, setSelectedGrnDetails] = useState(null);
  const [editingGrn, setEditingGrn] = useState(null);
  const [catalogApprovalRequests, setCatalogApprovalRequests] = useState([]);


  const fetchProcurementData = async () => {
    try {
      const vendorRes = await api.get('/vendors');
      const freshVendors = vendorRes.data || [];
      setVendors(freshVendors);
      setSelectedVendor(prev => {
        if (!prev?._id) return prev;
        const fresh = freshVendors.find(v => v._id === prev._id);
        return fresh || prev;
      });

      const poRes = await api.get('/purchase-orders');
      setPurchaseOrders(poRes.data || []);
      const grnRes = await api.get('/goods-receipts');
      setGoodsReceipts(grnRes.data || []);
      const ticketsRes = await api.get('/pharmacy-tickets');
      setPharmacyTickets(ticketsRes.data || []);
      try {
        const appRes = await api.get('/approvals');
        const allApprovals = Array.isArray(appRes.data) ? appRes.data : [];
        const medApprovals = allApprovals.filter(a => 
          a.type === 'vendor_medicine_addition' || 
          a.type === 'vendor_onboarding' || 
          a.type === 'item_price_update'
        );
        setCatalogApprovalRequests(medApprovals);
      } catch (appErr) {
        console.error("Failed to fetch approval requests in Pharmacy:", appErr);
      }
    } catch (err) {
      console.error("Failed to fetch procurement data:", err);
    }
  };

  const handleAddVendorMedicineRow = () => {
    setNewVendor(prev => ({
      ...prev,
      medicines: [...(prev.medicines || []), { name: '', sku: '', price: '', gst: 12, available: true }]
    }));
  };

  const handleRemoveVendorMedicineRow = (index) => {
    setNewVendor(prev => ({
      ...prev,
      medicines: (prev.medicines || []).filter((_, idx) => idx !== index)
    }));
  };

  const handleVendorMedicineChange = (index, field, value) => {
    setNewVendor(prev => {
      const updated = [...(prev.medicines || [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, medicines: updated };
    });
  };

  const handleAddVendor = async (e) => {
    e.preventDefault();
    if (!newVendor.name || !newVendor.name.trim()) {
      showToast('Vendor name is required', 'error');
      return;
    }
    if (!newVendor.code || !newVendor.code.trim()) {
      showToast('Vendor code is required', 'error');
      return;
    }
    const phoneRegex = /^[0-9]{10}$/;
    if (newVendor.phone) {
      const cleanPhone = newVendor.phone.replace(/[\s\-+]/g, '');
      if (!phoneRegex.test(cleanPhone)) {
        showToast('Please enter a valid 10-digit mobile number', 'error');
        return;
      }
    }

    if (!Array.isArray(newVendor.medicines) || newVendor.medicines.length === 0) {
      showToast('Please add at least one medicine/rate-list item', 'error');
      return;
    }

    const seenSkus = new Set();
    for (let i = 0; i < newVendor.medicines.length; i++) {
      const m = newVendor.medicines[i];
      if (!m.name || !m.name.trim()) {
        showToast(`Medicine name is required for item #${i + 1}`, 'error');
        return;
      }
      if (!m.sku || !m.sku.trim()) {
        showToast(`SKU code is required for medicine '${m.name}'`, 'error');
        return;
      }
      const cleanSku = m.sku.trim().toUpperCase();
      if (seenSkus.has(cleanSku)) {
        showToast(`Duplicate SKU '${cleanSku}' in rate list`, 'error');
        return;
      }
      seenSkus.add(cleanSku);

      const priceVal = Number(m.price);
      if (!Number.isFinite(priceVal) || isNaN(priceVal) || priceVal <= 0) {
        showToast(`Purchase price must be a valid number > 0 for '${m.name}'`, 'error');
        return;
      }
      const gstVal = m.gst !== undefined && m.gst !== '' ? Number(m.gst) : 12;
      if (!Number.isFinite(gstVal) || isNaN(gstVal) || gstVal < 0) {
        showToast(`GST must be a valid non-negative number for '${m.name}'`, 'error');
        return;
      }
    }

    try {
      const payload = {
        ...newVendor,
        name: newVendor.name.trim(),
        code: newVendor.code.trim().toUpperCase(),
        medicines: newVendor.medicines.map(m => ({
          name: m.name.trim(),
          sku: m.sku.trim().toUpperCase(),
          price: Number(m.price),
          gst: m.gst !== undefined && m.gst !== '' ? Number(m.gst) : 12,
          available: m.available !== false
        }))
      };
      const res = await api.post('/vendors', payload);
      await fetchProcurementData();
      await fetchOverviewSales();
      await fetchSales();
      setShowAddVendorModal(false);
      showToast('Vendor proposed successfully! Sent to Admin for review.');
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || 'Failed to add vendor', 'error');
    }
  };

  const handleSavePriceList = async (e) => {
    e.preventDefault();
    try {
      const res = await api.put(`/vendors/${selectedVendor._id}/price-list`, { medicines: editablePriceList });
      setVendors(vendors.map(v => v._id === selectedVendor._id ? res.data : v));
      setSelectedVendor(res.data);
      setShowPriceListModal(false);
      showToast('Price list updated successfully!');
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || 'Failed to update price list', 'error');
    }
  };

  const handleSubmitMedicineForApproval = async (e) => {
    e.preventDefault();
    if (!selectedVendor) return;
    if (!newMedApprovalData.name.trim()) {
      showToast("Medicine name is required", "error");
      return;
    }
    if (!newMedApprovalData.sku.trim()) {
      showToast("SKU code is required", "error");
      return;
    }
    const priceVal = Number(newMedApprovalData.price);
    if (isNaN(priceVal) || priceVal <= 0) {
      showToast("Wholesale price must be a valid positive number", "error");
      return;
    }

    setIsSubmittingMedApproval(true);
    try {
      const payload = {
        type: 'vendor_medicine_addition',
        staffId: currentUser?.staff_id || currentUser?.id || 'pharmacy-1',
        requesterName: currentUser?.name || 'Pharmacy Staff',
        requesterRole: 'pharmacy',
        details: {
          vendorId: selectedVendor._id,
          vendorName: selectedVendor.name,
          vendorCode: selectedVendor.code,
          medicine: {
            name: newMedApprovalData.name.trim(),
            sku: newMedApprovalData.sku.trim().toUpperCase(),
            price: priceVal,
            gst: Number(newMedApprovalData.gst) || 12,
            available: newMedApprovalData.available !== false,
            mrp: newMedApprovalData.mrp ? Number(newMedApprovalData.mrp) : priceVal,
            sellingPrice: newMedApprovalData.mrp ? Number(newMedApprovalData.mrp) : priceVal
          }
        },
        comment: newMedApprovalData.comment.trim() || `Proposed new medicine addition for ${selectedVendor.name}`
      };

      await api.post('/approvals', payload);
      showToast("Medicine submitted for Admin approval.", "success");
      setShowAddMedicineApprovalModal(false);
      await fetchProcurementData();
      setNewMedApprovalData({
        name: '',
        sku: '',
        price: '',
        gst: 12,
        available: true,
        mrp: '',
        comment: ''
      });
    } catch (err) {
      console.error("Failed to submit medicine for approval:", err);
      showToast(err.response?.data?.error || "Failed to submit medicine for approval", "error");
    } finally {
      setIsSubmittingMedApproval(false);
    }
  };

  const handleResolveTicket = async (e) => {
    e.preventDefault();
    if (!selectedTicket || !ticketResolutionReason.trim()) return;
    try {
      const res = await api.put(`/pharmacy-tickets/${selectedTicket._id}/resolve`, { reason: ticketResolutionReason });
      setPharmacyTickets(pharmacyTickets.map(t => t._id === selectedTicket._id ? res.data : t));
      
      const medId = selectedTicket.medicineId;
      const currentQty = selectedTicket.currentStock || 0;
      await api.put(`/medicines/${medId}`, { stock: currentQty + 100 });
      
      showToast('Replenishment ticket resolved & stock updated successfully!');
      setShowResolveTicketModal(false);
      setTicketResolutionReason('');
      fetchProcurementData();
      fetchInventory();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || 'Failed to resolve ticket', 'error');
    }
  };

  // Phase 1B: Active Vendors and Unique Union Medicine Catalog
  const activeVendors = useMemo(() => {
    return (vendors || []).filter(v => v.status === 'Active');
  }, [vendors]);

  const uniqueMedCatalog = useMemo(() => {
    const map = new Map();
    activeVendors.forEach(v => {
      (v.medicines || []).forEach(m => {
        if (m.name && m.sku && m.available !== false) {
          const cleanSku = m.sku.trim().toUpperCase();
          if (!map.has(cleanSku)) {
            map.set(cleanSku, {
              name: m.name.trim(),
              sku: cleanSku,
              category: m.category || 'General'
            });
          }
        }
      });
    });
    return Array.from(map.values());
  }, [activeVendors]);

  const getVendorsOfferingItem = (sku) => {
    if (!sku) return [];
    const cleanSku = sku.trim().toUpperCase();
    const result = [];
    activeVendors.forEach(v => {
      const match = (v.medicines || []).find(m => m.sku?.trim().toUpperCase() === cleanSku && m.available !== false);
      if (match) {
        result.push({
          vendorId: v._id,
          vendorName: v.name,
          vendorCode: v.code,
          price: Number(match.price) || 0,
          gst: match.gst !== undefined ? Number(match.gst) : 12
        });
      }
    });
    result.sort((a, b) => a.price - b.price);
    return result;
  };

  const getCheapestVendorForItem = (sku) => {
    const list = getVendorsOfferingItem(sku);
    return list.length > 0 ? list[0] : null;
  };

  const handleDraftPOAddRow = () => {
    setPoDraftItems(prev => [
      ...prev,
      { name: '', sku: '', qty: 100, vendorId: '', vendorName: '', price: 0, tax: 12, total: 0, isLowest: true }
    ]);
  };

  const handleDraftPORemoveRow = (index) => {
    setPoDraftItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleDraftPOItemSelect = (index, medName) => {
    const matched = uniqueMedCatalog.find(m => m.name === medName);
    if (!matched) return;
    const sku = matched.sku;
    const suppliers = getVendorsOfferingItem(sku);
    const cheapest = suppliers.length > 0 ? suppliers[0] : null;

    setPoDraftItems(prev => {
      const updated = [...prev];
      const qty = Number(updated[index]?.qty) || 100;
      const price = cheapest ? cheapest.price : 0;
      const tax = cheapest ? cheapest.gst : 12;
      const sub = qty * price;
      const tot = sub + (sub * tax) / 100;

      updated[index] = {
        ...updated[index],
        name: matched.name,
        sku: matched.sku,
        qty: qty,
        vendorId: cheapest ? cheapest.vendorId : '',
        vendorName: cheapest ? cheapest.vendorName : '',
        price: price,
        tax: tax,
        total: Math.round(tot * 100) / 100,
        isLowest: true
      };
      return updated;
    });
  };

  const handleDraftPOVendorSelect = (index, vendorId) => {
    setPoDraftItems(prev => {
      const updated = [...prev];
      const row = updated[index];
      const suppliers = getVendorsOfferingItem(row.sku);
      const selectedSup = suppliers.find(s => s.vendorId.toString() === vendorId.toString());
      const cheapest = suppliers.length > 0 ? suppliers[0] : null;

      if (selectedSup) {
        const qty = Number(row.qty) || 1;
        const price = selectedSup.price;
        const tax = selectedSup.gst;
        const sub = qty * price;
        const tot = sub + (sub * tax) / 100;

        updated[index] = {
          ...row,
          vendorId: selectedSup.vendorId,
          vendorName: selectedSup.vendorName,
          price: price,
          tax: tax,
          total: Math.round(tot * 100) / 100,
          isLowest: cheapest ? (selectedSup.price <= cheapest.price) : true
        };
      }
      return updated;
    });
  };

  const handleDraftPOQtyChange = (index, qtyVal) => {
    setPoDraftItems(prev => {
      const updated = [...prev];
      const row = updated[index];
      const qty = Math.max(1, Number(qtyVal) || 0);
      const sub = qty * (row.price || 0);
      const tot = sub + (sub * (row.tax || 12)) / 100;

      updated[index] = {
        ...row,
        qty: qty,
        total: Math.round(tot * 100) / 100
      };
      return updated;
    });
  };

  const handleSendPurchaseOrders = async () => {
    const validItems = poDraftItems.filter(x => x.name && x.sku && Number(x.qty) > 0 && x.vendorId);
    if (validItems.length === 0) {
      showToast('Please add at least one valid item with selected supplier & quantity', 'error');
      return;
    }

    try {
      const payload = {
        items: validItems.map(it => ({
          name: it.name,
          sku: it.sku,
          requiredQty: Number(it.qty),
          price: Number(it.price),
          tax: Number(it.tax || 12),
          vendorId: it.vendorId,
          vendorName: it.vendorName
        })),
        requestedBy: currentUser?.name || 'Pharmacist'
      };

      const res = await api.post('/purchase-orders', payload);
      await fetchProcurementData();
      setShowCreatePOModal(false);
      showToast(`Consolidated PO sent to Admin! Split into ${res.data?.childPOsCount || 'vendor'} orders.`);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || 'Failed to submit Purchase Orders', 'error');
    }
  };

  const handleExportPOToCSV = (po) => {
    if (!po || !po.items || po.items.length === 0) {
      showToast('No items found in this purchase order', 'info');
      return;
    }
    const headers = ['PO Number', 'Master PO', 'Supplier', 'Item Name', 'SKU', 'Quantity', 'Purchase Price (INR)', 'GST (%)', 'Line Total (INR)', 'Status'];
    const rows = po.items.map(it => [
      po.poId,
      po.parentPOId || 'N/A',
      it.vendorName || po.vendorName || 'N/A',
      it.name,
      it.sku || 'N/A',
      it.requiredQty || it.qty || 0,
      (it.price || 0).toFixed(2),
      it.tax !== undefined ? it.tax : 12,
      (it.total || 0).toFixed(2),
      po.status || 'Pending Approval'
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${po.poId}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${po.poId} to CSV successfully!`, 'success');
  };

  const handleGrnPOSelection = (poId) => {
    setGrnSelectedPOId(poId);
    const po = purchaseOrders.find(x => x._id === poId || x.poId === poId);
    if (po && po.items) {
      // Calculate cumulative receipts across all prior non-draft GRNs for this PO
      const priorGrns = (goodsReceipts || []).filter(g => 
        (g.poId === po._id || g.poId === po.poId || g.poNumber === po.poId) && 
        ['Submitted', 'Verified/Completed'].includes(g.status)
      );
      
      const priorRecvBySku = {};
      priorGrns.forEach(grn => {
        (grn.items || []).forEach(it => {
          priorRecvBySku[it.sku] = (priorRecvBySku[it.sku] || 0) + (Number(it.qtyReceived) || 0);
        });
      });

      setGrnItems(po.items.map(item => {
        const ordered = Number(item.requiredQty) || Number(item.qty) || 0;
        const prevRecv = priorRecvBySku[item.sku] || 0;
        const remaining = Math.max(0, ordered - prevRecv);
        const rate = Number(item.price) || 0;
        const discountPct = Number(item.discount) || 0;
        const gstRate = item.tax !== undefined ? Number(item.tax) : 12;

        return {
          itemType: item.category || 'Medicine',
          itemCode: item.sku || '',
          sku: item.sku,
          name: item.name,
          unit: item.unit || 'Strip',
          barcode: '',
          batchNumber: '',
          mfgDate: '',
          expiryDate: '',
          qtyOrdered: ordered,
          orderedQty: ordered,
          previouslyReceivedQty: prevRecv,
          remainingQty: remaining,
          qtyReceived: remaining, // default to receiving the remaining
          rejectedQty: 0,
          rejectionReason: '',
          price: rate,
          purchaseRate: rate,
          discountPercent: discountPct,
          gst: gstRate
        };
      }));
    }
  };

  const handleOpenEditGrn = (grn) => {
    const ageMs = Date.now() - new Date(grn.createdAt || grn.receivedDate || Date.now()).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      showToast("Editing period expired (24 hours from creation).", "error");
      return;
    }
    setEditingGrn(grn);
    setGrnFlowType(grn.poId ? 'po' : 'direct');
    setGrnSelectedPOId(grn.poId || '');
    setGrnDirectVendorId(grn.vendorId || '');
    setGrnLocation(grn.grnLocation || 'Main Pharmacy Store');
    setGrnInvoiceNumber(grn.invoiceNumber || '');
    setGrnInvoiceDate(grn.invoiceDate ? new Date(grn.invoiceDate).toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10));
    setGrnInvoiceAmount(grn.invoiceAmount || '');
    setGrnItems((grn.items || []).map(it => ({
      itemType: it.itemType || 'Medicine',
      itemCode: it.itemCode || it.sku || '',
      name: it.name,
      sku: it.sku,
      unit: it.unit || 'Strip',
      barcode: it.barcode || '',
      qtyOrdered: it.qtyOrdered || it.orderedQty || 0,
      orderedQty: it.orderedQty || it.qtyOrdered || 0,
      previouslyReceivedQty: it.previouslyReceivedQty || 0,
      remainingQty: it.remainingQty || 0,
      qtyReceived: it.qtyReceived,
      rejectedQty: it.rejectedQty || 0,
      rejectionReason: it.rejectionReason || '',
      price: it.price || it.purchaseRate || 0,
      purchaseRate: it.purchaseRate || it.price || 0,
      discountPercent: it.discountPercent || 0,
      gst: it.gst !== undefined ? it.gst : 12,
      batchNumber: it.batchNumber || '',
      expiryDate: it.expiryDate ? new Date(it.expiryDate).toISOString().substring(0, 10) : '',
      mfgDate: it.mfgDate ? new Date(it.mfgDate).toISOString().substring(0, 10) : ''
    })));
    setGrnInvoiceFileName(grn.invoiceUrl || '');
    setGrnInvoiceFile(null);
    setGrnNotes(grn.notes || '');
    setShowGRNModal(true);
  };

  const handleSaveGRN = async (e, statusParam = 'Verified/Completed') => {
    if (e) e.preventDefault();
    
    const today = new Date().toISOString().split('T')[0];
    
    // Validations
    for (const item of grnItems) {
      if (item.mfgDate && item.mfgDate > today) {
        showToast(`Manufacturing date for ${item.name} cannot be in the future!`, 'error');
        return;
      }
      if (item.mfgDate && item.expiryDate && item.expiryDate <= item.mfgDate) {
        showToast(`Expiry date for ${item.name} must be after manufacturing date!`, 'error');
        return;
      }
      if (Number(item.qtyReceived) < 0) {
        showToast(`Received quantity cannot be negative for ${item.name}!`, 'error');
        return;
      }
      if (Number(item.rejectedQty) < 0) {
        showToast(`Rejected quantity cannot be negative for ${item.name}!`, 'error');
        return;
      }
      if (grnFlowType === 'po') {
        const remaining = item.remainingQty !== undefined ? item.remainingQty : (item.qtyOrdered || item.qtyRequired || 0);
        if (Number(item.qtyReceived) > remaining) {
          showToast(`Received quantity (${item.qtyReceived}) exceeds remaining quantity (${remaining}) for ${item.name}!`, 'error');
          return;
        }
      }
    }
    
    if (grnFlowType === 'direct' && !grnDirectVendorId) {
      showToast('Please select a vendor for direct purchase!', 'error');
      return;
    }

    try {
      const grnId = editingGrn ? editingGrn.grnId : `GRN-2026-${Math.floor(100000 + Math.random() * 900000)}`;
      let vendorId = '';
      let vendorName = '';
      let poId = null;
      let poNumber = '';
      let poDate = null;

      if (grnFlowType === 'po') {
        const po = purchaseOrders.find(x => x._id === grnSelectedPOId || x.poId === grnSelectedPOId);
        if (!po) {
          showToast('Please select an approved Purchase Order!', 'error');
          return;
        }
        poId = po._id;
        poNumber = po.poId;
        poDate = po.createdAt;
        vendorId = po.vendorId || (vendors[0] ? vendors[0]._id : '');
        vendorName = po.vendorName;
      } else {
        const v = vendors.find(x => x._id === grnDirectVendorId);
        if (!v) {
          showToast('Please select a vendor!', 'error');
          return;
        }
        vendorId = v._id;
        vendorName = v.name;
      }

      const payload = {
        grnId,
        grnLocation: grnLocation || 'Main Pharmacy Store',
        poId,
        poNumber,
        poDate,
        vendorId,
        vendorName,
        status: statusParam,
        invoiceNumber: grnInvoiceNumber || '',
        invoiceDate: grnInvoiceDate || null,
        invoiceAmount: Number(grnInvoiceAmount) || 0,
        invoiceUrl: grnInvoiceFileName || '',
        notes: grnNotes || '',
        items: grnItems.map(it => ({
          itemType: it.itemType || 'Medicine',
          itemCode: it.itemCode || it.sku || '',
          sku: it.sku,
          name: it.name,
          unit: it.unit || 'Strip',
          barcode: it.barcode || '',
          batchNumber: it.batchNumber || '',
          mfgDate: it.mfgDate || null,
          expiryDate: it.expiryDate || null,
          qtyOrdered: it.qtyOrdered || it.qtyRequired || 0,
          orderedQty: it.orderedQty || it.qtyOrdered || 0,
          previouslyReceivedQty: it.previouslyReceivedQty || 0,
          remainingQty: it.remainingQty || 0,
          qtyReceived: Number(it.qtyReceived) || 0,
          rejectedQty: Number(it.rejectedQty) || 0,
          rejectionReason: it.rejectionReason || '',
          price: Number(it.price || it.purchaseRate) || 0,
          purchaseRate: Number(it.purchaseRate || it.price) || 0,
          discountPercent: Number(it.discountPercent) || 0,
          gst: it.gst !== undefined ? Number(it.gst) : 12
        }))
      };

      if (editingGrn) {
        await api.put(`/goods-receipts/${editingGrn._id}`, payload);
      } else {
        await api.post('/goods-receipts', payload);
      }

      await fetchProcurementData();
      await fetchInventory();
      await fetchSales();
      await fetchOverviewSales();
      setShowGRNModal(false);
      setGrnSelectedPOId('');
      setGrnDirectVendorId('');
      setGrnItems([]);
      setGrnInvoiceNumber('');
      setGrnInvoiceDate(new Date().toISOString().split('T')[0]);
      setGrnInvoiceAmount('');
      setGrnInvoiceFileName('');
      setGrnInvoiceFile(null);
      setGrnNotes('');
      setEditingGrn(null);
      showToast(statusParam === 'Draft' ? 'GRN saved as Draft successfully!' : 'GRN generated & stock updated successfully!');
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || 'Failed to save GRN', 'error');
    }
  };

  const showToast = (message, type = 'success') => {
    if (type === 'error') {
      setErrorMessage(message);
      setTimeout(() => setErrorMessage(''), 3000);
    } else {
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  const redirectedTabsRef = useRef({});

  // Reset redirection flag on tab changes
  useEffect(() => {
    redirectedTabsRef.current = {
      [activeTab]: redirectedTabsRef.current[activeTab]
    };
  }, [activeTab]);

  // Restrict activeTab for cover users based on active coverage permissions
  useEffect(() => {
    const isCoverUser = currentUser?.role !== 'pharmacy';
    if (!isCoverUser) return;
    if (!coverageState || Object.keys(coverageState).length === 0) return;

    let isPermitted = false;
    if (activeTab === 'dash' || activeTab === 'profile-tab') {
      isPermitted = true;
    } else if (activeTab === 'prescriptions' || activeTab === 'internal') {
      isPermitted = !!(coverageState['ph-queue']?.on || coverageState['ph-dispense']?.on);
    } else if (activeTab === 'sales') {
      isPermitted = !!coverageState['ph-billing']?.on;
    } else if (activeTab === 'inventory') {
      isPermitted = !!(coverageState['ph-stock']?.on || coverageState['dr-stockview']?.on);
    } else if (activeTab === 'returns') {
      isPermitted = !!coverageState['ph-stock']?.on;
    } else if (activeTab === 'reports') {
      isPermitted = !!(coverageState['ph-stock']?.on || coverageState['ph-billing']?.on);
    } else {
      isPermitted = true;
    }

    if (!isPermitted) {
      if (coverageState['ph-queue']?.on || coverageState['ph-dispense']?.on) {
        setActiveTab('prescriptions');
      } else if (coverageState['ph-stock']?.on || coverageState['dr-stockview']?.on) {
        setActiveTab('inventory');
      } else if (coverageState['ph-billing']?.on) {
        setActiveTab('sales');
      } else {
        setActiveTab('dash');
      }
    }
  }, [coverageState, activeTab, currentUser]);

  // Auto-redirect first subtab on activeTab cover change
  useEffect(() => {
    if (!coverageState || Object.keys(coverageState).length === 0) return;
    if (redirectedTabsRef.current[activeTab]) return;

    if (activeTab === 'receptionist_cover') {
      if (coverageState['rc-queue']?.on) {
        setReceptionistSubTab('queue');
        redirectedTabsRef.current[activeTab] = true;
      } else if (coverageState['rc-appt']?.on) {
        setReceptionistSubTab('appt');
        redirectedTabsRef.current[activeTab] = true;
      } else if (coverageState['rc-register']?.on) {
        setReceptionistSubTab('register');
        redirectedTabsRef.current[activeTab] = true;
      } else if (coverageState['rc-billing']?.on) {
        setReceptionistSubTab('billing');
        redirectedTabsRef.current[activeTab] = true;
      }
    } else if (activeTab === 'lab_cover') {
      if (coverageState['lt-queue']?.on) {
        setLabSubTab('tests');
        redirectedTabsRef.current[activeTab] = true;
      } else if (coverageState['lt-reagents']?.on) {
        setLabSubTab('reagents');
        redirectedTabsRef.current[activeTab] = true;
      }
    }
  }, [activeTab, coverageState]);

  useEffect(() => {
    const userName = user.name || '';

    const findUserCoverage = (allState) => {
      if (!allState || !userName) return {};
      if (allState[userName]) return allState[userName];
      const matchKey = Object.keys(allState).find(k => k.toLowerCase().trim() === userName.toLowerCase().trim());
      return matchKey ? allState[matchKey] : {};
    };

    const syncFromLocalStorage = () => {
      const saved = localStorage.getItem('curoxa_pmState');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setCoverageState(findUserCoverage(parsed));
        } catch (e) {
          console.error(e);
        }
      }
    };

    window.addEventListener('storage', syncFromLocalStorage);

    const fetchBackendCoverage = async () => {
      try {
        const response = await api.get('/auth/role-coverage');
        if (response.data && typeof response.data === 'object') {
          localStorage.setItem('curoxa_pmState', JSON.stringify(response.data));
          setCoverageState(findUserCoverage(response.data));
        }
      } catch (err) {
        console.error('Failed to sync coverage from backend', err);
        syncFromLocalStorage();
      }
    };
    fetchBackendCoverage();

    const pollInterval = setInterval(fetchBackendCoverage, 5000);

    return () => {
      window.removeEventListener('storage', syncFromLocalStorage);
      clearInterval(pollInterval);
    };
  }, [user.name]);

  // Notifications states
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevCoverageKeysRef = useRef(null);
  const notificationRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (!event.target.closest('.sidebar-user') && !event.target.closest('.sidebar-profile-card') && !event.target.closest('.sidebar-profile')) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside, true);
    return () => {
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, []);

  useEffect(() => {
    if (!coverageState) return;
    
    // Get all keys where coverage is ON
    const activeKeys = Object.keys(coverageState).filter(k => coverageState[k]?.on);
    
    const userKey = currentUser.staff_id || currentUser.id || currentUser.name || 'default';
    const clearedKey = `curoxa_cleared_notifications_${userKey}`;
    
    if (prevCoverageKeysRef.current === null) {
      // First load: initialize without toast alerts
      prevCoverageKeysRef.current = activeKeys;
      
      const clearedIds = JSON.parse(localStorage.getItem(clearedKey) || '[]');
      
      const initialNotifications = activeKeys.map(k => {
        const details = coverageState[k];
        const permName = permissionNames[k] || k;
        return {
          id: `${k}-${details.grantedAt || 'active'}`,
          title: 'Permission Active',
          message: `You have active coverage for "${permName}" (${details.type === 'temp' ? 'Temporary' : 'Permanent'}).`,
          time: details.grantedAt ? new Date(details.grantedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active',
          isNew: false
        };
      }).filter(n => !clearedIds.includes(n.id));
      
      setNotifications(initialNotifications);
      setUnreadCount(0);
    } else {
      // Subsequent loads: find newly added/turned ON keys
      const newKeys = activeKeys.filter(k => !prevCoverageKeysRef.current.includes(k));
      const removedKeys = prevCoverageKeysRef.current.filter(k => !activeKeys.includes(k));
      
      if (newKeys.length > 0) {
        const newNotifications = [...notifications];
        const clearedIds = JSON.parse(localStorage.getItem(clearedKey) || '[]');
        let addedCount = 0;
        
        newKeys.forEach(k => {
          const details = coverageState[k];
          const permName = permissionNames[k] || k;
          const notifId = `${k}-${details.grantedAt || 'active'}`;
          
          if (!clearedIds.includes(notifId)) {
            addedCount++;
            showToast(`New Role Coverage Assigned: ${permName}!`);
            
            newNotifications.unshift({
              id: notifId,
              title: 'New Permission Delegated',
              message: `You have been delegated "${permName}" coverage (${details.type === 'temp' ? 'Temporary' : 'Permanent'}).`,
              time: 'Just now',
              isNew: true
            });
          }
        });
        setNotifications(newNotifications);
        setUnreadCount(prev => prev + addedCount);
      }
      
      if (removedKeys.length > 0) {
        removedKeys.forEach(k => {
          showToast(`Role Coverage Revoked: ${permissionNames[k] || k}!`);
        });
      }
      
      prevCoverageKeysRef.current = activeKeys;
    }
  }, [coverageState]);

  const [inventory, setInventory] = useState([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('All');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState('All');
  const [showInventoryExportModal, setShowInventoryExportModal] = useState(false);
  const [skuBatchRiskMap, setSkuBatchRiskMap] = useState({});
  const [skuBatchAggMap, setSkuBatchAggMap] = useState({});

  const uniqueInventoryCategories = useMemo(() => {
    const cats = new Set();
    inventory.forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return Array.from(cats).sort();
  }, [inventory]);

  // Authoritative FEFO/Batch-aware inventory semantics helper
  const getMedicineSellableInfo = useCallback((item) => {
    if (!item) return { sellableStock: 0, status: 'Out of Stock' };
    const cleanSku = String(item.sku || '').trim().toUpperCase();
    const batchAgg = skuBatchAggMap[cleanSku];

    let sellableStock;
    if (batchAgg && batchAgg.batchCount > 0) {
      // Expiry/FEFO batch-tracked item: sellable stock is unexpired availableQuantity
      sellableStock = batchAgg.validSellable;
    } else {
      // Legacy inventory without MedicineBatch records
      sellableStock = Number(item.stock) || 0;
    }

    let status = item.status;
    if (sellableStock <= 0) {
      status = 'Out of Stock';
    } else if (sellableStock <= 20 || status === 'Low Stock') {
      status = 'Low Stock';
    } else {
      status = 'In Stock';
    }

    return { sellableStock, status };
  }, [skuBatchAggMap]);

  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const searchLower = inventorySearch.trim().toLowerCase();
      const matchesSearch = !searchLower ||
        (item.name && item.name.toLowerCase().includes(searchLower)) ||
        (item.sku && item.sku.toLowerCase().includes(searchLower)) ||
        (item.category && item.category.toLowerCase().includes(searchLower));

      const matchesCategory = inventoryCategoryFilter === 'All' || item.category === inventoryCategoryFilter;

      const { status } = getMedicineSellableInfo(item);
      const matchesStatus = inventoryStatusFilter === 'All' || status === inventoryStatusFilter;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [inventory, inventorySearch, inventoryCategoryFilter, inventoryStatusFilter, getMedicineSellableInfo]);

  const [indents, setIndents] = useState([]);
  const [selectedIndent, setSelectedIndent] = useState(null);
  const [showIndentModal, setShowIndentModal] = useState(false);
  const [supplyInputMap, setSupplyInputMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [prescriptions, setPrescriptions] = useState([]);
  const [prescriptionsSearchQuery, setPrescriptionsSearchQuery] = useState('');
  const [prescriptionsDateFilter, setPrescriptionsDateFilter] = useState('');
  const [showPrescriptionExportModal, setShowPrescriptionExportModal] = useState(false);
  const [overviewPage, setOverviewPage] = useState(1);
  const [prescriptionsPage, setPrescriptionsPage] = useState(1);

  const prescriptionsForExport = useMemo(() => {
    return prescriptions.filter(p => {
      // 1. Status Filter
      if (prescriptionsFilter !== 'All') {
        const pStatus = p.status === 'Pending Pharmacy Dispatch' ? 'Pending' : p.status;
        if (pStatus?.toLowerCase() !== prescriptionsFilter.toLowerCase()) return false;
      }
      // 2. Search Query
      if (prescriptionsSearchQuery.trim()) {
        const q = prescriptionsSearchQuery.toLowerCase();
        const pName = (p.patientId?.name || p.name || '').toLowerCase();
        const pPhone = (p.patientId?.phone || p.patientId?.contact || '').toLowerCase();
        const docName = (p.doctorId?.name || p.docName || '').toLowerCase();
        const pId = (p._id ? `rx-${p._id.slice(-6)}` : (p.id || '')).toLowerCase();
        if (!pName.includes(q) && !pPhone.includes(q) && !docName.includes(q) && !pId.includes(q)) return false;
      }
      // 3. Optional Calendar Date filter from toolbar
      if (prescriptionsDateFilter) {
        const pDate = p.createdAt ? new Date(p.createdAt).toDateString() : '';
        const filterDate = new Date(prescriptionsDateFilter).toDateString();
        if (pDate !== filterDate) return false;
      }
      return true;
    });
  }, [prescriptions, prescriptionsFilter, prescriptionsSearchQuery, prescriptionsDateFilter]);
  const [returnLogs, setReturnLogs] = useState([]);
  const [showLogReturnModal, setShowLogReturnModal] = useState(false);
  const [returnType, setReturnType] = useState('Prescription-Linked');
  const [returnPatientName, setReturnPatientName] = useState('');
  const [returnPatientPhone, setReturnPatientPhone] = useState('');
  const [returnPrescriptionId, setReturnPrescriptionId] = useState('');
  const [returnPrescriptionCode, setReturnPrescriptionCode] = useState('');
  const [returnItems, setReturnItems] = useState([{ medicineName: '', quantity: 1, unitPrice: 0, reason: 'Doctor changed medication', action: 'Restocked' }]);
  const [rxSearchQuery, setRxSearchQuery] = useState('');
  const [isRxDropdownOpen, setIsRxDropdownOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Toast status notifications
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Modal states for inventory operations
  const [showMedicineModal, setShowMedicineModal] = useState(false);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [selectedPrescriptionGroup, setSelectedPrescriptionGroup] = useState(null);
  const [prescriptionModalStep, setPrescriptionModalStep] = useState('details'); // 'details' or 'payment'
  const [selectedPaymentMode, setSelectedPaymentMode] = useState('UPI');
  const [cashReceived, setCashReceived] = useState('');
  const [modalMode, setModalMode] = useState('add'); // 'add', 'edit', 'restock'
  const [formData, setFormData] = useState({
    name: '',
    category: 'Pain Relief',
    sku: '',
    stock: 0,
    unit: 'Strip',
    mrp: 0,
    expiry: ''
  });
  const [currentId, setCurrentId] = useState(null);

  // Barcode / Webcam scanning states
  const [isWebcamScanning, setIsWebcamScanning] = useState(false);
  const [webcamScanner, setWebcamScanner] = useState(null);
  const [scanDebugLog, setScanDebugLog] = useState('');

  // Auto cleanup webcam on modal close
  useEffect(() => {
    if (!showMedicineModal) {
      if (webcamScanner) {
        try {
          if (window.Quagga) window.Quagga.stop();
        } catch (e) { console.error(e); }
        setIsWebcamScanning(false);
        setWebcamScanner(null);
      } else {
        setIsWebcamScanning(false);
      }
    }
  }, [showMedicineModal]);

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); // 800 Hz beep
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.12); // Short beep duration
    } catch (e) {
      console.warn("Audio Context beep error", e);
    }
  };

  const handleBarcodeFound = async (barcode) => {
    const trimmed = barcode.trim();
    if (!trimmed) return;

    setFormData(prev => ({ ...prev, sku: trimmed }));
    setSuccessMessage(`Barcode scanned: ${trimmed}. Looking up product...`);

    // Step 1: Check local database first
    try {
      const response = await api.get(`/medicines/barcode/${trimmed}`);
      if (response.data && response.data.name) {
        setFormData({
          name: response.data.name,
          category: response.data.category,
          sku: response.data.sku,
          stock: '',
          unit: response.data.unit,
          mrp: response.data.mrp,
          expiry: response.data.expiry
        });
        setSuccessMessage(`Found in inventory: ${response.data.name}`);
        setTimeout(() => setSuccessMessage(''), 4000);
        return;
      }
    } catch (err) {
      console.log("Not in local DB, trying public APIs...");
    }

    // Step 2: Try Open Food Facts API (free, no key needed)
    try {
      const offRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${trimmed}.json`);
      const offData = await offRes.json();
      if (offData.status === 1 && offData.product) {
        const p = offData.product;
        const productName = p.product_name || p.product_name_en || '';
        const brand = p.brands || '';
        const categories = p.categories || '';
        const fullName = brand ? `${brand} - ${productName}` : productName;
        
        if (fullName) {
          setFormData(prev => ({
            ...prev,
            name: fullName,
            sku: trimmed,
            category: categories.split(',')[0]?.trim() || prev.category || 'General'
          }));
          setSuccessMessage(`Found online: ${fullName}`);
          setTimeout(() => setSuccessMessage(''), 4000);
          return;
        }
      }
    } catch (e) {
      console.log("Open Food Facts lookup failed:", e.message);
    }

    // Step 3: Try UPC ItemDB API (free, no key needed)
    try {
      const upcRes = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${trimmed}`);
      const upcData = await upcRes.json();
      if (upcData.items && upcData.items.length > 0) {
        const item = upcData.items[0];
        const productName = item.title || '';
        const brand = item.brand || '';
        const category = item.category || '';
        const fullName = brand && productName ? `${brand} - ${productName}` : (productName || brand);

        if (fullName) {
          setFormData(prev => ({
            ...prev,
            name: fullName,
            sku: trimmed,
            category: category.split(',')[0]?.trim() || prev.category || 'General'
          }));
          setSuccessMessage(`Found online: ${fullName}`);
          setTimeout(() => setSuccessMessage(''), 4000);
          return;
        }
      }
    } catch (e) {
      console.log("UPC ItemDB lookup failed:", e.message);
    }

    // Step 4: No lookup found — barcode set, user fills rest
    setSuccessMessage(`Barcode ${trimmed} not found in any database. Please fill details manually.`);
    setTimeout(() => setSuccessMessage(''), 5000);
  };

  const handleSkuKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      playBeep();
      handleBarcodeFound(e.target.value);
    }
  };

  const handleZoomChange = (zoomVal) => {
    try {
      const videoElem = document.querySelector("#barcode-webcam-reader video");
      if (videoElem && videoElem.srcObject) {
        const stream = videoElem.srcObject;
        const tracks = stream.getVideoTracks();
        if (tracks && tracks.length > 0) {
          const track = tracks[0];
          const capabilities = track.getCapabilities ? track.getCapabilities() : {};
          if (capabilities.zoom) {
            const min = capabilities.zoom.min || 1;
            const max = capabilities.zoom.max || 4;
            const constrainedVal = Math.max(min, Math.min(zoomVal, max));
            track.applyConstraints({
              advanced: [{ zoom: constrainedVal }]
            }).catch(e => console.log("Failed to apply zoom constraints", e));
          }
        }
      }
    } catch (e) {
      console.warn("Zoom constraint failed", e);
    }
  };

  const initWebcamReader = () => {
    setIsWebcamScanning(true);
    setScanDebugLog('Initializing QuaggaJS...');
    setTimeout(() => {
      try {
        if (!window.Quagga) {
          setScanDebugLog('ERROR: QuaggaJS not loaded!');
          return;
        }

        const targetEl = document.getElementById('barcode-webcam-reader');
        if (!targetEl) {
          setScanDebugLog('ERROR: Container not found!');
          return;
        }

        let frameCount = 0;
        let detected = false;

        window.Quagga.init({
          inputStream: {
            name: "Live",
            type: "LiveStream",
            target: targetEl,
            constraints: {
              facingMode: "environment",
              width: { ideal: 640 },
              height: { ideal: 480 }
            }
          },
          decoder: {
            readers: [
              "ean_reader",
              "ean_8_reader",
              "code_128_reader",
              "code_39_reader",
              "upc_reader",
              "upc_e_reader"
            ]
          },
          locate: true,
          frequency: 10
        }, function(err) {
          if (err) {
            console.error('Quagga init error:', err);
            setScanDebugLog('Camera error: ' + (err.message || err));
            setIsWebcamScanning(false);
            return;
          }
          setScanDebugLog('Camera active! Scanning for EAN-13, EAN-8, CODE-128, UPC...');
          window.Quagga.start();
          setWebcamScanner({ type: 'quagga' });

          // Style the video to fill container
          const video = targetEl.querySelector('video');
          if (video) {
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.objectFit = 'cover';
            video.style.borderRadius = '12px';
          }
          const canvas = targetEl.querySelector('canvas');
          if (canvas) {
            canvas.style.display = 'none';
          }
        });

        window.Quagga.onProcessed(function(result) {
          frameCount++;
          if (frameCount % 50 === 0) {
            setScanDebugLog(`Frame ${frameCount}: Scanning... (no barcode yet)`);
          }
        });

        window.Quagga.onDetected(function(result) {
          if (detected) return;
          const code = result.codeResult.code;
          const format = result.codeResult.format;
          if (!code) return;
          detected = true;
          setScanDebugLog(`DECODED: "${code}" (${format})`);
          playBeep();
          handleBarcodeFound(code);
          try {
            window.Quagga.stop();
          } catch(e) {}
          setIsWebcamScanning(false);
          setWebcamScanner(null);
        });

      } catch (err) {
        console.error(err);
        setScanDebugLog('Error: ' + err.message);
      }
    }, 200);
  };

  const startWebcamScanner = () => {
    if (!window.Quagga) {
      const script = document.createElement('script');
      script.src = "https://cdn.jsdelivr.net/npm/@ericblade/quagga2/dist/quagga.min.js";
      script.async = true;
      script.onload = () => initWebcamReader();
      script.onerror = () => {
        setErrorMessage('Failed to load scanner library.');
        setTimeout(() => setErrorMessage(''), 3000);
      };
      document.body.appendChild(script);
    } else {
      initWebcamReader();
    }
  };

  const stopWebcamScanner = () => {
    try {
      if (window.Quagga) window.Quagga.stop();
    } catch (e) { console.error(e); }
    setIsWebcamScanning(false);
    setWebcamScanner(null);
  };

  // Search input state
  const [searchQuery, setSearchQuery] = useState('');

  // Active Date for Calendar
  const [activeCalendarDate, setActiveCalendarDate] = useState(new Date());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchIndents = async () => {
    try {
      const indentsRes = await api.get('/indents');
      setIndents(indentsRes.data || []);
    } catch (err) {
      console.error("Failed to fetch indents:", err);
    }
  };

  useEffect(() => {
    const handleSync = (e) => {
      const { type, message, changes } = e.detail || {};
      console.log('[SOCKET] PharmacyDashboard received sync event for:', type);
      if (type === 'coverage') {
        fetchCoverageData();
      } else if (type === 'indents' || type === 'indent') {
        fetchIndents();
        fetchInventory();
      } else if (type === 'prescription_updated') {
        if (changes && changes.pharmacist) {
          showToast(message || 'A prescription has been edited by the doctor!', 'info');
        }
        fetchData();
      } else if (type === 'medicines') {
        fetchInventory();
      } else if (type === 'vendors' || type === 'approvals' || type === 'purchase_orders' || type === 'purchase-orders') {
        fetchProcurementData();
      } else if (type === 'all' || !type) {
        fetchData();
      }
    };
    window.addEventListener('curoxa_sync', handleSync);

    const onWindowFocus = () => {
      fetchProcurementData();
    };
    window.addEventListener('focus', onWindowFocus);

    const autoSyncTimer = setInterval(() => {
      fetchProcurementData();
    }, 6000);

    return () => {
      window.removeEventListener('curoxa_sync', handleSync);
      window.removeEventListener('focus', onWindowFocus);
      clearInterval(autoSyncTimer);
    };
  }, []);

  const fetchInventory = async () => {
    try {
      const res = await api.get('/medicines');
      setInventory(res.data);
      try {
        const expiryRes = await api.get('/inventory-expiry?risk=ALL&limit=1000');
        const batches = expiryRes.data?.batches || [];
        const riskMap = {};
        const batchAggMap = {};
        const now = new Date();
        batches.forEach(b => {
          const key = String(b.sku || '').toUpperCase();
          if (!riskMap[key]) {
            riskMap[key] = { expiredCount: 0, criticalCount: 0, warningCount: 0 };
          }
          if (b.risk === 'EXPIRED') riskMap[key].expiredCount++;
          else if (b.risk === 'CRITICAL') riskMap[key].criticalCount++;
          else if (b.risk === 'WARNING') riskMap[key].warningCount++;

          if (!batchAggMap[key]) {
            batchAggMap[key] = { totalAvailable: 0, validSellable: 0, expiredQty: 0, batchCount: 0 };
          }
          batchAggMap[key].batchCount++;
          const avail = Number(b.availableQuantity) || 0;
          batchAggMap[key].totalAvailable += avail;
          const isExp = b.isExpired || b.risk === 'EXPIRED' || (b.expiryDate && new Date(b.expiryDate) <= now);
          if (isExp) {
            batchAggMap[key].expiredQty += avail;
          } else {
            batchAggMap[key].validSellable += avail;
          }
        });
        setSkuBatchRiskMap(riskMap);
        setSkuBatchAggMap(batchAggMap);
      } catch (e) {
        // Expiry route silent fallback
      }
    } catch (err) {
      console.error("Failed to fetch inventory", err);
    }
  };

  const handleAddDirectSaleMedicine = (med) => {
    if (!med) return;
    setDirectSaleItems(prev => {
      const existingIdx = prev.findIndex(it => (it.medicineId && it.medicineId === med._id) || (it.sku && it.sku === med.sku));
      if (existingIdx >= 0) {
        const updated = [...prev];
        const newQty = updated[existingIdx].quantity + 1;
        if (newQty > (med.stock || 0)) {
          showToast('Cannot add more. Available stock for ' + med.name + ' is ' + med.stock + '.', 'error');
          return prev;
        }
        updated[existingIdx].quantity = newQty;
        return updated;
      } else {
        if ((med.stock || 0) <= 0) {
          showToast('Medicine ' + med.name + ' is Out of Stock.', 'error');
          return prev;
        }
        return [
          ...prev,
          {
            medicineId: med._id,
            medicineName: med.name,
            sku: med.sku || '',
            unit: med.unit || 'Strip',
            stock: med.stock || 0,
            mrp: Number(med.mrp) || 0,
            quantity: 1,
            discountPercent: 0,
            gstPercent: 0
          }
        ];
      }
    });
    setDirectSaleSearchMedText('');
  };

  const handleRemoveDirectSaleMedicine = (index) => {
    setDirectSaleItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleDirectSaleItemChange = (index, field, value) => {
    setDirectSaleItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (field === 'quantity') {
        const num = parseInt(value, 10);
        item.quantity = isNaN(num) ? 0 : Math.max(1, num);
      } else if (field === 'discountPercent') {
        const num = parseFloat(value);
        item.discountPercent = isNaN(num) ? 0 : Math.min(100, Math.max(0, num));
      } else if (field === 'gstPercent') {
        const num = parseFloat(value);
        item.gstPercent = isNaN(num) ? 0 : Math.max(0, num);
      } else if (field === 'mrp') {
        const num = parseFloat(value);
        item.mrp = isNaN(num) ? 0 : Math.max(0, num);
      }
      updated[index] = item;
      return updated;
    });
  };

  const handleDirectSaleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (directSaleItems.length === 0) {
      showToast("Please add at least one medicine to the sale.", 'error');
      return;
    }

    let custName = directSaleCustomerName.trim();
    let custMobile = directSaleCustomerMobile.trim();
    let patId = undefined;
    let patIdentifier = undefined;

    if (directSaleCustomerType === 'REGISTERED') {
      if (!directSaleSelectedPatientId) {
        showToast("Please select a registered patient.", 'error');
        return;
      }
      const p = patients.find(pt => pt._id === directSaleSelectedPatientId);
      if (p) {
        custName = p.name;
        custMobile = p.contact || p.phone || '';
        patId = p._id;
        patIdentifier = p.patientId || p.uhid || ('MDC-' + p._id.toString().slice(-4).toUpperCase());
      }
    } else {
      if (!custName) {
        custName = 'Walk-in Customer';
      }
    }

    for (const item of directSaleItems) {
      if (!item.quantity || item.quantity <= 0) {
        showToast('Invalid quantity for ' + item.medicineName + '. Must be > 0.', 'error');
        return;
      }
      if (item.quantity > item.stock) {
        showToast('Insufficient stock for ' + item.medicineName + '. Available: ' + item.stock + ', Requested: ' + item.quantity + '.', 'error');
        return;
      }
    }

    const grandTotal = directSaleItems.reduce((acc, it) => {
      const gross = it.quantity * it.mrp;
      const disc = gross * ((it.discountPercent || 0) / 100);
      const tax = gross - disc;
      const gst = tax * ((it.gstPercent || 0) / 100);
      return acc + (tax + gst);
    }, 0);

    setIsSubmittingDirectSale(true);
    try {
      const payload = {
        saleType: 'DIRECT',
        customerName: custName,
        customerMobile: custMobile,
        patientId: patId,
        patientIdentifier: patIdentifier,
        doctorName: 'Self / No Doctor',
        pharmacistName: currentUser?.name || 'Pharmacist',
        pharmacistId: currentUser?.staff_id || '',
        pharmacyLocation: 'Main Pharmacy',
        paymentMethod: directSalePaymentMethod,
        amountReceived: grandTotal,
        transactionRef: directSaleTransactionRef,
        notes: directSaleNotes,
        items: directSaleItems.map(it => ({
          medicineId: it.medicineId,
          medicineName: it.medicineName,
          sku: it.sku,
          unit: it.unit,
          quantity: it.quantity,
          mrp: it.mrp,
          discountPercent: it.discountPercent || 0,
          gstPercent: it.gstPercent || 0
        }))
      };

      const res = await api.post('/pharmacy-sales', payload);
      showToast('Sale completed successfully! Sale ID: ' + res.data.saleId);

      setShowDirectSaleModal(false);
      setDirectSaleCustomerType('WALK_IN');
      setDirectSaleCustomerName('');
      setDirectSaleCustomerMobile('');
      setDirectSaleSelectedPatientId('');
      setDirectSaleItems([]);
      setDirectSalePaymentMethod('Cash');
      setDirectSaleAmountReceived('');
      setDirectSaleTransactionRef('');
      setDirectSaleNotes('');

      await fetchInventory();
      await fetchSales();
      await fetchOverviewSales();
    } catch (err) {
      console.error("Direct sale error:", err);
      showToast(err.response?.data?.error || "Failed to process Direct Sale.", 'error');
    } finally {
      setIsSubmittingDirectSale(false);
    }
  };

  const handlePrintSaleReceipt = (sale) => {
    if (!sale) return;
    const printWindow = window.open('', '_blank');
    const itemsHtml = (sale.items || []).map(it => {
      const skuDiv = it.sku ? '<div style="font-size: 11px; color: #64748B;">SKU: ' + it.sku + '</div>' : '';
      return '<tr>' +
        '<td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; font-size: 13px; color: #0F172A; font-weight: 600;">' +
          it.medicineName + skuDiv +
        '</td>' +
        '<td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; text-align: center; font-size: 13px; color: #475569;">' + it.quantity + ' ' + (it.unit || '') + '</td>' +
        '<td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; text-align: right; font-size: 13px; color: #475569;">₹' + (it.mrp || 0).toFixed(2) + '</td>' +
        '<td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; text-align: right; font-size: 13px; color: #475569;">' + (it.discountPercent || 0) + '%</td>' +
        '<td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; text-align: right; font-size: 13px; color: #475569;">' + (it.gstPercent || 0) + '%</td>' +
        '<td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; text-align: right; font-size: 13px; color: #0F172A; font-weight: 700;">₹' + (it.netAmount || 0).toFixed(2) + '</td>' +
      '</tr>';
    }).join('');

    const formattedDate = sale.saleDate ? new Date(sale.saleDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    const formattedTime = sale.saleTime || (sale.createdAt ? new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

    const receiptHtml = '<!DOCTYPE html><html><head><title>Pharmacy Receipt - ' + sale.saleId + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">' +
      '<style>@page { margin: 15mm; } body { font-family: "Plus Jakarta Sans", sans-serif; color: #0F172A; margin: 0; padding: 20px; font-size: 13px; } table { width: 100%; border-collapse: collapse; margin-top: 15px; } th { background: #F8FAFC; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #475569; border-bottom: 2px solid #CBD5E1; }</style>' +
      '</head><body>' +
      '<div style="text-align: center; border-bottom: 2px solid #E2E8F0; padding-bottom: 16px; margin-bottom: 20px;">' +
        '<h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #2563EB;">CUROXA PHARMACY</h2>' +
        '<div style="font-size: 12px; color: #64748B; margin-top: 4px;">Main Pharmacy Dispensary • Tax Invoice / Cash Receipt</div>' +
      '</div>' +
      '<div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 12.5px;">' +
        '<div>' +
          '<div><strong>Sale ID:</strong> <span style="font-family: monospace; font-size: 14px; font-weight: 700;">' + sale.saleId + '</span></div>' +
          '<div style="margin-top: 4px;"><strong>Date & Time:</strong> ' + formattedDate + ' ' + formattedTime + '</div>' +
          '<div style="margin-top: 4px;"><strong>Sale Type:</strong> <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; background: ' + (sale.saleType === 'DIRECT' ? '#EEF2FF' : '#ECFDF5') + '; color: ' + (sale.saleType === 'DIRECT' ? '#4F46E5' : '#059669') + '; font-weight: 700;">' + sale.saleType + '</span></div>' +
          '<div style="margin-top: 4px;"><strong>Doctor / Source:</strong> ' + (sale.doctorName || 'Self / No Doctor') + '</div>' +
        '</div>' +
        '<div style="text-align: right;">' +
          '<div><strong>Customer / Patient:</strong> ' + (sale.customerName || 'Walk-in') + '</div>' +
          (sale.customerMobile ? '<div style="margin-top: 4px;"><strong>Mobile:</strong> ' + sale.customerMobile + '</div>' : '') +
          (sale.patientIdentifier ? '<div style="margin-top: 4px;"><strong>Patient ID:</strong> ' + sale.patientIdentifier + '</div>' : '') +
          '<div style="margin-top: 4px;"><strong>Pharmacist:</strong> ' + (sale.pharmacistName || 'Pharmacist') + '</div>' +
        '</div>' +
      '</div>' +
      '<table><thead><tr><th>Medicine / Item</th><th style="text-align: center;">Qty</th><th style="text-align: right;">MRP</th><th style="text-align: right;">Disc</th><th style="text-align: right;">GST</th><th style="text-align: right;">Net Amount</th></tr></thead>' +
      '<tbody>' + itemsHtml + '</tbody></table>' +
      '<div style="display: flex; justify-content: flex-end; margin-top: 20px;">' +
        '<div style="width: 260px; background: #F8FAFC; padding: 16px; border-radius: 8px; border: 1px solid #E2E8F0;">' +
          '<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Subtotal:</span><span>₹' + (sale.subtotal || 0).toFixed(2) + '</span></div>' +
          '<div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #16A34A;"><span>Total Discount:</span><span>-₹' + (sale.totalDiscount || 0).toFixed(2) + '</span></div>' +
          '<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>GST:</span><span>₹' + (sale.totalGst || 0).toFixed(2) + '</span></div>' +
          '<div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 2px solid #CBD5E1; font-weight: 800; font-size: 15px; color: #0F172A;"><span>Grand Total:</span><span>₹' + (sale.grandTotal || 0).toFixed(2) + '</span></div>' +
          '<div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 12px; color: #475569;"><span>Payment:</span><span style="font-weight: 700;">' + (sale.paymentMethod || 'Cash') + ' (' + (sale.paymentStatus || 'PAID') + ')</span></div>' +
          (sale.paymentMethod === 'Cash' ? '<div style="display: flex; justify-content: space-between; font-size: 12px; color: #475569;"><span>Received:</span><span>₹' + (sale.amountReceived || sale.grandTotal).toFixed(2) + '</span></div><div style="display: flex; justify-content: space-between; font-size: 12px; color: #475569;"><span>Change:</span><span>₹' + (sale.changeReturned || 0).toFixed(2) + '</span></div>' : '') +
        '</div>' +
      '</div>' +
      '<div style="margin-top: 40px; text-align: center; color: #94A3B8; font-size: 11px; border-top: 1px solid #E2E8F0; padding-top: 12px;">Thank you for choosing Curoxa Healthcare. Get well soon!</div>' +
      '</body></html>';

    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  };

  const handleExportSalesCSV = () => {
    if (!prescriptions || prescriptions.length === 0) {
      showToast("No transaction records to export.");
      return;
    }

    const headers = ["Prescription ID", "Patient Name", "Patient ID", "Doctor Name", "Date & Time", "Total Items", "Total Amount", "Status"];

    const rows = prescriptions.map((p, index) => {
      const pId = p._id ? `RX-${p._id.substring(p._id.length - 6).toUpperCase()}` : `RX-00${index}`;
      const patientName = p.patientId?.name || 'Unknown Patient';
      const patientIdVal = p.patientId?._id ? `MDC-${p.patientId._id.toString().substring(18).toUpperCase()}` : 'N/A';
      const docName = p.doctorId?.name || 'Dr. Self';
      const dateTime = p.createdAt ? `${new Date(p.createdAt).toLocaleDateString()} ${new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'N/A';
      const enrichedItems = enrichItemsWithPrice(p.items);
      const amountVal = enrichedItems.reduce((acc, curr) => acc + curr.lineTotal, 0);
      const amount = `₹${amountVal.toFixed(2)}`;
      const status = p.status === 'Pending Pharmacy Dispatch' ? 'Pending' : p.status;

      return [pId, patientName, patientIdVal, docName, dateTime, itemsCount, amount, status]
        .map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `pharmacy_sales_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast("Transaction report exported successfully as CSV");
  };

  const handleExportInventoryCSV = () => {
    if (!inventory || inventory.length === 0) {
      showToast("No inventory records to export.");
      return;
    }

    const headers = ["Medicine Name", "Category", "SKU Code", "Stock Quantity", "Unit", "MRP", "Expiry Date"];

    const rows = inventory.map(inv => {
      const name = inv.name || '';
      const category = inv.category || '';
      const sku = inv.sku || '';
      const stock = inv.stock || 0;
      const unit = inv.unit || 'units';
      const mrp = `₹${(inv.mrp || 0).toFixed(2)}`;
      const expiry = inv.expiry || 'N/A';

      return [name, category, sku, stock, unit, mrp, expiry]
        .map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `pharmacy_inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast("Inventory report exported successfully as CSV");
  };

  const parseResults = (resultsStr) => {
    if (!resultsStr) return { parameters: {}, remarks: '', isDraft: false };
    try {
      return JSON.parse(resultsStr);
    } catch (e) {
      return { parameters: {}, remarks: resultsStr || '', isDraft: false };
    }
  };

  const fetchCoverageData = async () => {
    try {
      // Receptionist cover: appointments and queue
      const apptsRes = await api.get('/appointments');
      if (apptsRes.data && Array.isArray(apptsRes.data)) {
        const today = new Date().toISOString().split('T')[0];
        const todayAppts = apptsRes.data.filter(a => a.date && a.date.startsWith(today));
        setCoverageAppts(todayAppts.slice(0, 5).map(a => ({
          id: a._id,
          patient: a.patientId?.name || 'Unknown',
          slot: a.time || 'N/A',
          status: a.status || 'Upcoming',
          contact: a.patientId?.contact || 'N/A'
        })));

        // OPD Daily Token Queue derived from today's appointments
        setCoverageQueue(todayAppts.map((a, idx) => ({
          id: a._id,
          token: `T-${(idx + 1).toString().padStart(3, '0')}`,
          patient: a.patientId?.name || 'Unknown',
          status: a.status || 'Waiting',
          time: a.time || 'N/A'
        })));
      }

      const billsRes = await api.get('/billing');
      if (billsRes.data && Array.isArray(billsRes.data)) {
        setCoverageBills(billsRes.data.slice(0, 10).map(b => ({
          id: b._id,
          name: b.patientId?.name || 'Unknown',
          service: b.items?.[0]?.description || 'Medical Service',
          amount: b.totalAmount || 0,
          paid: b.status === 'Paid'
        })));
      }

      // Lab coverage: diagnostic test orders queue
      const labRes = await api.get('/labs');
      if (labRes.data && Array.isArray(labRes.data)) {
        setCoverageLabRequests(labRes.data.map(item => ({
          id: item._id,
          name: item.patientId?.name || 'Unknown',
          test: item.testName || 'General Test',
          priority: 'Normal',
          status: item.status || 'Pending',
          results: item.results || '',
          notes: item.notes || '',
          rawItem: item
        })));
      }

      // Lab cover: reagents/inventory
      const labInvRes = await api.get('/lab-inventory');
      if (labInvRes.data && Array.isArray(labInvRes.data)) {
        setCoverageReagents(labInvRes.data.map(item => ({
          id: item._id,
          name: item.name || 'Unknown Reagent',
          level: item.stock || 0,
          unit: item.unit || 'units',
          minSafe: item.threshold || 0,
          status: (item.stock || 0) <= (item.threshold || 0) ? 'Low Stock' : 'Safe'
        })));
      }

      // Patients list
      const ptsRes = await api.get('/patients');
      if (ptsRes.data && Array.isArray(ptsRes.data)) {
        const mapped = ptsRes.data.map(p => ({
          ...p,
          uhid: `MDC-${p._id.toString().substring(18).toUpperCase()}`
        }));
        setPatients(mapped);
      }

      // Staff (Doctors) list
      const staffRes = await api.get('/auth/users/all');
      if (staffRes.data && Array.isArray(staffRes.data)) {
        setCoverageDoctors(staffRes.data.filter(s => s.role === 'doctor'));
      }
    } catch (err) {
      console.error("Failed to fetch coverage data", err);
    }
  };

  const fetchSales = async () => {
    try {
      setIsLoadingSales(true);
      const params = {
        page: salesCurrentPage,
        limit: salesPageSize
      };
      if (salesFilterType !== 'ALL') params.saleType = salesFilterType;
      if (salesFilterStatus !== 'ALL') params.status = salesFilterStatus;
      if (salesFilterPaymentMethod !== 'ALL') params.paymentMethod = salesFilterPaymentMethod;
      if (salesSearchQuery.trim()) params.search = salesSearchQuery.trim();

      const now = new Date();
      if (salesFilterDateRange === 'Today') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        params.startDate = start.toISOString();
        params.endDate = end.toISOString();
      } else if (salesFilterDateRange === 'This Week') {
        const day = now.getDay();
        const diffToMonday = (day === 0 ? -6 : 1) - day;
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0, 0);
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
        params.startDate = start.toISOString();
        params.endDate = end.toISOString();
      } else if (salesFilterDateRange === 'This Month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        params.startDate = start.toISOString();
        params.endDate = end.toISOString();
      } else if (salesFilterDateRange === 'Custom Range' && salesCustomStartDate && salesCustomEndDate) {
        const start = new Date(salesCustomStartDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(salesCustomEndDate);
        end.setHours(23, 59, 59, 999);
        params.startDate = start.toISOString();
        params.endDate = end.toISOString();
      }

      const res = await api.get('/pharmacy-sales', { params });
      if (res.data) {
        setPharmacySales(res.data.sales || []);
        setSalesTotalCount(res.data.pagination?.total || 0);
        setSalesTotalPages(res.data.pagination?.pages || 1);
      }
    } catch (err) {
      console.error("Failed to fetch pharmacy sales:", err);
    } finally {
      setIsLoadingSales(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [salesCurrentPage, salesFilterType, salesFilterStatus, salesFilterPaymentMethod, salesFilterDateRange, salesCustomStartDate, salesCustomEndDate, salesSearchQuery]);

  useEffect(() => {
    fetchOverviewSales();
  }, [activeTab]);

  const fetchData = async () => {
    try {
      const res = await api.get('/prescriptions');
      setPrescriptions(res.data);
      await fetchInventory();
      await fetchCoverageData();
      await fetchProcurementData();
      try {
        const returnRes = await api.get('/returns');
        setReturnLogs(returnRes.data);
      } catch (err) {
        console.error("Failed to fetch return logs:", err);
      }
      try {
        const indentsRes = await api.get('/indents');
        setIndents(indentsRes.data);
      } catch (err) {
        console.error("Failed to fetch indents:", err);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const dispensedPrescriptions = prescriptions.filter(p => p.status === 'Dispensed');

  const handleSelectPrescriptionForReturn = (pId) => {
    const rx = prescriptions.find(p => p._id === pId);
    if (rx) {
      setReturnPrescriptionId(rx._id);
      const code = rx._id ? `RX-${rx._id.substring(rx._id.length - 6).toUpperCase()}` : '';
      setReturnPrescriptionCode(code);
      setReturnPatientName(rx.patientId?.name || 'Walk-in');
      setReturnPatientPhone(rx.patientId?.phone || rx.patientId?.contact || '');
      const initialItems = (rx.items || []).map(item => {
        const medName = item.medicine || item.medicineName || item.name || '';
        const medInventory = inventory.find(i => i.name?.toLowerCase() === medName.toLowerCase());
        const price = medInventory ? medInventory.mrp : (item.price || 50);
        return {
          medicineName: medName,
          quantity: item.quantity || 1,
          maxQuantity: item.quantity || 1,
          unitPrice: price,
          reason: 'Doctor changed medication',
          action: 'Restocked',
          included: true
        };
      });
      setReturnItems(initialItems);
    }
  };

  const handleAddOfflineReturnItem = () => {
    setReturnItems(prev => [
      ...prev,
      { medicineName: '', quantity: 1, unitPrice: 0, reason: 'Doctor changed medication', action: 'Restocked' }
    ]);
  };

  const handleOfflineMedicineChange = (idx, medName) => {
    const med = inventory.find(i => i.name === medName);
    const updated = [...returnItems];
    updated[idx].medicineName = medName;
    if (med) {
      updated[idx].unitPrice = med.mrp || 0;
    }
    setReturnItems(updated);
  };

  const handleSaveReturnLog = async (e) => {
    e.preventDefault();
    if (!returnPatientName.trim()) {
      showToast("Please enter patient name.", true);
      return;
    }

    let itemsToSubmit = [];
    if (returnType === 'Prescription-Linked') {
      itemsToSubmit = returnItems.filter(item => item.included);
      if (itemsToSubmit.length === 0) {
        showToast("Please select at least one item to return.", true);
        return;
      }
    } else {
      itemsToSubmit = returnItems.filter(item => item.medicineName);
      if (itemsToSubmit.length === 0) {
        showToast("Please add at least one medicine to return.", true);
        return;
      }
    }

    const totalRefund = itemsToSubmit.reduce((acc, curr) => acc + (curr.quantity * curr.unitPrice), 0);

    const payload = {
      returnType,
      patientName: returnPatientName,
      patientPhone: returnPatientPhone,
      prescriptionId: returnType === 'Prescription-Linked' ? returnPrescriptionId : undefined,
      prescriptionCode: returnType === 'Prescription-Linked' ? returnPrescriptionCode : undefined,
      items: itemsToSubmit.map(item => ({
        medicineName: item.medicineName,
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(item.unitPrice) || 0,
        reason: item.reason,
        action: item.action
      })),
      totalRefund
    };

    try {
      await api.post('/returns', payload);
      showToast("Medication return logged successfully! Inventory updated.");
      setShowLogReturnModal(false);
      setReturnPatientName('');
      setReturnPatientPhone('');
      setReturnPrescriptionId('');
      setReturnPrescriptionCode('');
      setReturnItems([{ medicineName: '', quantity: 1, unitPrice: 0, reason: 'Doctor changed medication', action: 'Restocked' }]);
      fetchData();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Failed to log return.", true);
    }
  };

  // Compute stock alerts dynamically from real authoritative inventory
  const alerts = inventory
    .map((item, idx) => {
      const { sellableStock, status } = getMedicineSellableInfo(item);
      return {
        _id: item._id,
        id: `ALT-${idx + 1}`,
        item: item.name,
        type: status,
        severity: status === 'Out of Stock' ? 'High' : 'Medium',
        date: 'Today',
        rawItem: item,
        sellableStock
      };
    })
    .filter(a => a.type === 'Low Stock' || a.type === 'Out of Stock');

  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }, [activeTab, showProfileMenu, showMedicineModal, showPrescriptionModal, activeSubTab, prescriptionsFilter]);

  // Freeze background page scroll when any Modal Dialog is active
  useEffect(() => {
    if (showMedicineModal || showPrescriptionModal) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [showMedicineModal, showPrescriptionModal, activeTab]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const dispensePrescription = async (idOrIds) => {
    try {
      const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
      for (const id of ids) {
        await api.put(`/prescriptions/${id}`, { status: 'Dispensed' });
      }
      fetchData();
      setSuccessMessage('Prescription(s) Dispensed Successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setErrorMessage(err.response?.data?.error || 'Failed to dispense prescription(s)');
      setTimeout(() => setErrorMessage(''), 4000);
    }
  };

  const handleConfirmPaymentAndDispense = async () => {
    try {
      const raw = selectedPrescriptionGroup.rawObj;
      const ids = Array.isArray(raw) ? raw.map(x => x._id) : [raw._id];
      
      for (const id of ids) {
        await api.put(`/prescriptions/${id}`, { status: 'Dispensed', paymentMode: selectedPaymentMode });
      }

      // Create a Billing record in the backend for the dispensed prescription
      try {
        const patientId = selectedPrescriptionGroup.patientIdVal || 
                          (Array.isArray(raw) ? raw[0].patientId?._id || raw[0].patientId : raw.patientId?._id || raw.patientId);
        
        await api.post('/billing', {
          patientId,
          items: (selectedPrescriptionGroup.itemsList || []).map(item => ({
            description: `Medicine: ${item.medicine}`,
            amount: item.lineTotal || ((item.unitPrice || 0) * (item.quantity || 1))
          })),
          totalAmount: selectedPrescriptionGroup.amountVal || 0,
          paymentMethod: selectedPaymentMode,
          status: 'Paid'
        });
      } catch (billingErr) {
        console.error("Failed to auto-create billing record from pharmacy dispense", billingErr);
      }
      
      fetchData();
      setSuccessMessage(`Payment of ₹${(selectedPrescriptionGroup.amountVal || 0).toFixed(2)} settled via ${selectedPaymentMode}. Prescription dispensed successfully.`);
      setTimeout(() => setSuccessMessage(''), 4000);
      
      // Auto-trigger print invoice bill
      handlePrintInvoice(selectedPrescriptionGroup);
      
      setShowPrescriptionModal(false);
      setCashReceived('');
    } catch (err) {
      console.error(err);
      setErrorMessage(err.response?.data?.error || 'Failed to settle payment and dispense');
      setTimeout(() => setErrorMessage(''), 4000);
    }
  };

  const handlePrintInvoice = (group) => {
    const printWindow = window.open('', '_blank');
    const enrichedItems = group.itemsList || [];
    const computedTotal = enrichedItems.reduce((acc, item) => acc + (item.lineTotal || 0), 0);
    const itemsHtml = enrichedItems.map(item => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #E2E8F0; font-size: 14px; color: #0F172A; font-weight: 600;">
          ${item.medicine}
          <div style="font-size: 11px; color: #64748B; margin-top: 2px;">${item.dosage} • ${item.instructions || ''}</div>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #E2E8F0; text-align: center; font-size: 14px; color: #475569;">${item.duration}</td>
        <td style="padding: 12px; border-bottom: 1px solid #E2E8F0; text-align: center; font-size: 14px; color: #475569;">${item.quantity || 1}</td>
        <td style="padding: 12px; border-bottom: 1px solid #E2E8F0; text-align: right; font-size: 14px; color: #475569;">₹${(item.unitPrice || 0).toFixed(2)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #E2E8F0; text-align: right; font-size: 14px; color: #0F172A; font-weight: 700;">₹${(item.lineTotal || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice - ${group.id}</title>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet">
          <style>
            @page {
              size: A4;
              margin: 0;
            }
            body { font-family: 'Outfit', sans-serif; color: #1E293B; margin: 0; padding: 0; background: white; }
            .invoice-container {
              width: 100%;
              min-height: 100%;
              box-sizing: border-box;
              padding: 40mm 20mm 30mm 20mm; /* Space for letterhead */
              position: relative;
            }
            .print-letterhead-bg {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              width: 100%;
              height: 100%;
              z-index: -1;
              object-fit: contain;
              object-position: center top;
            }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #E2E8F0; padding-bottom: 20px; margin-bottom: 20px; }
            .title { font-size: 24px; font-weight: 800; color: #2563EB; }
            .meta { text-align: right; }
            .details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .card { padding: 16px; border: 1px solid #E2E8F0; border-radius: 12px; background: #F8FAFC; }
            .card-title { font-size: 12px; font-weight: 700; color: #64748B; text-transform: uppercase; margin-bottom: 6px; }
            .card-val { font-size: 14px; font-weight: 700; color: #0F172A; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #F8FAFC; padding: 12px; text-align: left; border-bottom: 2px solid #E2E8F0; font-size: 12px; font-weight: 700; color: #64748B; text-transform: uppercase; }
            .total { margin-top: 30px; text-align: right; font-size: 20px; font-weight: 800; color: #0F172A; border-top: 2px solid #E2E8F0; padding-top: 15px; }
            .print-only { display: block; }
            @media print {
              body * { visibility: hidden; }
              .invoice-container, .invoice-container *, .print-letterhead-bg { visibility: visible; }
              .invoice-container { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
            }
          </style>
        </head>
        <body>
          ${customPharmacyLetterhead ? (
            customPharmacyLetterhead.startsWith('data:application/pdf') || customPharmacyLetterhead.endsWith('.pdf') || customPharmacyLetterhead.includes('application/pdf') ? `
              <embed src="${customPharmacyLetterhead}" type="application/pdf" class="print-letterhead-bg" style="border: none;" />
            ` : `
              <img src="${customPharmacyLetterhead}" class="print-letterhead-bg" alt="Letterhead" />
            `
          ) : `
          <div class="print-only" style="position: fixed; top: 0; left: 0; width: 210mm; height: 25mm; background: #0F172A; color: white; padding: 5mm 15mm; box-sizing: border-box; z-index: -1;">
            <h1 style="margin: 0; font-size: 20px; font-weight: 900;">CUROXA PHARMACY</h1>
            <p style="margin: 0; font-size: 10px; opacity: 0.8;">Premium Healthcare EMR System</p>
          </div>
          `}
          <div class="invoice-container" style="position: relative; z-index: 10;">
            ${!customPharmacyLetterhead ? `
            <div class="header">
              <div>
                <div class="title">Curoxa Pharmacy</div>
                <p style="margin: 4px 0 0 0; font-size: 14px; color: #64748B;">Premium Healthcare EMR System</p>
              </div>
              <div class="meta">
                <h3 style="margin: 0; font-size: 20px; font-weight: 800; color: #0F172A;">INVOICE ${group.id}</h3>
                <p style="margin: 4px 0 0 0; font-size: 14px; color: #64748B;">Date: ${group.dateStr || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              </div>
            </div>
            ` : `
            <div class="meta" style="margin-bottom: 20px; text-align: right;">
                <h3 style="margin: 0; font-size: 20px; font-weight: 800; color: #0F172A;">INVOICE ${group.id}</h3>
                <p style="margin: 4px 0 0 0; font-size: 14px; color: #64748B;">Date: ${group.dateStr || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
            `}
          <div class="details">
            <div class="card">
              <div class="card-title">Patient Details</div>
              <div class="card-val">${group.name}</div>
              <div style="font-size: 13px; color: #64748B; margin-top: 2px;">${group.age} Y / ${group.gender}</div>
              <div style="font-size: 13px; color: #64748B; margin-top: 2px;">${group.phone || ''}</div>
            </div>
            <div class="card">
              <div class="card-title">Doctor Details</div>
              <div class="card-val">${group.docName}</div>
              <div style="font-size: 13px; color: #64748B; margin-top: 2px;">${group.specialty}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Medicine</th>
                <th style="text-align: center;">Duration</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Unit Price</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div class="total">Total: ₹${computedTotal.toFixed(2)}</div>
          <script>window.print();</script>
          </div> <!-- end invoice container -->
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleOpenAdd = () => {
    setModalMode('add');
    setFormData({
      name: '',
      category: 'Pain Relief',
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      stock: 50,
      unit: 'Strip',
      mrp: 20.00,
      expiry: '31/12/2025'
    });
    setShowMedicineModal(true);
  };

  const handleOpenEdit = (item) => {
    setModalMode('edit');
    setCurrentId(item._id);
    setFormData({
      name: item.name,
      category: item.category,
      sku: item.sku,
      stock: item.stock,
      unit: item.unit,
      mrp: item.mrp,
      expiry: item.expiry
    });
    setShowMedicineModal(true);
  };

  const handleOpenRestock = (item) => {
    setModalMode('restock');
    setCurrentId(item._id);
    setFormData({
      name: item.name,
      category: item.category,
      sku: item.sku,
      stock: item.stock,
      unit: item.unit,
      mrp: item.mrp,
      expiry: item.expiry
    });
    setShowMedicineModal(true);
  };

  const handleSaveMedicine = async (e) => {
    e.preventDefault();
    try {
      if (modalMode === 'add') {
        await api.post('/medicines', formData);
        setSuccessMessage('Medicine added successfully');
      } else {
        await api.put(`/medicines/${currentId}`, formData);
        setSuccessMessage('Medicine updated successfully');
      }
      setShowMedicineModal(false);
      fetchInventory();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setErrorMessage(err.response?.data?.error || 'Failed to save medicine');
      setTimeout(() => setErrorMessage(''), 3000);
    }
  };

  const handleDeleteMedicine = async (id) => {
    try {
      await api.delete(`/medicines/${id}`);
      setSuccessMessage('Medicine deleted successfully');
      fetchInventory();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to delete medicine');
      setTimeout(() => setErrorMessage(''), 3000);
    }
  };

  // Beautiful calendar days generator (Mon-Sun layout)
  const getCalendarDays = () => {
    const year = activeCalendarDate.getFullYear();
    const month = activeCalendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1; // Align Mon = 0
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    
    const daysList = [];
    // Previous Month padding
    for (let i = startDay - 1; i >= 0; i--) {
      daysList.push({ day: daysInPrev - i, current: false });
    }
    // Current Month days
    for (let i = 1; i <= daysInMonth; i++) {
      daysList.push({ day: i, current: true });
    }
    // Next Month padding
    const remaining = 35 - daysList.length;
    for (let i = 1; i <= remaining; i++) {
      daysList.push({ day: i, current: false });
    }
    return daysList;
  };

  const handlePrevMonth = () => {
    setActiveCalendarDate(new Date(activeCalendarDate.getFullYear(), activeCalendarDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setActiveCalendarDate(new Date(activeCalendarDate.getFullYear(), activeCalendarDate.getMonth() + 1, 1));
  };

  const getSalesBreakdown = () => {
    let cash = 0;
    let upi = 0;
    let card = 0;

    prescriptions
      .filter(p => p.status === 'Dispensed' || p.status === 'Dispensed by Pharmacy')
      .forEach(p => {
        const amt = (p.items || []).reduce((acc, curr) => {
          const invItem = inventory.find(inv => inv.name.toLowerCase() === (curr.medicine || '').toLowerCase());
          const price = invItem ? invItem.mrp : (curr.price || 50);
          let qty = curr.quantity || 1;
          if (qty === 1 && curr.duration) {
            const match = curr.duration.match(/\d+/);
            if (match) {
              const days = parseInt(match[0]);
              let freq = 2;
              if (curr.dosage) {
                const dos = curr.dosage.toLowerCase();
                if (dos.includes('once') || dos === '1-0-0' || dos === '0-0-1' || dos === '0-1-0') freq = 1;
                else if (dos.includes('thrice') || dos === '1-1-1') freq = 3;
              }
              qty = days * freq;
            }
          }
          return acc + (price * qty);
        }, 0);

        const mode = p.paymentMode || (p._id ? ['UPI', 'Cash', 'Card'][parseInt(p._id.substring(p._id.length - 2), 16) % 3] : 'UPI');
        if (mode === 'Cash') cash += amt;
        else if (mode === 'Card') card += amt;
        else upi += amt;
      });

    const total = cash + upi + card;
    return { cash, upi, card, total };
  };

  // Resolve medicine price from pharmacy inventory by matching name
  const resolveItemPrice = (medicineName) => {
    if (!medicineName || !inventory || inventory.length === 0) return 0;
    const normalised = medicineName.trim().toLowerCase();
    const match = inventory.find(inv => inv.name && inv.name.trim().toLowerCase() === normalised);
    return match ? (match.mrp || 0) : 0;
  };

  // Enrich prescription items with real inventory prices
  const enrichItemsWithPrice = (items) => {
    if (!items || items.length === 0) return [];
    return items.map(item => {
      const unitPrice = item.price || resolveItemPrice(item.medicine) || 0;
      const qty = item.quantity || 1;
      return { ...item, unitPrice, quantity: qty, lineTotal: unitPrice * qty };
    });
  };

  // High fidelity default data lists matching the design screenshot
  // Real backend prescriptions only
  const getPrescriptionsList = () => {
    const formattedBackend = prescriptions.map((p, index) => {
      const pId = p._id ? `#RX-${p._id.substring(p._id.length - 6).toUpperCase()}` : `#RX-00${index}`;
      const enrichedItems = enrichItemsWithPrice(p.items);
      const computedTotal = enrichedItems.reduce((acc, curr) => acc + curr.lineTotal, 0);
      return {
        id: pId,
        name: p.patientId?.name || 'Unknown Patient',
        age: p.patientId?.age ? String(p.patientId.age) : '',
        gender: p.patientId?.gender || 'Male',
        phone: p.patientId?.contact || p.patientId?.phone || '',
        patientIdVal: p.patientId?._id || '',
        docName: p.doctorId?.name || 'Dr. Self',
        specialty: p.doctorId?.specialty || 'General Practitioner',
        time: p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
        dateObj: p.createdAt ? new Date(p.createdAt) : new Date(),
        itemsCount: enrichedItems.length,
        itemsList: enrichedItems,
        amountVal: computedTotal,
        status: p.status === 'Pending Pharmacy Dispatch' ? 'Pending' : p.status,
        rawObj: p
      };
    });

    const finalQueue = formattedBackend.map(rx => ({
      ...rx,
      items: rx.itemsCount,
      amount: `₹${rx.amountVal.toFixed(2)}`
    }));

    // Filter by Active Calendar Date
    let filtered = finalQueue;
    if (activeCalendarDate) {
      filtered = filtered.filter(p => {
        const d = p.dateObj;
        return d.getDate() === activeCalendarDate.getDate() &&
               d.getMonth() === activeCalendarDate.getMonth() &&
               d.getFullYear() === activeCalendarDate.getFullYear();
      });
    }

    // Filter by Sub Tab
    if (activeSubTab === 'Urgent') {
      return filtered.filter(p => p.status === 'Pending').slice(0, 2); 
    } else if (activeSubTab === 'New') {
      return filtered.filter(p => p.status === 'Pending');
    } else if (activeSubTab === 'In Progress') {
      return filtered.filter(p => p.status === 'In Progress');
    }
    return filtered;
  };

  const getDedicatedPrescriptionsList = () => {
    const formattedBackend = prescriptions.map((p, index) => {
      const pId = p._id ? `RX-${p._id.substring(p._id.length - 6).toUpperCase()}` : `RX-00${index}`;
      const enrichedItems = enrichItemsWithPrice(p.items);
      const computedTotal = enrichedItems.reduce((acc, curr) => acc + curr.lineTotal, 0);
      return {
        id: pId,
        name: p.patientId?.name || 'Unknown Patient',
        age: p.patientId?.age || 33,
        gender: p.patientId?.gender || 'Male',
        phone: p.patientId?.phone || p.patientId?.contact || '9876543210',
        patientIdVal: p.patientId?._id || '',
        docName: p.doctorId?.name || 'Dr. Self',
        specialty: p.doctorId?.specialty || 'General Medicine',
        time: p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '10:20 AM',
        dateStr: p.createdAt ? new Date(p.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : '24 May 2024',
        dateObj: p.createdAt ? new Date(p.createdAt) : new Date(),
        itemsCount: enrichedItems.length,
        itemsList: enrichedItems,
        amountVal: computedTotal,
        status: p.status === 'Pending Pharmacy Dispatch' ? 'Pending' : p.status,
        rawObj: p
      };
    });

    let finalQueue = formattedBackend.map(rx => ({
      ...rx,
      items: rx.itemsCount,
      amount: `₹${rx.amountVal.toFixed(2)}`
    }));

    // 1. Filter based on prescriptionFilter state
    if (prescriptionsFilter !== 'All') {
      finalQueue = finalQueue.filter(p => p.status.toLowerCase() === prescriptionsFilter.toLowerCase());
    }

    // 2. Filter based on Search Query
    if (prescriptionsSearchQuery.trim()) {
      const q = prescriptionsSearchQuery.toLowerCase();
      finalQueue = finalQueue.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    }

    // 3. Filter by Date Picker (prescriptionsDateFilter format YYYY-MM-DD)
    if (prescriptionsDateFilter) {
      const filterDateStr = new Date(prescriptionsDateFilter).toDateString();
      finalQueue = finalQueue.filter(p => {
        const d = p.dateObj;
        return d.toDateString() === filterDateStr;
      });
    }

    return finalQueue;
  };

  const activeQueue = getPrescriptionsList();
  const activeTabPrescriptions = getDedicatedPrescriptionsList();

  // Dynamic pagination for Overview queue
  const overviewPageSize = 5;
  const totalOverviewPages = Math.ceil(activeQueue.length / overviewPageSize) || 1;
  const paginatedOverviewQueue = activeQueue.slice((overviewPage - 1) * overviewPageSize, overviewPage * overviewPageSize);

  // Dynamic pagination for prescriptions tab
  const prescriptionsPageSize = 10;
  const totalPrescriptionsPages = Math.ceil(activeTabPrescriptions.length / prescriptionsPageSize) || 1;
  const paginatedPrescriptions = activeTabPrescriptions.slice((prescriptionsPage - 1) * prescriptionsPageSize, prescriptionsPage * prescriptionsPageSize);

  // === DYNAMIC PHARMACY OVERVIEW METRICS ===
  const isSameCalendarDay = (dateA, dateB) => {
    if (!dateA || !dateB) return false;
    const dA = new Date(dateA);
    const dB = new Date(dateB);
    return !isNaN(dA.getTime()) && !isNaN(dB.getTime()) &&
           dA.getFullYear() === dB.getFullYear() &&
           dA.getMonth() === dB.getMonth() &&
           dA.getDate() === dB.getDate();
  };

  const isTodayDate = (dateVal) => {
    if (!dateVal) return false;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate();
  };

  const todayDate = useMemo(() => new Date(), []);

  // Top KPI Card 1: Today's Prescriptions
  const todayPrescriptionsList = useMemo(() => {
    return prescriptions.filter(p => p.createdAt && (isTodayDate(p.createdAt) || isSameCalendarDay(p.createdAt, todayDate)));
  }, [prescriptions, todayDate]);

  // Top KPI Card 2: Pending to Dispense
  const pendingDispenseCount = useMemo(() => {
    return prescriptions.filter(p => 
      p.status === 'Pending' || 
      p.status === 'Pending Pharmacy Dispatch' || 
      p.status === 'In Progress'
    ).length;
  }, [prescriptions]);

  // Top KPI Card 3: Prescriptions Dispensed
  const dispensedPrescriptionsCount = useMemo(() => {
    return prescriptions.filter(p => 
      p.status === 'Dispensed' || 
      p.status === 'Dispensed by Pharmacy'
    ).length;
  }, [prescriptions]);

  // Combined Sales List with fallback
  const allSalesList = useMemo(() => {
    if (overviewSales && overviewSales.length > 0) return overviewSales;
    if (pharmacySales && pharmacySales.length > 0) return pharmacySales;
    return [];
  }, [overviewSales, pharmacySales]);

  // Top KPI Card 4: Today's Sales from actual PharmacySale records
  const todayOverviewSales = useMemo(() => {
    return (allSalesList || []).filter(s => {
      if (s.status === 'CANCELLED') return false;
      const d = s.saleDate || s.createdAt;
      return isTodayDate(d);
    });
  }, [allSalesList]);

  const todaySalesTotalRev = useMemo(() => {
    return todayOverviewSales.reduce((acc, s) => acc + (Number(s.grandTotal) || 0), 0);
  }, [todayOverviewSales]);

  // Top KPI Card 5: Low Stock Items (authoritative FEFO/batch & catalog unified)
  const lowStockTotalCount = useMemo(() => {
    return inventory.filter(item => {
      const { sellableStock, status } = getMedicineSellableInfo(item);
      return status === 'Low Stock' || status === 'Out of Stock' || sellableStock <= 20;
    }).length;
  }, [inventory, getMedicineSellableInfo]);

  // Today's Overview Calendar Card Stats
  const calendarDayPrescriptions = useMemo(() => {
    if (!activeCalendarDate) return [];
    return prescriptions.filter(p => p.createdAt && isSameCalendarDay(p.createdAt, activeCalendarDate));
  }, [prescriptions, activeCalendarDate]);

  const calendarDayStats = useMemo(() => {
    const total = calendarDayPrescriptions.length;
    const dispensed = calendarDayPrescriptions.filter(p => p.status === 'Dispensed' || p.status === 'Dispensed by Pharmacy').length;
    const pending = calendarDayPrescriptions.filter(p => p.status === 'Pending' || p.status === 'Pending Pharmacy Dispatch' || p.status === 'In Progress').length;
    const cancelled = calendarDayPrescriptions.filter(p => p.status === 'Cancelled').length;
    return { total, dispensed, pending, cancelled };
  }, [calendarDayPrescriptions]);

  // Bottom Card 1: Inventory Snapshot Stats (authoritative FEFO/batch & catalog unified)
  const inventorySnapshotStats = useMemo(() => {
    const total = inventory.length;
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;

    inventory.forEach(item => {
      const { sellableStock, status } = getMedicineSellableInfo(item);
      if (status === 'Out of Stock' || sellableStock <= 0) {
        outOfStock++;
      } else if (status === 'Low Stock' || sellableStock <= 20) {
        lowStock++;
      } else {
        inStock++;
      }
    });

    const inStockPct = total > 0 ? Math.round((inStock / total) * 100) : 0;
    const lowStockPct = total > 0 ? Math.round((lowStock / total) * 100) : 0;
    const outOfStockPct = total > 0 ? Math.max(0, 100 - inStockPct - lowStockPct) : 0;

    return { total, inStock, lowStock, outOfStock, inStockPct, lowStockPct, outOfStockPct };
  }, [inventory, getMedicineSellableInfo]);

  // Bottom Card 2: Sales Split Stats (reconciled with actual PharmacySale records)
  const salesSplitStats = useMemo(() => {
    const validSales = (allSalesList || []).filter(s => s.status !== 'CANCELLED');
    let directSales = 0;
    let opdSales = 0;
    let ipdSales = 0;
    let otherSales = 0;
    let totalDiscount = 0;

    validSales.forEach(s => {
      const amount = Number(s.grandTotal) || 0;
      const disc = Number(s.totalDiscount) || 0;
      totalDiscount += disc;

      if (s.saleType === 'DIRECT') {
        directSales += amount;
      } else if (s.saleType === 'PRESCRIPTION') {
        opdSales += amount;
      } else {
        otherSales += amount;
      }
    });

    const totalSales = directSales + opdSales + ipdSales + otherSales;
    const base = totalSales > 0 ? totalSales : 1;
    const directPct = totalSales > 0 ? Math.round((directSales / base) * 100) : 0;
    const opdPct = totalSales > 0 ? Math.round((opdSales / base) * 100) : 0;
    const ipdPct = totalSales > 0 ? Math.round((ipdSales / base) * 100) : 0;
    const otherPct = totalSales > 0 ? Math.max(0, 100 - directPct - opdPct - ipdPct) : 0;

    return {
      directSales,
      opdSales,
      ipdSales,
      otherSales,
      totalDiscount,
      totalSales,
      directPct,
      opdPct,
      ipdPct,
      otherPct
    };
  }, [allSalesList]);

  // Bottom Card 3: Actual Low Stock Alerts from inventory (authoritative FEFO/batch & catalog unified)
  const actualLowStockAlerts = useMemo(() => {
    return inventory
      .map(item => {
        const { sellableStock, status } = getMedicineSellableInfo(item);
        return {
          name: item.name,
          stock: sellableStock,
          status,
          severity: sellableStock <= 0 ? 'red' : 'orange'
        };
      })
      .filter(item => item.status === 'Low Stock' || item.status === 'Out of Stock' || item.stock <= 20)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 4);
  }, [inventory, getMedicineSellableInfo]);

  // Bottom Card 4: Payment Summary (Today's collected vs pending from actual sales)
  const paymentSummaryToday = useMemo(() => {
    let collected = 0;
    let pending = 0;

    todayOverviewSales.forEach(s => {
      const grandTotal = Number(s.grandTotal) || 0;
      const received = Number(s.amountReceived) || 0;

      if (s.paymentStatus === 'PAID') {
        collected += grandTotal;
      } else if (s.paymentStatus === 'PENDING') {
        collected += received;
        pending += Math.max(0, grandTotal - received);
      }
    });

    return { collected, pending };
  }, [todayOverviewSales]);

    const salesBreakdown = getSalesBreakdown();
  const totalVal = salesBreakdown.total || 1;
  const cashPct = Math.round((salesBreakdown.cash / totalVal) * 100);
  const cardPct = Math.round((salesBreakdown.card / totalVal) * 100);

  return (
    <>
      <style>{`
        /* Box sizing safeguard for layout alignments */
        *, *::before, *::after {
          box-sizing: border-box !important;
        }

        html, body {
          background-color: #F8FAFC !important;
          font-family: 'Urbanist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          overflow-x: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        .modal-overlay {
          display: flex !important;
          z-index: 1300 !important;
          background: rgba(15, 23, 42, 0.45) !important;
          backdrop-filter: blur(8px) !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          align-items: center !important;
          justify-content: center !important;
        }

        /* 1. Flagship Light Theme Sidebar Navigation (Identical to Admin Portal) */
        .admin-sidebar {
          width: 260px !important;
          background: rgba(255, 255, 255, 0.94) !important;
          backdrop-filter: blur(16px) !important;
          -webkit-backdrop-filter: blur(16px) !important;
          color: #0F172A !important;
          display: flex !important;
          flex-direction: column !important;
          position: fixed !important;
          top: 0 !important;
          bottom: 0 !important;
          left: 0 !important;
          height: 100vh !important;
          height: 100dvh !important;
          min-height: 100vh !important;
          min-height: calc(100vh / 0.9) !important;
          z-index: 1000 !important;
          border-right: 1px solid rgba(226, 232, 240, 0.85) !important;
          border-top-right-radius: 28px !important;
          border-bottom-right-radius: 28px !important;
          box-shadow: 0 10px 30px -5px rgba(15, 23, 42, 0.04) !important;
          overscroll-behavior: contain !important;
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          box-sizing: border-box !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
        }

        .admin-sidebar.collapsed {
          width: 76px !important;
        }
        .admin-sidebar.collapsed .sidebar-brand-text,
        .admin-sidebar.collapsed .sidebar-brand-subtitle,
        .admin-sidebar.collapsed .sidebar-group-title,
        .admin-sidebar.collapsed .sidebar-link-text,
        .admin-sidebar.collapsed .sidebar-link span,
        .admin-sidebar.collapsed .profile-info,
        .admin-sidebar.collapsed .profile-chevron {
          display: none !important;
        }
        .admin-sidebar.collapsed .sidebar-brand {
          justify-content: center !important;
          padding: 16px 8px 14px !important;
        }
        .admin-sidebar.collapsed .sidebar-nav-container {
          padding: 10px 6px !important;
        }
        .admin-sidebar.collapsed .sidebar-link {
          justify-content: center !important;
          padding: 6px !important;
        }
        .admin-sidebar.collapsed .sidebar-zone {
          padding: 4px 2px !important;
          background: transparent !important;
        }
        .admin-sidebar.collapsed .sidebar-profile {
          margin: auto 6px 12px !important;
          padding: 6px !important;
          justify-content: center !important;
          width: 44px !important;
          height: 44px !important;
        }

        .sidebar-brand-wrapper {
          position: relative !important;
          overflow: visible !important;
          flex-shrink: 0 !important;
        }

        .sidebar-brand {
          padding: 24px 20px 16px 20px !important;
          display: flex !important;
          align-items: center !important;
          gap: 14px !important;
          position: relative !important;
          z-index: 10 !important;
        }

        .sidebar-nav-container {
          flex: 1 !important;
          overflow-y: auto !important;
          padding: 8px 12px 14px 12px !important;
          overscroll-behavior: contain !important;
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
          min-height: 0 !important;
        }
        .sidebar-nav-container::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }

        .sidebar-group {
          margin-bottom: 14px !important;
        }

        .sidebar-group-title {
          font-size: 12.5px !important;
          font-weight: 800 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.07em !important;
          line-height: 1.25 !important;
          margin-bottom: 8px !important;
          padding: 4px 8px !important;
          border-radius: 8px !important;
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          cursor: pointer !important;
          user-select: none !important;
          transition: background-color 0.15s ease, margin-bottom 0.2s ease !important;
        }
        .sidebar-group-title:hover {
          background-color: rgba(0, 0, 0, 0.035) !important;
        }
        .sidebar-group-title.collapsed {
          margin-bottom: 0px !important;
        }
        .sidebar-group-chevron {
          margin-left: auto !important;
          transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
          opacity: 0.7 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .sidebar-group-title:hover .sidebar-group-chevron {
          opacity: 1 !important;
        }

        .sidebar-zone-clinic {
          background: linear-gradient(180deg, rgba(240, 253, 250, 0.75) 0%, rgba(236, 254, 255, 0.45) 100%) !important;
          border-radius: 18px !important;
          padding: 10px 8px !important;
          margin-top: 14px !important;
          margin-bottom: 14px !important;
          transition: all 0.25s ease !important;
        }
        .sidebar-zone-clinic.collapsed {
          padding: 6px 8px !important;
          margin-top: 8px !important;
          margin-bottom: 8px !important;
        }

        .sidebar-zone-finance {
          background: linear-gradient(180deg, rgba(255, 247, 237, 0.8) 0%, rgba(254, 242, 242, 0.35) 100%) !important;
          border-radius: 18px !important;
          padding: 10px 8px !important;
          margin-top: 14px !important;
          margin-bottom: 14px !important;
          transition: all 0.25s ease !important;
        }
        .sidebar-zone-finance.collapsed {
          padding: 6px 8px !important;
          margin-top: 8px !important;
          margin-bottom: 8px !important;
        }

        .sidebar-link {
          position: relative !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          padding: 5px 8px !important;
          border-radius: 14px !important;
          color: #0F172A !important;
          text-decoration: none !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          line-height: 1.25 !important;
          transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1) !important;
          margin-bottom: 3px !important;
          cursor: pointer !important;
          user-select: none !important;
          border: 1px solid transparent !important;
        }

        .sidebar-link-text {
          line-height: 1.25 !important;
          font-size: 13.5px !important;
          font-weight: 600 !important;
          color: #0F172A !important;
          transition: all 0.2s ease !important;
        }

        .sidebar-link:hover:not(.active) {
          background-color: rgba(241, 245, 249, 0.85) !important;
          transform: translateX(2px) !important;
        }

        /* 3D POPPED-OUT ACTIVE STATE WITH RICH DEPTH & SHADOWS */
        .sidebar-link.active {
          background: linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%) !important;
          border: 1px solid rgba(219, 234, 254, 0.95) !important;
          box-shadow: 
            0 10px 24px -3px rgba(37, 99, 235, 0.18),
            0 4px 10px -2px rgba(15, 23, 42, 0.08),
            0 1px 3px rgba(0, 0, 0, 0.04),
            inset 0 1px 0 #FFFFFF !important;
          transform: translateY(-1.5px) !important;
          z-index: 5 !important;
        }

        .sidebar-link.active .sidebar-link-text {
          color: #2563EB !important;
          font-weight: 800 !important;
          letter-spacing: -0.01em !important;
        }

        .sidebar-link.active .sidebar-link-icon {
          transform: scale(1.04) !important;
          box-shadow: 0 5px 15px -1px rgba(37, 99, 235, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.4) !important;
        }

        /* Clinic zone active 3D pop */
        .sidebar-zone-clinic .sidebar-link.active {
          border-color: rgba(153, 246, 228, 0.95) !important;
          box-shadow: 
            0 10px 24px -3px rgba(13, 148, 136, 0.2),
            0 4px 10px -2px rgba(15, 23, 42, 0.08),
            0 1px 3px rgba(0, 0, 0, 0.04),
            inset 0 1px 0 #FFFFFF !important;
        }
        .sidebar-zone-clinic .sidebar-link.active .sidebar-link-text {
          color: #0D9488 !important;
        }
        .sidebar-zone-clinic .sidebar-link.active .sidebar-link-icon {
          box-shadow: 0 5px 15px -1px rgba(13, 148, 136, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.4) !important;
        }

        /* Finance zone active 3D pop */
        .sidebar-zone-finance .sidebar-link.active {
          border-color: rgba(254, 215, 170, 0.95) !important;
          box-shadow: 
            0 10px 24px -3px rgba(234, 88, 12, 0.2),
            0 4px 10px -2px rgba(15, 23, 42, 0.08),
            0 1px 3px rgba(0, 0, 0, 0.04),
            inset 0 1px 0 #FFFFFF !important;
        }
        .sidebar-zone-finance .sidebar-link.active .sidebar-link-text {
          color: #EA580C !important;
        }
        .sidebar-zone-finance .sidebar-link.active .sidebar-link-icon {
          box-shadow: 0 5px 15px -1px rgba(234, 88, 12, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.4) !important;
        }

        .sidebar-link-icon {
          width: 36px !important;
          height: 36px !important;
          border-radius: 11px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
          transition: all 0.2s ease !important;
        }

        .sidebar-profile-footer {
          position: relative !important;
          padding: 8px 10px 12px 10px !important;
          background: #FFFFFF !important;
          border-bottom-right-radius: 28px !important;
          flex-shrink: 0 !important;
          z-index: 20 !important;
          margin-top: auto !important;
        }
        .admin-sidebar.collapsed .sidebar-profile-footer,
        .sidebar.collapsed .sidebar-profile-footer {
          padding: 8px 6px 12px 6px !important;
        }
        .sidebar-profile-fade-top {
          position: absolute !important;
          top: -16px !important;
          left: 0 !important;
          right: 0 !important;
          height: 16px !important;
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.45) 50%, rgba(255, 255, 255, 0.9) 100%) !important;
          pointer-events: none !important;
          backdrop-filter: blur(0.75px) !important;
          -webkit-backdrop-filter: blur(0.75px) !important;
          z-index: 15 !important;
        }

        .sidebar-profile {
          margin: 0 !important;
          padding: 7px 10px !important;
          border-radius: 14px !important;
          background: linear-gradient(135deg, #EEF4FF 0%, #F5F8FF 45%, #FFFFFF 100%) !important;
          border: 1px solid rgba(219, 234, 254, 0.8) !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          position: relative !important;
          box-shadow: 0 4px 14px -2px rgba(30, 58, 138, 0.05), 0 1px 3px rgba(0, 0, 0, 0.02) !important;
          line-height: 1.2 !important;
          user-select: none !important;
        }
        .sidebar-profile:hover {
          background: linear-gradient(135deg, #E0E7FF 0%, #EEF2FF 50%, #FFFFFF 100%) !important;
          border-color: #C7D2FE !important;
          box-shadow: 0 6px 18px -2px rgba(30, 58, 138, 0.1) !important;
        }
        .admin-sidebar.collapsed .sidebar-profile,
        .sidebar.collapsed .sidebar-profile {
          margin: 0 auto !important;
          padding: 6px !important;
          justify-content: center !important;
          width: 44px !important;
          height: 44px !important;
        }
        .profile-avatar-wrap {
          position: relative !important;
          flex-shrink: 0 !important;
          display: inline-flex !important;
        }
        .profile-avatar-status-dot {
          position: absolute !important;
          bottom: -1px !important;
          right: -1px !important;
          width: 9px !important;
          height: 9px !important;
          border-radius: 50% !important;
          background: #22C55E !important;
          border: 2px solid #FFFFFF !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15) !important;
        }
        .profile-avatar {
          width: 36px !important;
          height: 36px !important;
          border-radius: 50% !important;
          object-fit: cover !important;
          border: 1.5px solid #818CF8 !important;
        }
        .profile-avatar-initials {
          width: 36px !important;
          height: 36px !important;
          border-radius: 50% !important;
          background: linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #8B5CF6 100%) !important;
          color: #FFFFFF !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-weight: 800 !important;
          font-size: 13.5px !important;
          box-shadow: 0 3px 8px rgba(79, 70, 229, 0.3) !important;
          flex-shrink: 0 !important;
        }
        .profile-info {
          display: flex !important;
          flex-direction: column !important;
          flex: 1 !important;
          min-width: 0 !important;
        }
        .profile-name {
          font-size: 13.5px !important;
          font-weight: 800 !important;
          color: #0F172A !important;
          line-height: 1.2 !important;
          white-space: nowrap !important;
          text-overflow: ellipsis !important;
          overflow: hidden !important;
        }
        .profile-role {
          font-size: 11px !important;
          color: #64748B !important;
          font-weight: 600 !important;
          line-height: 1.2 !important;
          margin-top: 1px !important;
          white-space: nowrap !important;
          text-overflow: ellipsis !important;
          overflow: hidden !important;
        }
        .profile-chevron {
          color: #2563EB !important;
          display: flex !important;
          align-items: center !important;
          transition: transform 0.25s ease !important;
          flex-shrink: 0 !important;
        }

        /* Profile Floating Popover Menu */
        .sidebar-profile-popover-card {
          position: absolute !important;
          bottom: 66px !important;
          left: 8px !important;
          right: 8px !important;
          background: #FFFFFF !important;
          border-radius: 18px !important;
          padding: 6px !important;
          box-shadow: 0 12px 36px -4px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(226, 232, 240, 0.8) !important;
          z-index: 1100 !important;
          animation: popoverFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
          min-width: 210px !important;
        }
        @keyframes popoverFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* TOP NAV STYLES */
        .top-nav {
          margin-left: 260px !important;
          height: 64px !important;
          padding: 0 28px !important;
          border-bottom: 1px solid #F1F5F9 !important;
          background: #FFFFFF !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          position: fixed !important;
          top: 0 !important;
          right: 0 !important;
          left: 0 !important;
          z-index: 99 !important;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02) !important;
          transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .top-nav.collapsed {
          margin-left: 76px !important;
        }
        .top-nav-left {
          display: flex !important;
          flex-direction: column !important;
          gap: 2px !important;
        }
        .top-nav-page-title {
          font-size: 20px !important;
          font-weight: 800 !important;
          color: #0F172A !important;
          letter-spacing: -0.02em !important;
          line-height: 1.2 !important;
        }
        .top-nav-greeting {
          font-size: 12.5px !important;
          color: #64748B !important;
          font-weight: 600 !important;
        }
        .top-nav-right {
          display: flex !important;
          align-items: center !important;
          gap: 14px !important;
        }

        .main-content {
          margin-left: 260px !important;
          margin-top: 64px !important;
          padding: 24px 28px 40px 28px !important;
          background-color: #F8FAFC !important;
          min-height: calc(100vh - 64px) !important;
          transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .main-content.collapsed {
          margin-left: 76px !important;
        }
        .tab-content {
          padding: 0px !important;
        }

        /* GLASS & ELEVATED CARDS */
        .glass-card {
          background: #FFFFFF !important;
          border: 1px solid #F1F5F9 !important;
          border-radius: 18px !important;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.015) !important;
          padding: 22px !important;
          transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .glass-card:hover {
          box-shadow: 0 8px 26px rgba(15, 23, 42, 0.035) !important;
        }

        /* 5-KPI METRICS GRID */
        .kpi-grid {
          display: grid !important;
          grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
          gap: 16px !important;
          margin-bottom: 24px !important;
        }

        .premium-kpi-card {
          background: #FFFFFF !important;
          border-radius: 18px !important;
          padding: 18px !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          min-height: 126px !important;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
          cursor: pointer !important;
          position: relative !important;
          overflow: hidden !important;
        }
        .premium-kpi-card:hover {
          transform: translateY(-3px) !important;
        }

        /* Distinctive KPI card tints & borders */
        .kpi-card-prescriptions {
          border: 1px solid #EEF2FF !important;
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.04) !important;
        }
        .kpi-card-prescriptions:hover {
          border-color: #C7D2FE !important;
          box-shadow: 0 8px 24px rgba(99, 102, 241, 0.09) !important;
        }

        .kpi-card-pending {
          border: 1px solid #FFEDD5 !important;
          box-shadow: 0 4px 16px rgba(249, 115, 22, 0.04) !important;
        }
        .kpi-card-pending:hover {
          border-color: #FDBA74 !important;
          box-shadow: 0 8px 24px rgba(249, 115, 22, 0.1) !important;
        }

        .kpi-card-dispensed {
          border: 1px solid #D1FAE5 !important;
          box-shadow: 0 4px 16px rgba(16, 185, 129, 0.04) !important;
        }
        .kpi-card-dispensed:hover {
          border-color: #A7F3D0 !important;
          box-shadow: 0 8px 24px rgba(16, 185, 129, 0.09) !important;
        }

        .kpi-card-sales {
          border: 1px solid #DBEAFE !important;
          box-shadow: 0 4px 16px rgba(37, 99, 235, 0.04) !important;
        }
        .kpi-card-sales:hover {
          border-color: #93C5FD !important;
          box-shadow: 0 8px 24px rgba(37, 99, 235, 0.09) !important;
        }

        .kpi-card-lowstock {
          border: 1px solid #FEE2E2 !important;
          box-shadow: 0 4px 16px rgba(239, 68, 68, 0.04) !important;
        }
        .kpi-card-lowstock:hover {
          border-color: #FCA5A5 !important;
          box-shadow: 0 8px 24px rgba(239, 68, 68, 0.1) !important;
        }

        .kpi-top-row {
          display: flex !important;
          align-items: flex-start !important;
          gap: 12px !important;
        }
        .icon-box-kpi {
          width: 38px !important;
          height: 38px !important;
          border-radius: 10px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
        }
        .kpi-title-and-val {
          display: flex !important;
          flex-direction: column !important;
        }
        .kpi-lbl {
          font-size: 11.5px !important;
          color: #64748B !important;
          font-weight: 700 !important;
          line-height: 1.2 !important;
          margin-bottom: 4px !important;
          white-space: nowrap !important;
        }
        .kpi-val {
          font-size: 26px !important;
          font-weight: 800 !important;
          color: #0F172A !important;
          line-height: 1.1 !important;
          letter-spacing: -0.02em !important;
        }
        .kpi-bottom-row {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          margin-top: 10px !important;
        }
        .kpi-status-pill {
          display: inline-flex !important;
          align-items: center !important;
          gap: 5px !important;
          font-size: 11px !important;
          font-weight: 700 !important;
        }
        .kpi-status-dot {
          width: 6px !important;
          height: 6px !important;
          border-radius: 50% !important;
        }

        /* TABLES */
        .premium-table {
          width: 100% !important;
          border-collapse: collapse !important;
          text-align: left !important;
        }
        .premium-table th {
          font-size: 10.5px !important;
          font-weight: 800 !important;
          color: #94A3B8 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.6px !important;
          padding: 12px 14px !important;
          border-bottom: 1px solid #F1F5F9 !important;
        }
        .premium-table td {
          padding: 14px !important;
          border-bottom: 1px solid #F8FAFC !important;
          font-size: 13px !important;
        }
        .premium-table tbody tr:hover {
          background-color: #F8FAFC !important;
        }

        /* BADGES */
        .pill-badge {
          padding: 4px 10px !important;
          border-radius: 6px !important;
          font-weight: 700 !important;
          font-size: 11px !important;
          display: inline-flex !important;
          align-items: center !important;
        }
        .badge-pending {
          background: #EFF6FF !important;
          color: #2563EB !important;
        }
        .badge-progress {
          background: #F5F3FF !important;
          color: #7C3AED !important;
        }
        .badge-dispensed {
          background: #ECFDF5 !important;
          color: #10B981 !important;
        }
        .badge-low {
          background: #FFF7ED !important;
          color: #EA580C !important;
        }
        .badge-out {
          background: #FEF2F2 !important;
          color: #EF4444 !important;
        }

        /* SUB TABS */
        .subtab-pill {
          padding: 6px 14px !important;
          border-radius: 8px !important;
          font-size: 12px !important;
          font-weight: 700 !important;
          color: #64748B !important;
          cursor: pointer !important;
          transition: all 0.2s !important;
          background: transparent !important;
          border: 1px solid transparent !important;
        }
        .subtab-pill:hover {
          background: #F8FAFC !important;
          color: #0F172A !important;
        }
        .subtab-pill.active {
          background: #EFF6FF !important;
          color: #2563EB !important;
          border-color: #DBEAFE !important;
        }

        /* CALENDAR */
        .calendar-cell {
          width: 30px !important;
          height: 30px !important;
          margin: 0 auto !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 11.5px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          border-radius: 50% !important;
          transition: all 0.15s !important;
          position: relative !important;
        }
        .calendar-cell.inactive {
          color: #CBD5E1 !important;
        }
        .calendar-cell.active {
          background: #2563EB !important;
          color: #FFFFFF !important;
          font-weight: 800 !important;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35) !important;
        }
        .calendar-cell:hover:not(.active) {
          background: #F1F5F9 !important;
        }

        /* FLOATING SUPPORT ACTION */
        .floating-support-btn {
          position: fixed !important;
          bottom: 24px !important;
          right: 24px !important;
          width: 48px !important;
          height: 48px !important;
          border-radius: 50% !important;
          background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%) !important;
          color: white !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4) !important;
          cursor: pointer !important;
          z-index: 999 !important;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
          border: none !important;
        }
        .floating-support-btn:hover {
          transform: scale(1.08) translateY(-2px) !important;
          box-shadow: 0 10px 24px rgba(99, 102, 241, 0.5) !important;
        }

        @keyframes slideUp {
          from {
            transform: translateY(10px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .mobile-menu-toggle {
          display: none !important;
        }

        @media (max-width: 1280px) {
          .kpi-grid {
            grid-template-columns: repeat(3, 1fr) !important;
          }
          .bottom-analytics-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 1024px) {
          .kpi-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .bottom-analytics-grid {
            grid-template-columns: 1fr !important;
          }
          .admin-sidebar {
            left: -260px !important;
            transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            display: flex !important;
            z-index: 2000 !important;
          }
          .admin-sidebar.mobile-open {
            left: 0 !important;
            z-index: 2010 !important;
          }
          .top-nav, .main-content {
            margin-left: 0 !important;
          }
          .top-nav {
            padding: 0 16px !important;
            left: 0 !important;
          }
          .main-content {
            padding: 16px !important;
          }
          .mobile-menu-toggle {
            display: flex !important;
            z-index: 100 !important;
          }
          .mobile-backdrop {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            background-color: rgba(15, 23, 42, 0.4) !important;
            backdrop-filter: blur(4px) !important;
            z-index: 1999 !important;
          }
        }
        @media (max-width: 640px) {
          .kpi-grid {
            grid-template-columns: 1fr !important;
          }
          .top-nav-greeting {
            display: none !important;
          }
        }

        /* Calendar split row */
        @media (min-width: 1025px) {
          .calendar-row {
            display: flex !important;
            width: 100% !important;
            gap: 20px !important;
            margin-bottom: 24px !important;
          }
          .calendar-left-panel {
            width: 64% !important;
            flex-shrink: 0 !important;
          }
          .calendar-right-panel {
            width: 36% !important;
            flex-shrink: 0 !important;
          }
        }
        @media (max-width: 1024px) {
          .calendar-row {
            display: flex !important;
            flex-direction: column !important;
            gap: 20px !important;
            margin-bottom: 24px !important;
          }
          .calendar-left-panel, .calendar-right-panel {
            width: 100% !important;
          }
        }

        .bottom-analytics-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 20px;
        }
      `}</style>

      {/* Sidebar Layout */}
      {activeTab !== 'hr-payroll' && (
        <div 
          className={`admin-sidebar ${isSidebarCollapsed ? "collapsed " : ""}${mobileSidebarOpen ? "mobile-open" : ""}`}
          style={{
            position: 'fixed',
            top: 0,
            bottom: 0,
            left: 0,
            height: '100%',
            minHeight: 'calc(100vh / 0.9)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1000,
            overflow: 'hidden'
          }}
          data-lenis-prevent
        >
          {/* Logo & Brand Header */}
          <div className="sidebar-brand-wrapper">
            {/* Top decorative subtle mesh wave in brand header */}
            <svg 
              viewBox="0 0 280 130" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: '100%', 
                height: '130px', 
                pointerEvents: 'none', 
                zIndex: 0,
                opacity: isSidebarCollapsed ? 0 : 0.95,
                transition: 'opacity 0.2s'
              }}
            >
              <path d="M0,0 L280,0 L280,65 C215,100 155,70 85,105 C40,120 15,110 0,100 Z" fill="url(#curoxaWaveGradPh1)" />
              <path d="M0,0 L280,0 L280,40 C195,80 135,50 55,90 C20,102 0,92 0,92 Z" fill="url(#curoxaWaveGradPh2)" opacity="0.65" />
              <defs>
                <linearGradient id="curoxaWaveGradPh1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#DBEAFE" stopOpacity="0.85" />
                  <stop offset="50%" stopColor="#E0E7FF" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#F3E8FF" stopOpacity="0.2" />
                </linearGradient>
                <linearGradient id="curoxaWaveGradPh2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#BAE6FD" stopOpacity="0.75" />
                  <stop offset="100%" stopColor="#DDD6FE" stopOpacity="0.15" />
                </linearGradient>
              </defs>
            </svg>

            <div className="sidebar-brand">
              <img 
                src={curoxaSidebarLogo} 
                alt="CUROXA" 
                style={{
                  width: '44px',
                  height: '44px',
                  objectFit: 'contain',
                  flexShrink: 0,
                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))'
                }}
              />
              <div className="sidebar-brand-text-group" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span className="sidebar-brand-text" style={{ fontFamily: "'Plus Jakarta Sans', 'Outfit', sans-serif", fontWeight: 900, fontSize: '18px', color: '#0F172A', letterSpacing: '0.03em', lineHeight: 1.1 }}>
                  CUROXA
                </span>
                <span className="sidebar-brand-subtitle" style={{ fontSize: '11px', color: '#64748B', fontWeight: 500, letterSpacing: '-0.01em', marginTop: '3px', lineHeight: 1 }}>
                  Health Management
                </span>
              </div>
              <button 
                className="sidebar-collapse-toggle desktop-only-flex"
                onClick={(e) => {
                  e.stopPropagation();
                  const newState = !isSidebarCollapsed;
                  setIsSidebarCollapsed(newState);
                  localStorage.setItem('curoxa_sidebar_collapsed', String(newState));
                }}
                style={{
                  position: 'absolute',
                  right: '-12px',
                  top: '26px',
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 100,
                  transition: 'transform 0.3s ease',
                  transform: isSidebarCollapsed ? 'rotate(180deg)' : 'none'
                }}
                title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
            </div>
          </div>

          {/* Scrollable Nav Container */}
          <div 
            className="sidebar-nav-container"
            style={{
              flex: '1 1 auto',
              overflowY: 'auto',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* SECTION 1: OVERVIEW GROUP */}
            <div className="sidebar-group">
              <div className="sidebar-group-title" style={{ color: '#2563EB' }}>
                <span style={{ fontSize: '13px', lineHeight: 1 }}>•</span> OVERVIEW
              </div>

              <div 
                className={`sidebar-link ${activeTab === 'dash' ? 'active' : ''}`}
                onClick={(e) => { e.preventDefault(); setActiveTab('dash'); setMobileSidebarOpen(false); }}
              >
                {activeTab === 'dash' && (
                  <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#2563EB' }} />
                )}
                <div className="sidebar-link-icon" style={{
                  background: activeTab === 'dash' ? 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)' : '#EFF6FF',
                  color: activeTab === 'dash' ? '#FFFFFF' : '#2563EB',
                  boxShadow: activeTab === 'dash' ? '0 3px 10px rgba(37, 99, 235, 0.25)' : 'none'
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/></svg>
                </div>
                <span className="sidebar-link-text">Overview</span>
              </div>

              {(currentUser?.role === 'pharmacy' || (coverageState['ph-queue']?.on || coverageState['ph-dispense']?.on)) && (
                <div 
                  className={`sidebar-link ${activeTab === 'prescriptions' ? 'active' : ''}`}
                  onClick={(e) => { e.preventDefault(); setActiveTab('prescriptions'); setMobileSidebarOpen(false); }}
                >
                  {activeTab === 'prescriptions' && (
                    <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#2563EB' }} />
                  )}
                  <div className="sidebar-link-icon" style={{
                    background: activeTab === 'prescriptions' ? 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)' : '#EFF6FF',
                    color: activeTab === 'prescriptions' ? '#FFFFFF' : '#2563EB',
                    boxShadow: activeTab === 'prescriptions' ? '0 3px 10px rgba(37, 99, 235, 0.25)' : 'none'
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  </div>
                  <span className="sidebar-link-text">Prescriptions</span>
                </div>
              )}

              {(currentUser?.role === 'pharmacy' || (coverageState['ph-queue']?.on || coverageState['ph-dispense']?.on)) && (
                <div 
                  className={`sidebar-link ${activeTab === 'internal' ? 'active' : ''}`}
                  onClick={(e) => { e.preventDefault(); setActiveTab('internal'); setMobileSidebarOpen(false); }}
                >
                  {activeTab === 'internal' && (
                    <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#2563EB' }} />
                  )}
                  <div className="sidebar-link-icon" style={{
                    background: activeTab === 'internal' ? 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)' : '#EFF6FF',
                    color: activeTab === 'internal' ? '#FFFFFF' : '#2563EB',
                    boxShadow: activeTab === 'internal' ? '0 3px 10px rgba(37, 99, 235, 0.25)' : 'none'
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>
                  </div>
                  <span className="sidebar-link-text">Internal requests</span>
                </div>
              )}

              {(currentUser?.role === 'pharmacy' || coverageState['ph-billing']?.on) && (
                <div 
                  className={`sidebar-link ${activeTab === 'sales' ? 'active' : ''}`}
                  onClick={(e) => { e.preventDefault(); setActiveTab('sales'); setMobileSidebarOpen(false); }}
                >
                  {activeTab === 'sales' && (
                    <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#2563EB' }} />
                  )}
                  <div className="sidebar-link-icon" style={{
                    background: activeTab === 'sales' ? 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)' : '#EFF6FF',
                    color: activeTab === 'sales' ? '#FFFFFF' : '#2563EB',
                    boxShadow: activeTab === 'sales' ? '0 3px 10px rgba(37, 99, 235, 0.25)' : 'none'
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                  </div>
                  <span className="sidebar-link-text">Sales</span>
                </div>
              )}
            </div>

            {/* SECTION 2: MANAGEMENT ZONE (Tinted Teal Card) */}
            <div className={`sidebar-zone sidebar-zone-clinic ${!sectionOpen.management ? 'collapsed' : ''}`}>
              <div 
                className={`sidebar-group-title ${!sectionOpen.management ? 'collapsed' : ''}`}
                style={{ color: '#0D9488' }}
                onClick={() => toggleSection('management')}
                title="Toggle Management Section"
              >
                <span style={{ fontSize: '13px', lineHeight: 1 }}>•</span> MANAGEMENT
                <span className="sidebar-group-chevron" style={{ transform: sectionOpen.management ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </span>
              </div>
              {sectionOpen.management && (
                <>
                  {(currentUser?.role === 'pharmacy' || (coverageState['ph-stock']?.on || coverageState['dr-stockview']?.on)) && (
                    <div 
                      className={`sidebar-link ${activeTab === 'inventory' ? 'active' : ''}`}
                      onClick={(e) => { e.preventDefault(); setActiveTab('inventory'); setMobileSidebarOpen(false); }}
                    >
                      {activeTab === 'inventory' && (
                        <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#0D9488' }} />
                      )}
                      <div className="sidebar-link-icon" style={{
                        background: activeTab === 'inventory' ? 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)' : '#CCFBF1',
                        color: activeTab === 'inventory' ? '#FFFFFF' : '#0D9488',
                        boxShadow: activeTab === 'inventory' ? '0 3px 10px rgba(13, 148, 136, 0.25)' : 'none'
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                      </div>
                      <span className="sidebar-link-text">Inventory</span>
                    </div>
                  )}

                  {(currentUser?.role === 'pharmacy' || coverageState['ph-stock']?.on) && (
                    <div 
                      className={`sidebar-link ${activeTab === 'expiry' ? 'active' : ''}`}
                      onClick={(e) => { e.preventDefault(); setActiveTab('expiry'); setMobileSidebarOpen(false); }}
                    >
                      {activeTab === 'expiry' && (
                        <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#0D9488' }} />
                      )}
                      <div className="sidebar-link-icon" style={{
                        background: activeTab === 'expiry' ? 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)' : '#CCFBF1',
                        color: activeTab === 'expiry' ? '#FFFFFF' : '#0D9488',
                        boxShadow: activeTab === 'expiry' ? '0 3px 10px rgba(13, 148, 136, 0.25)' : 'none'
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      </div>
                      <span className="sidebar-link-text">Expiry Management</span>
                    </div>
                  )}

                  {(currentUser?.role === 'pharmacy' || coverageState['ph-stock']?.on) && (
                    <div 
                      className={`sidebar-link ${activeTab === 'returns' ? 'active' : ''}`}
                      onClick={(e) => { e.preventDefault(); setActiveTab('returns'); setMobileSidebarOpen(false); }}
                    >
                      {activeTab === 'returns' && (
                        <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#0D9488' }} />
                      )}
                      <div className="sidebar-link-icon" style={{
                        background: activeTab === 'returns' ? 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)' : '#CCFBF1',
                        color: activeTab === 'returns' ? '#FFFFFF' : '#0D9488',
                        boxShadow: activeTab === 'returns' ? '0 3px 10px rgba(13, 148, 136, 0.25)' : 'none'
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                      </div>
                      <span className="sidebar-link-text">Returns</span>
                    </div>
                  )}

                  {(currentUser?.role === 'pharmacy' || (coverageState['ph-stock']?.on || coverageState['ph-billing']?.on)) && (
                    <div 
                      className={`sidebar-link ${activeTab === 'reports' ? 'active' : ''}`}
                      onClick={(e) => { e.preventDefault(); setActiveTab('reports'); setMobileSidebarOpen(false); }}
                    >
                      {activeTab === 'reports' && (
                        <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#0D9488' }} />
                      )}
                      <div className="sidebar-link-icon" style={{
                        background: activeTab === 'reports' ? 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)' : '#CCFBF1',
                        color: activeTab === 'reports' ? '#FFFFFF' : '#0D9488',
                        boxShadow: activeTab === 'reports' ? '0 3px 10px rgba(13, 148, 136, 0.25)' : 'none'
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                      </div>
                      <span className="sidebar-link-text">Reports</span>
                    </div>
                  )}

                  {(currentUser?.role === 'pharmacy' || currentUser?.role === 'admin' || coverageState['ph-stock']?.on) && (
                    <div 
                      className="sidebar-link"
                      onClick={(e) => { e.preventDefault(); window.open('/procurement', '_blank'); setMobileSidebarOpen(false); }}
                    >
                      <div className="sidebar-link-icon" style={{ background: '#CCFBF1', color: '#0D9488' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                      </div>
                      <span className="sidebar-link-text">Procurement</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* SECTION 3: TOOLS ZONE (Tinted Peach/Orange Card) */}
            <div className={`sidebar-zone sidebar-zone-finance ${!sectionOpen.tools ? 'collapsed' : ''}`}>
              <div 
                className={`sidebar-group-title ${!sectionOpen.tools ? 'collapsed' : ''}`}
                style={{ color: '#EA580C' }}
                onClick={() => toggleSection('tools')}
                title="Toggle Tools Section"
              >
                <span style={{ fontSize: '13px', lineHeight: 1 }}>•</span> TOOLS
                <span className="sidebar-group-chevron" style={{ transform: sectionOpen.tools ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </span>
              </div>
              {sectionOpen.tools && (
                <>
                  <div 
                    className="sidebar-link"
                    onClick={(e) => { e.preventDefault(); setActiveTab('inventory'); setMobileSidebarOpen(false); }}
                  >
                    <div className="sidebar-link-icon" style={{ background: '#FFF7ED', color: '#EA580C' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="10" y1="14" x2="14" y2="18"/><line x1="14" y1="14" x2="10" y2="18"/></svg>
                    </div>
                    <span className="sidebar-link-text">Expiry Management</span>
                  </div>

                  <div 
                    className="sidebar-link"
                    onClick={(e) => { e.preventDefault(); window.open('/procurement', '_blank'); setMobileSidebarOpen(false); }}
                  >
                    <div className="sidebar-link-icon" style={{ background: '#FFF7ED', color: '#EA580C' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </div>
                    <span className="sidebar-link-text">Suppliers</span>
                  </div>

                  <div 
                    className="sidebar-link"
                    onClick={(e) => { e.preventDefault(); setActiveTab('inventory'); setMobileSidebarOpen(false); }}
                  >
                    <div className="sidebar-link-icon" style={{ background: '#FFF7ED', color: '#EA580C' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                    </div>
                    <span className="sidebar-link-text">Categories</span>
                  </div>
                </>
              )}
            </div>

            {/* SECTION 4: DYNAMIC COVERAGE INTEGRATION LINKS */}
            {((Object.keys(coverageState || {}).some(k => k.startsWith('rc-') && coverageState[k]?.on)) && tenantModules.reception?.enabled !== false ||
              (Object.keys(coverageState || {}).some(k => k.startsWith('lt-') && coverageState[k]?.on)) && tenantModules.laboratory?.enabled !== false) && (
              <div className="sidebar-group" style={{ marginTop: '10px' }}>
                <div className="sidebar-group-title" style={{ color: '#EF4444' }}>
                  <span style={{ fontSize: '13px', lineHeight: 1 }}>•</span> ACTIVE COVERAGES
                </div>

                {(Object.keys(coverageState || {}).some(k => k.startsWith('rc-') && coverageState[k]?.on)) && tenantModules.reception?.enabled !== false && (
                  <div 
                    className="sidebar-link"
                    onClick={(e) => { e.preventDefault(); window.open('/receptionist', '_blank'); setMobileSidebarOpen(false); }}
                  >
                    <div className="sidebar-link-icon" style={{ background: '#FFE4E6', color: '#E11D48' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                    </div>
                    <span className="sidebar-link-text" style={{ color: '#E11D48', fontWeight: 800 }}>Receptionist Cover</span>
                  </div>
                )}

                {(Object.keys(coverageState || {}).some(k => k.startsWith('lt-') && coverageState[k]?.on)) && tenantModules.laboratory?.enabled !== false && (
                  <div 
                    className="sidebar-link"
                    onClick={(e) => { e.preventDefault(); window.open('/lab', '_blank'); setMobileSidebarOpen(false); }}
                  >
                    <div className="sidebar-link-icon" style={{ background: '#D1FAE5', color: '#059669' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18H18"/><path d="M10 14H14"/><path d="M12 2v20"/><path d="M18 10H6"/></svg>
                    </div>
                    <span className="sidebar-link-text" style={{ color: '#059669', fontWeight: 800 }}>Lab Cover</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Profile Section sitting at bottom with soft blur fade above */}
          <div 
            className="sidebar-profile-footer"
            style={{
              marginTop: 'auto',
              flexShrink: 0,
              position: 'relative'
            }}
          >
            <div className="sidebar-profile-fade-top" />
            <div className="sidebar-profile" onClick={(e) => { e.stopPropagation(); setShowProfileMenu(!showProfileMenu); }}>
              <div className="profile-avatar-wrap">
                {currentUser.avatar ? (
                  <img 
                    className="profile-avatar" 
                    src={currentUser.avatar} 
                    alt="Pharmacist Avatar" 
                  />
                ) : (
                  <div className="profile-avatar-initials">
                    {currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'P'}
                  </div>
                )}
                <span className="profile-avatar-status-dot" />
              </div>
              <div className="profile-info">
                <span className="profile-name">{currentUser.name || 'Pharmacy-1'}</span>
                <span className="profile-role">Pharmacist</span>
              </div>
              <div className="profile-chevron" style={{ transform: showProfileMenu ? 'rotate(180deg)' : 'none' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>

            {showProfileMenu && (
              <div 
                className="glass-card sidebar-profile-popover-card" 
                onClick={e => e.stopPropagation()}
              >
                <div style={{ padding: '10px 12px', borderBottom: '1px solid #F1F5F9', marginBottom: '6px' }}>
                  <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0F172A' }}>{currentUser.name || 'Pharmacy-1'}</div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Pharmacy In-Charge</div>
                </div>
                <div 
                  style={{ 
                    padding: '10px 12px', 
                    borderRadius: '10px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    fontSize: '13px', 
                    fontWeight: 700, 
                    color: '#334155', 
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    marginBottom: '4px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F1F5F9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={() => {
                    setShowProfileEditModal(true);
                    setShowProfileMenu(false);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Edit Profile
                </div>
                <div 
                  style={{ 
                    padding: '10px 12px', 
                    borderRadius: '10px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    fontSize: '13px', 
                    fontWeight: 700, 
                    color: '#334155', 
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    marginBottom: '4px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F1F5F9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={() => {
                    setActiveTab('hr-payroll');
                    setShowProfileMenu(false);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> HR & Payroll
                </div>
                <div 
                  style={{ 
                    padding: '10px 12px', 
                    borderRadius: '10px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    fontSize: '13px', 
                    fontWeight: 700, 
                    color: '#DC2626', 
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#FEF2F2'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={handleLogout}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Logout
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sidebar Backdrop Overlay */}
      {mobileSidebarOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* Top Navbar */}
      {activeTab !== 'hr-payroll' && (
        <div className={"top-nav " + (isSidebarCollapsed ? "collapsed" : "")}>
          {/* Top Nav Left: Page Title & Greeting */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="mobile-menu-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setMobileSidebarOpen(!mobileSidebarOpen);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#475569',
                padding: '8px',
                borderRadius: '8px',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>
            <div className="top-nav-left">
              <div className="top-nav-page-title">
                {activeTab === 'dash' ? 'Pharmacy Overview' : activeTab === 'prescriptions' ? 'Prescriptions' : activeTab === 'sales' ? 'Pharmacy Sales' : activeTab === 'inventory' ? 'Inventory Management' : 'Pharmacy Workspace'}
              </div>
              <div className="top-nav-greeting">
                Good morning, {currentUser.name || 'Pharmacy-1'} 👋
              </div>
            </div>
          </div>

          {/* Top Nav Right: Search + Notifications + Profile Pill */}
          <div className="top-nav-right">
            {/* Search patient input with Ctrl+K shortcut badge */}
            <div style={{ position: 'relative', width: '280px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input 
                type="text" 
                style={{ 
                  paddingLeft: '36px', 
                  paddingRight: '64px',
                  width: '100%', 
                  height: '38px', 
                  borderRadius: '10px', 
                  border: '1px solid #E2E8F0', 
                  background: '#F8FAFC', 
                  fontSize: '12.5px', 
                  color: '#1E293B', 
                  outline: 'none',
                  fontWeight: 500,
                  transition: 'all 0.2s'
                }} 
                placeholder="Search patient by mobile/ID" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '10.5px', fontWeight: 700, color: '#94A3B8', background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '2px 6px', borderRadius: '5px', pointerEvents: 'none' }}>
                Ctrl + K
              </span>
            </div>

            {/* Notification Bell */}
            <div 
              ref={notificationRef}
              style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', borderRadius: '10px', border: '1px solid #E2E8F0', color: '#64748B', background: 'white', transition: 'all 0.2s' }}
              onClick={() => {
                setShowNotifications(!showNotifications);
                setUnreadCount(0);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '-3px', right: '-3px', background: '#EF4444', color: 'white', borderRadius: '50%', width: '17px', height: '17px', fontSize: '10px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white' }}>
                  {unreadCount}
                </span>
              )}

              {showNotifications && (
                <div data-lenis-prevent 
                  style={{
                    position: 'absolute',
                    top: '46px',
                    right: '0',
                    width: '320px',
                    background: 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.08)',
                    zIndex: 1000,
                    padding: '16px',
                    maxHeight: '400px',
                    overflowY: 'auto'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px', marginBottom: '12px' }}>
                    <span style={{ fontWeight: 800, fontSize: '14px', color: '#0F172A' }}>Notifications</span>
                    <button 
                      style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                      onClick={() => {
                        const userKey = currentUser.staff_id || currentUser.id || currentUser.name || 'default';
                        const clearedKey = `curoxa_cleared_notifications_${userKey}`;
                        const clearedIds = JSON.parse(localStorage.getItem(clearedKey) || '[]');
                        const newClearedIds = [...clearedIds, ...notifications.map(n => n.id)];
                        localStorage.setItem(clearedKey, JSON.stringify(newClearedIds));
                        setNotifications([]);
                        setUnreadCount(0);
                      }}
                    >
                      Clear all
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {notifications.map(n => (
                      <div key={n.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 10px', borderRadius: '8px', background: n.isNew ? '#EFF6FF' : '#F8FAFC', borderLeft: n.isNew ? '3px solid #2563EB' : '3px solid #E2E8F0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 800, fontSize: '12.5px', color: '#1E293B' }}>{n.title}</span>
                          <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600 }}>{n.time}</span>
                        </div>
                        <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: 550, lineHeight: 1.4 }}>{n.message}</span>
                      </div>
                    ))}
                    {notifications.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '20px 0', color: '#94A3B8', fontSize: '12px', fontWeight: 600 }}>
                        No notifications
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Identity Pill on Header */}
            <div 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px 4px 4px', borderRadius: '10px', border: '1px solid #F1F5F9', background: '#FFFFFF', cursor: 'pointer' }}
              onClick={() => setShowProfileMenu(!showProfileMenu)}
            >
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt="Avatar" style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px' }}>
                  {currentUser.name ? currentUser.name[0].toUpperCase() : 'P'}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                <span style={{ fontSize: '12px', fontWeight: 750, color: '#0F172A', lineHeight: 1.1 }}>{currentUser.name || 'Pharmacy-1'}</span>
                <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600 }}>Pharmacist</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '4px' }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className={"main-content " + (activeTab === 'hr-payroll' ? "fullscreen-portal" : (isSidebarCollapsed ? "collapsed" : ""))} data-lenis-prevent>
        
        {successMessage && (
          <div style={{ color: '#15803D', background: '#F0FDF4', border: '1px solid #DCFCE7', padding: '12px 20px', borderRadius: '12px', marginBottom: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', animation: 'slideUp 0.3s ease-out' }}>
            <i data-lucide="check-circle" style={{ width: '16px' }}></i>{successMessage}
          </div>
        )}
        {errorMessage && (
          <div style={{ color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FEE2E2', padding: '12px 20px', borderRadius: '12px', marginBottom: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', animation: 'slideUp 0.3s ease-out' }}>
            <i data-lucide="alert-triangle" style={{ width: '16px' }}></i>{errorMessage}
          </div>
        )}

        {activeTab === 'hr-payroll' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: 0 }}>
            <HRPayroll onExit={() => setActiveTab('dash')} />
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'dash' && (
          <div style={{ animation: 'slideUp 0.3s ease-out' }}>
            
            {/* 5 KPI Cards Grid with distinct surfaces and micro-charts matching Admin Portal */}
            <div className="kpi-grid">
              
              {/* Card 1: Today's Prescriptions (Electric Blue Theme) */}
              <div 
                style={{
                  padding: '18px 20px',
                  borderRadius: '16px',
                  border: '1px solid rgba(191, 219, 254, 0.9)',
                  boxShadow: '0 12px 28px rgba(37, 99, 235, 0.08)',
                  background: 'radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 50%, #DBEAFE 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                onClick={() => setActiveTab('prescriptions')}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 16px 36px rgba(37, 99, 235, 0.16)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 12px 28px rgba(37, 99, 235, 0.08)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)'
                  }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  </div>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    TODAY'S PRESCRIPTIONS
                  </span>
                </div>

                <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                      {todayPrescriptionsList.length}
                    </div>
                    <div style={{ fontSize: '12px', color: '#2563EB', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2563EB', display: 'inline-block' }}></span> Active today
                    </div>
                  </div>

                  {/* Blue Mini Sparkline */}
                  <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                    <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                      <defs>
                        <linearGradient id="pharmKpiBlue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563EB" stopOpacity="0.45"/>
                          <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05"/>
                        </linearGradient>
                      </defs>
                      <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#pharmKpiBlue)" />
                      <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12" fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>

                {/* Half Gradient Accent Line Beneath Card */}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  height: '4px',
                  width: '60%',
                  borderBottomRightRadius: '16px',
                  background: 'linear-gradient(90deg, transparent 0%, #2563EB 100%)',
                  pointerEvents: 'none'
                }} />
              </div>

              {/* Card 2: Pending to Dispense (Warm Amber / Orange Theme) */}
              <div 
                style={{
                  padding: '18px 20px',
                  borderRadius: '16px',
                  border: '1px solid rgba(254, 215, 170, 0.9)',
                  boxShadow: '0 12px 28px rgba(245, 158, 11, 0.08)',
                  background: 'radial-gradient(circle at 0% 100%, rgba(245, 158, 11, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 50%, #FEF3C7 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                onClick={() => setActiveTab('prescriptions')}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 16px 36px rgba(245, 158, 11, 0.16)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 12px 28px rgba(245, 158, 11, 0.08)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 4px 10px rgba(245, 158, 11, 0.25)'
                  }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>
                  </div>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#78350F', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    PENDING TO DISPENSE
                  </span>
                </div>

                <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                      {pendingDispenseCount}
                    </div>
                    <div style={{ fontSize: '12px', color: '#D97706', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#D97706', display: 'inline-block' }}></span> Awaiting payment
                    </div>
                  </div>

                  {/* Amber Mini Sparkline */}
                  <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                    <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                      <defs>
                        <linearGradient id="pharmKpiAmber" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.45"/>
                          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.05"/>
                        </linearGradient>
                      </defs>
                      <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22 L 64 32 L 0 32 Z" fill="url(#pharmKpiAmber)" />
                      <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22" fill="none" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>

                {/* Half Gradient Accent Line Beneath Card */}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  height: '4px',
                  width: '60%',
                  borderBottomRightRadius: '16px',
                  background: 'linear-gradient(90deg, transparent 0%, #F59E0B 100%)',
                  pointerEvents: 'none'
                }} />
              </div>

              {/* Card 3: Prescriptions Dispensed (Emerald Green Theme) */}
              <div 
                style={{
                  padding: '18px 20px',
                  borderRadius: '16px',
                  border: '1px solid rgba(167, 243, 208, 0.9)',
                  boxShadow: '0 12px 28px rgba(16, 185, 129, 0.08)',
                  background: 'radial-gradient(circle at 100% 0%, rgba(16, 185, 129, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 50%, #D1FAE5 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                onClick={() => setActiveTab('prescriptions')}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 16px 36px rgba(16, 185, 129, 0.16)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 12px 28px rgba(16, 185, 129, 0.08)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 4px 10px rgba(16, 185, 129, 0.25)'
                  }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                  </div>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#064E3B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    PRESCRIPTIONS DISPENSED
                  </span>
                </div>

                <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                      {dispensedPrescriptionsCount}
                    </div>
                    <div style={{ fontSize: '12px', color: '#059669', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#059669', display: 'inline-block' }}></span> Completed
                    </div>
                  </div>

                  {/* Green Mini Sparkline */}
                  <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                    <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                      <defs>
                        <linearGradient id="pharmKpiGreen" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10B981" stopOpacity="0.45"/>
                          <stop offset="100%" stopColor="#10B981" stopOpacity="0.05"/>
                        </linearGradient>
                      </defs>
                      <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10 L 64 32 L 0 32 Z" fill="url(#pharmKpiGreen)" />
                      <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10" fill="none" stroke="#10B981" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>

                {/* Half Gradient Accent Line Beneath Card */}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  height: '4px',
                  width: '60%',
                  borderBottomRightRadius: '16px',
                  background: 'linear-gradient(90deg, transparent 0%, #10B981 100%)',
                  pointerEvents: 'none'
                }} />
              </div>

              {/* Card 4: Today's Sales (Purple / Violet Theme) */}
              <div 
                style={{
                  padding: '18px 20px',
                  borderRadius: '16px',
                  border: '1px solid rgba(221, 214, 254, 0.9)',
                  boxShadow: '0 12px 28px rgba(139, 92, 246, 0.08)',
                  background: 'radial-gradient(circle at 0% 0%, rgba(139, 92, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 50%, #EDE9FE 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                onClick={() => setActiveTab('sales')}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 16px 36px rgba(139, 92, 246, 0.16)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 12px 28px rgba(139, 92, 246, 0.08)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 4px 10px rgba(139, 92, 246, 0.25)'
                  }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                  </div>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#4C1D95', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    TODAY'S SALES
                  </span>
                </div>

                <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                      ₹{(todaySalesTotalRev || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                    <div style={{ fontSize: '12px', color: '#7C3AED', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7C3AED', display: 'inline-block' }}></span> {todayOverviewSales.length} transaction{todayOverviewSales.length === 1 ? '' : 's'} today
                    </div>
                  </div>

                  {/* Purple Mini Sparkline */}
                  <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                    <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                      <defs>
                        <linearGradient id="pharmKpiPurple" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.45"/>
                          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.05"/>
                        </linearGradient>
                      </defs>
                      <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#pharmKpiPurple)" />
                      <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12" fill="none" stroke="#8B5CF6" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>

                {/* Half Gradient Accent Line Beneath Card */}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  height: '4px',
                  width: '60%',
                  borderBottomRightRadius: '16px',
                  background: 'linear-gradient(90deg, transparent 0%, #8B5CF6 100%)',
                  pointerEvents: 'none'
                }} />
              </div>

              {/* Card 5: Low Stock Items (Rose / Red Theme) */}
              <div 
                style={{
                  padding: '18px 20px',
                  borderRadius: '16px',
                  border: '1px solid rgba(254, 205, 211, 0.9)',
                  boxShadow: '0 12px 28px rgba(244, 63, 94, 0.08)',
                  background: 'radial-gradient(circle at 100% 100%, rgba(244, 63, 94, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFF1F2 50%, #FFE4E6 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                onClick={() => setActiveTab('inventory')}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 16px 36px rgba(244, 63, 94, 0.16)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 12px 28px rgba(244, 63, 94, 0.08)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #E11D48 0%, #F43F5E 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 4px 10px rgba(244, 63, 94, 0.25)'
                  }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  </div>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#881337', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    LOW STOCK ITEMS
                  </span>
                </div>

                <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                      {lowStockTotalCount}
                    </div>
                    <div style={{ fontSize: '12px', color: '#E11D48', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#E11D48', display: 'inline-block' }}></span> View all alerts →
                    </div>
                  </div>

                  {/* Rose Mini Sparkline */}
                  <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                    <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                      <defs>
                        <linearGradient id="pharmKpiRose" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.45"/>
                          <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.05"/>
                        </linearGradient>
                      </defs>
                      <path d="M 0 26 Q 14 26, 22 20 T 36 22 T 48 10 T 64 16 L 64 32 L 0 32 Z" fill="url(#pharmKpiRose)" />
                      <path d="M 0 26 Q 14 26, 22 20 T 36 22 T 48 10 T 64 16" fill="none" stroke="#F43F5E" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>

                {/* Half Gradient Accent Line Beneath Card */}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  height: '4px',
                  width: '60%',
                  borderBottomRightRadius: '16px',
                  background: 'linear-gradient(90deg, transparent 0%, #F43F5E 100%)',
                  pointerEvents: 'none'
                }} />
              </div>

            </div>

            {/* Middle Split Section: Prescriptions Queue (Left) & Today's Overview Calendar (Right) */}
            <div className="calendar-row">
              
              {/* Prescriptions Queue Panel */}
              <div className="glass-card calendar-left-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EEF2FF', color: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                      </div>
                      <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Prescriptions Queue</h3>
                    </div>

                    {/* Subtab Pills */}
                    <div style={{ display: 'flex', gap: '6px', background: '#F8FAFC', padding: '3px', borderRadius: '10px', border: '1px solid #F1F5F9' }}>
                      {['All', 'Urgent', 'New', 'In Progress'].map(tab => {
                        const count = tab === 'All'
                          ? prescriptions.length
                          : tab === 'Urgent'
                            ? prescriptions.filter(p => (p.status === 'Pending' || p.status === 'Pending Pharmacy Dispatch') && (p.isUrgent || p.priority === 'Urgent' || (p.items && p.items.length > 3))).length
                            : tab === 'New'
                              ? prescriptions.filter(p => p.status === 'Pending' || p.status === 'Pending Pharmacy Dispatch').length
                              : prescriptions.filter(p => p.status === 'In Progress').length;
                        return (
                          <span 
                            key={tab} 
                            className={`subtab-pill ${activeSubTab === tab ? 'active' : ''}`}
                            onClick={() => setActiveSubTab(tab)}
                          >
                            {tab} ({count})
                          </span>
                        );
                      })}
                    </div>

                    <a href="#" style={{ fontSize: '13px', fontWeight: 700, color: '#2563EB', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); setActiveTab('prescriptions'); }}>
                      View All →
                    </a>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th>PATIENT DETAILS</th>
                          <th>DOCTOR</th>
                          <th>TIME</th>
                          <th>ITEMS</th>
                          <th>AMOUNT</th>
                          <th>STATUS</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedOverviewQueue.length > 0 ? (
                          paginatedOverviewQueue.map((p, idx) => (
                            <tr key={idx}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px' }}>
                                    {p.name ? p.name[0].toUpperCase() : 'P'}
                                  </div>
                                  <div>
                                    <div 
                                      style={{ fontWeight: 750, fontSize: '13.5px', color: '#2563EB', cursor: 'pointer' }}
                                      onClick={() => {
                                        setSelectedPrescriptionGroup(p);
                                        setPrescriptionModalStep('details');
                                        setShowPrescriptionModal(true);
                                      }}
                                    >
                                      {p.name}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '1px' }}>{p.age} Y, {p.gender}</div>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 700, fontSize: '13px', color: '#334155' }}>{p.docName}</div>
                                <div style={{ fontSize: '11px', color: '#94A3B8' }}>{p.specialty}</div>
                              </td>
                              <td style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>
                                <div>{p.time}</div>
                                <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Today</div>
                              </td>
                              <td style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                                <span 
                                  style={{ color: '#2563EB', cursor: 'pointer', textDecoration: 'underline' }}
                                  onClick={() => {
                                    setSelectedPrescriptionGroup(p);
                                    setPrescriptionModalStep('details');
                                    setShowPrescriptionModal(true);
                                  }}
                                >
                                  {p.items} Items
                                </span>
                              </td>
                              <td style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>{p.amount}</td>
                              <td>
                                <span className={`pill-badge ${p.status === 'Pending' ? 'badge-pending' : (p.status === 'In Progress' ? 'badge-progress' : 'badge-dispensed')}`}>
                                  {p.status}
                                </span>
                              </td>
                              <td>
                                {p.status === 'Pending' && p.rawObj && (
                                  <button 
                                    className="btn btn-primary" 
                                    style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '8px', background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 700, boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)' }}
                                    onClick={() => {
                                      setSelectedPrescriptionGroup(p);
                                      setPrescriptionModalStep('payment');
                                      setShowPrescriptionModal(true);
                                    }}
                                  >
                                    Dispense
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          /* High-fidelity Polished Empty State */
                          <tr>
                            <td colSpan="7" style={{ padding: '36px 16px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                {/* Vector SVG Empty Illustration */}
                                <svg width="140" height="110" viewBox="0 0 140 110" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <rect x="35" y="15" width="70" height="85" rx="14" fill="#F1F5F9" stroke="#E2E8F0" strokeWidth="2"/>
                                  <rect x="42" y="24" width="56" height="70" rx="8" fill="#FFFFFF"/>
                                  {/* Clipboard clip */}
                                  <rect x="52" y="10" width="36" height="12" rx="4" fill="#CBD5E1"/>
                                  <circle cx="70" cy="16" r="3" fill="#FFFFFF"/>
                                  {/* Medical Cross */}
                                  <rect x="66" y="38" width="8" height="22" rx="3" fill="#C7D2FE"/>
                                  <rect x="59" y="45" width="22" height="8" rx="3" fill="#C7D2FE"/>
                                  {/* Pill bottle & sparkles */}
                                  <rect x="88" y="55" width="24" height="34" rx="6" fill="#EDE9FE" stroke="#DDD6FE" strokeWidth="1.5"/>
                                  <rect x="92" y="49" width="16" height="6" rx="2" fill="#818CF8"/>
                                  <circle cx="28" cy="40" r="12" fill="#EEF2FF"/>
                                  <path d="M28 34v12M22 40h12" stroke="#818CF8" strokeWidth="2" strokeLinecap="round"/>
                                  <circle cx="118" cy="35" r="4" fill="#FEF3C7"/>
                                  <circle cx="24" cy="78" r="5" fill="#DCFCE7"/>
                                </svg>
                                <div style={{ fontSize: '15px', fontWeight: 800, color: '#1E293B', marginTop: '6px' }}>
                                  No prescriptions in the pharmacy queue.
                                </div>
                                <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>
                                  You're all caught up! Great job.
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Queue Pagination Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', borderTop: '1px solid #F8FAFC', paddingTop: '14px' }}>
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                    {activeQueue.length > 0 
                      ? `Showing ${(overviewPage - 1) * overviewPageSize + 1} to ${Math.min(overviewPage * overviewPageSize, activeQueue.length)} of ${activeQueue.length} prescriptions`
                      : 'Showing 0 prescriptions'}
                  </span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button
                      onClick={() => setOverviewPage(prev => Math.max(1, prev - 1))}
                      disabled={overviewPage === 1}
                      style={{ background: 'none', border: 'none', cursor: overviewPage === 1 ? 'not-allowed' : 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', padding: '4px' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    {Array.from({ length: totalOverviewPages }).map((_, idx) => {
                      const pageNum = idx + 1;
                      const isActive = overviewPage === pageNum;
                      return (
                        <span 
                          key={pageNum}
                          onClick={() => setOverviewPage(pageNum)}
                          style={{
                            width: '26px',
                            height: '26px',
                            background: isActive ? '#2563EB' : 'transparent',
                            color: isActive ? 'white' : '#64748B',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {pageNum}
                        </span>
                      );
                    })}
                    <button
                      onClick={() => setOverviewPage(prev => Math.min(totalOverviewPages, prev + 1))}
                      disabled={overviewPage === totalOverviewPages}
                      style={{ background: 'none', border: 'none', cursor: overviewPage === totalOverviewPages ? 'not-allowed' : 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', padding: '4px' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Today's Overview (Calendar Card) */}
              <div className="glass-card calendar-right-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  {/* Calendar Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                      </div>
                      <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Today's Overview</h3>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', color: '#64748B' }}>
                      <button onClick={handlePrevMonth} style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: '6px', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                      </button>
                      <button onClick={handleNextMonth} style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: '6px', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      </button>
                    </div>
                  </div>

                  {/* Month Label */}
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginBottom: '12px' }}>
                    {activeCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </div>

                  {/* Weekday headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '6px' }}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                      <span key={day} style={{ fontSize: '10.5px', fontWeight: 750, color: '#94A3B8' }}>{day}</span>
                    ))}
                  </div>

                  {/* Calendar Day Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '18px' }}>
                    {getCalendarDays().map((d, idx) => {
                      const isToday = d.current && d.day === activeCalendarDate.getDate();
                      const hasActivity = d.current && prescriptions.some(p => {
                        if (!p.createdAt) return false;
                        const pD = new Date(p.createdAt);
                        return pD.getFullYear() === activeCalendarDate.getFullYear() &&
                               pD.getMonth() === activeCalendarDate.getMonth() &&
                               pD.getDate() === d.day;
                      });
                      return (
                        <div 
                          key={idx} 
                          className={`calendar-cell ${!d.current ? 'inactive' : ''} ${isToday ? 'active' : ''}`}
                          onClick={() => d.current && setActiveCalendarDate(new Date(activeCalendarDate.getFullYear(), activeCalendarDate.getMonth(), d.day))}
                        >
                          {d.day}
                          {hasActivity && !isToday && (
                            <span style={{ position: 'absolute', bottom: '2px', width: '3.5px', height: '3.5px', borderRadius: '50%', background: '#6366F1' }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Compact Operational Statistics Summary */}
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563EB' }}></span>
                      <span>Prescriptions</span>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{calendarDayStats.total}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }}></span>
                      <span>Dispensed</span>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{calendarDayStats.dispensed}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B' }}></span>
                      <span>Pending</span>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{calendarDayStats.pending}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }}></span>
                      <span>Cancelled</span>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{calendarDayStats.cancelled}</span>
                  </div>
                </div>

              </div>

            </div>

            {/* Bottom 4-Card Analytics Grid */}
            <div className="bottom-analytics-grid">
              
              {/* Card 1: Inventory Snapshot with Donut Chart */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                    </div>
                    <h4 style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Inventory Snapshot</h4>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  {/* Metrics on left */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700 }}>Total Items</div>
                      <div style={{ fontSize: '20px', fontWeight: 850, color: '#0F172A' }}>{inventorySnapshotStats.total}</div>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', display: 'flex', gap: '10px', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
                        <span>In Stock</span>
                        <span style={{ color: '#10B981', fontWeight: 800 }}>{inventorySnapshotStats.inStock} ({inventorySnapshotStats.inStockPct}%)</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
                        <span>Low Stock</span>
                        <span style={{ color: '#F97316', fontWeight: 800 }}>{inventorySnapshotStats.lowStock} ({inventorySnapshotStats.lowStockPct}%)</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
                        <span>Out of Stock</span>
                        <span style={{ color: '#EF4444', fontWeight: 800 }}>{inventorySnapshotStats.outOfStock} ({inventorySnapshotStats.outOfStockPct}%)</span>
                      </div>
                    </div>
                  </div>

                  {/* Multi-segment Donut Chart on right */}
                  <div style={{ position: 'relative', width: '90px', height: '90px', flexShrink: 0 }}>
                    <svg width="90" height="90" viewBox="0 0 36 36">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#F1F5F9" strokeWidth="4"/>
                      {/* 79% In Stock (Teal/Indigo) */}
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#3B82F6" strokeWidth="4" strokeDasharray={`${inventorySnapshotStats.inStockPct} ${100 - inventorySnapshotStats.inStockPct}`} strokeDashoffset="25"/>
                      {/* 10% Low Stock (Orange) */}
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#F97316" strokeWidth="4" strokeDasharray={`${inventorySnapshotStats.lowStockPct} ${100 - inventorySnapshotStats.lowStockPct}`} strokeDashoffset={25 - inventorySnapshotStats.inStockPct}/>
                      {/* 11% Out of Stock (Red) */}
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#EF4444" strokeWidth="4" strokeDasharray={`${inventorySnapshotStats.outOfStockPct} ${100 - inventorySnapshotStats.outOfStockPct}`} strokeDashoffset={25 - inventorySnapshotStats.inStockPct - inventorySnapshotStats.lowStockPct}/>
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>{inventorySnapshotStats.total}</span>
                      <span style={{ fontSize: '8.5px', color: '#94A3B8', fontWeight: 700 }}>Items</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Sales Split */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                    </div>
                    <h4 style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Sales Split</h4>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  {/* Segmented Ring Chart */}
                  <div style={{ position: 'relative', width: '85px', height: '85px', flexShrink: 0 }}>
                    <svg width="85" height="85" viewBox="0 0 36 36">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#F1F5F9" strokeWidth="4.5"/>
                      {/* OPD: 50% */}
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#3B82F6" strokeWidth="4.5" strokeDasharray={`${salesSplitStats.directPct} ${100 - salesSplitStats.directPct}`} strokeDashoffset="25"/>
                      {/* IPD: 30% */}
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#06B6D4" strokeWidth="4.5" strokeDasharray={`${salesSplitStats.opdPct} ${100 - salesSplitStats.opdPct}`} strokeDashoffset={25 - salesSplitStats.directPct}/>
                      {/* Other: 14% */}
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#8B5CF6" strokeWidth="4.5" strokeDasharray={`${salesSplitStats.otherPct} ${100 - salesSplitStats.otherPct}`} strokeDashoffset={25 - salesSplitStats.directPct - salesSplitStats.opdPct}/>
                      {/* Discounts: 6% */}
                      {/* Discounts indicator if any */}
                      {salesSplitStats.totalDiscount > 0 && (
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#F59E0B" strokeWidth="4.5" strokeDasharray="4 96" strokeDashoffset="-71"/>
                      )}
                    </svg>
                  </div>

                  {/* Legend list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11.5px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748B', fontWeight: 600 }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3B82F6' }}></span> OPD Sales
                      </span>
                      <span style={{ fontWeight: 800, color: '#0F172A' }}>₹{salesSplitStats.directSales.toFixed(0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748B', fontWeight: 600 }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#06B6D4' }}></span> IPD Sales
                      </span>
                      <span style={{ fontWeight: 800, color: '#0F172A' }}>₹{salesSplitStats.opdSales.toFixed(0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748B', fontWeight: 600 }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8B5CF6' }}></span> Other Sales
                      </span>
                      <span style={{ fontWeight: 800, color: '#0F172A' }}>₹{salesSplitStats.otherSales.toFixed(0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748B', fontWeight: 600 }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F59E0B' }}></span> Discounts
                      </span>
                      <span style={{ fontWeight: 800, color: '#0F172A' }}>₹{salesSplitStats.totalDiscount.toFixed(0)}</span>
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>Total Sales</span>
                  <span style={{ fontSize: '15px', fontWeight: 900, color: '#2563EB' }}>₹{salesSplitStats.totalSales.toFixed(0)}</span>
                </div>
              </div>

              {/* Card 3: Low Stock Alerts */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#FEF2F2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                    </div>
                    <h4 style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Low Stock Alerts</h4>
                  </div>
                  <a href="#" style={{ fontSize: '11.5px', fontWeight: 700, color: '#2563EB', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); setActiveTab('inventory'); }}>View All</a>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {actualLowStockAlerts.length > 0 ? (
                    actualLowStockAlerts.map((med, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: '#F8FAFC', borderRadius: '8px' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#1E293B', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={med.name}>{med.name}</span>
                        <span style={{ fontSize: '11.5px', fontWeight: 800, color: med.severity === 'red' ? '#EF4444' : '#F97316' }}>
                          Stock: {med.stock}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: '16px 8px', color: '#10B981', fontSize: '12px', fontWeight: 700, background: '#F0FDF4', borderRadius: '8px' }}>
                      ✓ All stock levels healthy
                    </div>
                  )}
                </div>
              </div>

              {/* Card 4: Payment Summary */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                    </div>
                    <h4 style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Payment Summary</h4>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>Collected Today</div>
                    <div style={{ fontSize: '24px', fontWeight: 850, color: '#10B981', lineHeight: 1.2 }}>₹{paymentSummaryToday.collected.toFixed(0)}</div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>Pending Amount</div>
                    <div style={{ fontSize: '20px', fontWeight: 850, color: '#F97316', lineHeight: 1.2 }}>₹{paymentSummaryToday.pending.toFixed(0)}</div>
                  </div>
                </div>

                <button 
                  onClick={() => setActiveTab('sales')}
                  style={{
                    width: '100%',
                    padding: '9px 14px',
                    borderRadius: '10px',
                    background: '#F1F5F9',
                    border: 'none',
                    color: '#4F46E5',
                    fontSize: '12px',
                    fontWeight: 750,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#EEF2FF'; e.currentTarget.style.color = '#4338CA'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#4F46E5'; }}
                >
                  View Payment Details →
                </button>
              </div>

            </div>

            {/* Real-time Catalog & Medicine Requests Section */}
            <div className="glass-card" style={{ marginTop: '20px', background: '#FFFFFF', borderRadius: '16px', padding: '20px 24px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/>
                      <path d="m8.5 8.5 7 7"/>
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                      Catalog & Medicine Authorization Tracker
                    </h3>
                    <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
                      Live approval status of new medicines submitted to Admin for vendor price catalogs
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    onClick={() => {
                      setProcurementSubTab('catalog-approvals');
                      setActiveTab('procurement');
                    }}
                    style={{ fontSize: '12.5px', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', border: '1px solid #DBEAFE', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s ease' }}
                  >
                    View All Requests ({catalogApprovalRequests.length}) →
                  </button>
                </div>
              </div>

              {catalogApprovalRequests.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                  {catalogApprovalRequests.slice(0, 4).map(req => {
                    const med = req.details?.medicine || req.details || {};
                    const vendorName = req.details?.vendorName || (vendors.find(v => v._id === req.details?.vendorId)?.name) || 'Vendor';
                    const isPending = (req.status || '').toLowerCase() === 'pending';
                    const isApproved = (req.status || '').toLowerCase() === 'approved';
                    const isRejected = (req.status || '').toLowerCase() === 'denied' || (req.status || '').toLowerCase() === 'rejected';

                    return (
                      <div key={req._id} style={{ padding: '14px 16px', borderRadius: '12px', background: isPending ? '#FFFDF5' : isApproved ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${isPending ? '#FDE68A' : isApproved ? '#BBF7D0' : '#FECACA'}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0F172A' }}>
                              {med.name || req.comment || 'Medicine Addition'}
                            </div>
                            <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
                              Vendor: <strong style={{ color: '#1E293B' }}>{vendorName}</strong>
                            </div>
                          </div>
                          {isPending && (
                            <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 800, background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>
                              ● Pending
                            </span>
                          )}
                          {isApproved && (
                            <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 800, background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC' }}>
                              ✓ Approved
                            </span>
                          )}
                          {isRejected && (
                            <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 800, background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5' }}>
                              ✕ Rejected
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed rgba(0,0,0,0.08)', paddingTop: '8px', fontSize: '12px' }}>
                          <span style={{ color: '#64748B' }}>Rate: <b style={{ color: '#0F172A' }}>₹{Number(med.price || 0).toFixed(2)}</b></span>
                          <span style={{ color: '#94A3B8', fontSize: '11px' }}>{req.createdAt ? new Date(req.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Recent'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '16px', background: '#F8FAFC', borderRadius: '10px', color: '#64748B', fontSize: '12.5px' }}>
                  No recent medicine authorization requests. Use <strong>Procurement → Vendors → + Add Med</strong> to propose new medicines for Admin review.
                </div>
              )}
            </div>

            {/* Floating Support Chat Button on bottom-right */}
            <button className="floating-support-btn" title="Pharmacy Support & Help" onClick={() => showToast('Connecting to Pharmacy Support...', 'info')}>
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
            </button>

          </div>
        )}

        {/* TAB 2: PRESCRIPTIONS LIST */}
        {activeTab === 'prescriptions' && (
          <div style={{ animation: 'slideUp 0.3s ease-out' }}>
            
            {/* Header and Filter Buttons Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Prescriptions List</h2>
              
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Search query input */}
                <div style={{ position: 'relative', width: '280px' }}>
                  <i data-lucide="search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', color: '#64748B' }}></i>
                  <input 
                    type="text" 
                    placeholder="Search name, phone, or RX ID..." 
                    value={prescriptionsSearchQuery} 
                    onChange={(e) => { setPrescriptionsSearchQuery(e.target.value); setPrescriptionsPage(1); }} 
                    style={{ width: '100%', padding: '8px 16px 8px 36px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 600, outline: 'none', transition: 'all 0.2s', color: '#1E293B' }}
                  />
                  {prescriptionsSearchQuery && (
                    <i data-lucide="x" onClick={() => setPrescriptionsSearchQuery('')} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '14px', color: '#94A3B8', cursor: 'pointer' }}></i>
                  )}
                </div>

                {/* Calendar Date Filter input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '6px 12px' }}>
                  <i data-lucide="calendar" style={{ width: '16px', color: '#64748B' }}></i>
                  <input 
                    type="date" 
                    value={prescriptionsDateFilter} 
                    onChange={(e) => { setPrescriptionsDateFilter(e.target.value); setPrescriptionsPage(1); }} 
                    style={{ border: 'none', outline: 'none', fontSize: '13px', fontWeight: 700, color: '#334155', cursor: 'pointer', fontFamily: 'Urbanist, sans-serif' }}
                  />
                  {prescriptionsDateFilter && (
                    <i data-lucide="x" onClick={() => setPrescriptionsDateFilter('')} style={{ width: '14px', color: '#94A3B8', cursor: 'pointer', marginLeft: '4px' }}></i>
                  )}
                </div>

                {/* Clear filter button */}
                {(prescriptionsSearchQuery || prescriptionsDateFilter || prescriptionsFilter !== 'All') && (
                  <button 
                    onClick={() => { setPrescriptionsSearchQuery(''); setPrescriptionsDateFilter(''); setPrescriptionsFilter('All'); setPrescriptionsPage(1); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Clear Filters
                  </button>
                )}

                {/* Export Button */}
                <button
                  type="button"
                  onClick={() => setShowPrescriptionExportModal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    background: '#FFFFFF',
                    color: '#2563EB',
                    border: '1px solid #BFDBFE',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(37,99,235,0.08)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Export filtered prescriptions dataset"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Export
                </button>
              </div>
            </div>

            {/* Sub-Tab Filter Pills */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
              {[
                { key: 'All', count: prescriptions.length },
                { key: 'Pending', count: prescriptions.filter(p => p.status === 'Pending' || p.status === 'Pending Pharmacy Dispatch').length },
                { key: 'In Progress', count: prescriptions.filter(p => p.status === 'In Progress').length },
                { key: 'Dispensed', count: prescriptions.filter(p => p.status === 'Dispensed').length },
                { key: 'Cancelled', count: prescriptions.filter(p => p.status === 'Cancelled').length }
              ].map(item => {
                const isActive = prescriptionsFilter.toLowerCase() === item.key.toLowerCase();
                return (
                  <button
                    key={item.key}
                    onClick={() => { setPrescriptionsFilter(item.key); setPrescriptionsPage(1); }}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '24px',
                      border: isActive ? '1px solid #2563EB' : '1px solid #E2E8F0',
                      background: isActive ? '#EFF6FF' : 'white',
                      color: isActive ? '#2563EB' : '#64748B',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      outline: 'none'
                    }}
                  >
                    {item.key} ({item.count})
                  </button>
                );
              })}
            </div>

            {/* Prescriptions Database Table */}
            <div className="glass-card" style={{ padding: '0 24px 24px 24px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th style={{ padding: '16px' }}>Prescription ID</th>
                      <th style={{ padding: '16px' }}>Patient</th>
                      <th style={{ padding: '16px' }}>Doctor</th>
                      <th style={{ padding: '16px' }}>Time</th>
                      <th style={{ padding: '16px', textAlign: 'center' }}>Items</th>
                      <th style={{ padding: '16px' }}>Amount</th>
                      <th style={{ padding: '16px' }}>Status</th>
                      <th style={{ padding: '16px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPrescriptions.length > 0 ? (
                      paginatedPrescriptions.map((p, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: '16px', verticalAlign: 'middle' }}>
                            <span style={{ color: '#2563EB', fontWeight: 800, fontSize: '13.5px' }}>{p.id}</span>
                          </td>
                          
                          <td style={{ padding: '16px', verticalAlign: 'middle' }}>
                            <div 
                              style={{ fontWeight: 800, fontSize: '13.5px', color: '#2563EB', cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => {
                                setSelectedPrescriptionGroup(p);
                                setPrescriptionModalStep('details');
                                setShowPrescriptionModal(true);
                              }}
                            >
                              {p.name}
                            </div>
                            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600, marginTop: '2px' }}>{p.age} Y, {p.gender}</div>
                          </td>
                          
                          <td style={{ padding: '16px', verticalAlign: 'middle' }}>
                            <div style={{ fontWeight: 800, fontSize: '13px', color: '#334155' }}>{p.docName}</div>
                            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600, marginTop: '2px' }}>{p.specialty}</div>
                          </td>
                          
                          <td style={{ padding: '16px', verticalAlign: 'middle' }}>
                            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>{p.time}</div>
                            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600, marginTop: '2px' }}>{p.dateStr}</div>
                          </td>
                          
                          <td style={{ padding: '16px', textAlign: 'center', verticalAlign: 'middle', fontWeight: 700, fontSize: '13.5px', color: '#0F172A' }}>
                            <span 
                              style={{ color: '#2563EB', cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => {
                                setSelectedPrescriptionGroup(p);
                                setPrescriptionModalStep('details');
                                setShowPrescriptionModal(true);
                              }}
                            >
                              {p.items}
                            </span>
                          </td>
                          
                          <td style={{ padding: '16px', verticalAlign: 'middle', fontWeight: 800, fontSize: '13.5px', color: '#0F172A' }}>
                            {p.amount}
                          </td>
                          
                          <td style={{ padding: '16px', verticalAlign: 'middle' }}>
                            <span 
                              className="pill-badge" 
                              style={{ 
                                background: p.status === 'Pending' ? '#FFF7ED' : p.status === 'In Progress' ? '#F5F3FF' : '#ECFDF5', 
                                color: p.status === 'Pending' ? '#EA580C' : p.status === 'In Progress' ? '#7C3AED' : '#10B981',
                                fontWeight: 700,
                                fontSize: '11px',
                                padding: '4px 10px',
                                borderRadius: '6px'
                              }}
                            >
                              {p.status}
                            </span>
                          </td>
                          
                          <td style={{ padding: '16px', textAlign: 'center', verticalAlign: 'middle' }}>
                            {p.status === 'Pending' ? (
                              <button 
                                className="btn-outline-dispense" 
                                style={{ 
                                  border: '1px solid #2563EB', 
                                  background: 'white', 
                                  color: '#2563EB', 
                                  fontWeight: 700, 
                                  padding: '6px 16px', 
                                  borderRadius: '8px', 
                                  fontSize: '12.5px', 
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  outline: 'none'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#2563EB';
                                  e.currentTarget.style.color = 'white';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'white';
                                  e.currentTarget.style.color = '#2563EB';
                                }}
                                onClick={() => {
                                  setSelectedPrescriptionGroup(p);
                                  setPrescriptionModalStep('payment');
                                  setShowPrescriptionModal(true);
                                }}
                              >
                                Dispense
                              </button>
                            ) : (
                              <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700 }}>
                                <i data-lucide="check" style={{ width: '14px', marginRight: '4px', verticalAlign: 'middle', color: '#10B981' }}></i>
                                Fulfilled
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: '#64748B', fontSize: '14px', fontWeight: 600 }}>
                          No prescriptions found matching this filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', borderTop: '1px solid #F1F5F9', paddingTop: '20px' }}>
                <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>
                  {activeTabPrescriptions.length > 0 
                    ? `Showing ${(prescriptionsPage - 1) * prescriptionsPageSize + 1} to ${Math.min(prescriptionsPage * prescriptionsPageSize, activeTabPrescriptions.length)} of ${activeTabPrescriptions.length} prescriptions`
                    : 'Showing 0 prescriptions'}
                </span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={() => setPrescriptionsPage(prev => Math.max(1, prev - 1))}
                    disabled={prescriptionsPage === 1}
                    style={{ background: 'none', border: 'none', cursor: prescriptionsPage === 1 ? 'not-allowed' : 'pointer', color: '#64748B', display: 'flex', alignItems: 'center' }}
                  >
                    <i data-lucide="chevron-left" style={{ width: '16px' }}></i>
                  </button>
                  {Array.from({ length: totalPrescriptionsPages }).map((_, idx) => {
                    const pageNum = idx + 1;
                    if (pageNum === 1 || pageNum === totalPrescriptionsPages || Math.abs(pageNum - prescriptionsPage) <= 1) {
                      const isActive = prescriptionsPage === pageNum;
                      return (
                        <span 
                          key={pageNum}
                          onClick={() => setPrescriptionsPage(pageNum)}
                          style={{
                            width: '28px',
                            height: '28px',
                            background: isActive ? '#2563EB' : 'transparent',
                            color: isActive ? 'white' : '#64748B',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {pageNum}
                        </span>
                      );
                    }
                    if (pageNum === 2 && prescriptionsPage > 3) {
                      return <span key="dots-start" style={{ color: '#94A3B8', fontSize: '12.5px', fontWeight: 700 }}>...</span>;
                    }
                    if (pageNum === totalPrescriptionsPages - 1 && prescriptionsPage < totalPrescriptionsPages - 2) {
                      return <span key="dots-end" style={{ color: '#94A3B8', fontSize: '12.5px', fontWeight: 700 }}>...</span>;
                    }
                    return null;
                  })}
                  <button
                    onClick={() => setPrescriptionsPage(prev => Math.min(totalPrescriptionsPages, prev + 1))}
                    disabled={prescriptionsPage === totalPrescriptionsPages}
                    style={{ background: 'none', border: 'none', cursor: prescriptionsPage === totalPrescriptionsPages ? 'not-allowed' : 'pointer', color: '#64748B', display: 'flex', alignItems: 'center' }}
                  >
                    <i data-lucide="chevron-right" style={{ width: '16px' }}></i>
                  </button>
                </div>
              </div>

            </div>

            {/* Prescriptions Export Modal */}
            {showPrescriptionExportModal && (
              <ExportModal
                dataset="Prescriptions"
                data={prescriptionsForExport}
                columns={prescriptionExportColumns}
                dateField="createdAt"
                currentFilters={{
                  status: prescriptionsFilter,
                  search: prescriptionsSearchQuery,
                  calendarDate: prescriptionsDateFilter
                }}
                clinicName="CUROXA HEALTHCARE"
                onClose={() => setShowPrescriptionExportModal(false)}
                onSuccess={(result) => {
                  showToast(`Exported ${result.recordCount} prescription(s) to ${result.fileName}!`, 'success');
                }}
              />
            )}

          </div>
        )}

        {/* TAB 3: INVENTORY MANAGEMENT */}
        {activeTab === 'inventory' && (
          <div style={{ animation: 'slideUp 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Pharmacy Catalog</h2>
                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                  Showing {filteredInventory.length} of {inventory.length} medications
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{
                    padding: '10px 18px',
                    fontSize: '13px',
                    borderRadius: '10px',
                    background: '#FFFFFF',
                    border: '1px solid #BFDBFE',
                    color: '#2563EB',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(37, 99, 235, 0.08)',
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => setShowInventoryExportModal(true)}
                  title="Export filtered inventory snapshot"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Export
                </button>
                <button 
                  className="btn btn-primary" 
                  style={{ padding: '10px 20px', fontSize: '13px', borderRadius: '10px', background: '#2563EB', border: 'none', color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                  onClick={handleOpenAdd}
                >
                  <i data-lucide="plus" style={{ width: '16px' }}></i> Add Medication
                </button>
              </div>
            </div>

            {/* Filter toolbar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px', minWidth: '200px' }}>
                <input
                  type="text"
                  placeholder="Search by name, SKU, or category..."
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 14px',
                    fontSize: '12.5px',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    background: '#FFFFFF',
                    color: '#0F172A',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ width: '170px' }}>
                <select
                  value={inventoryCategoryFilter}
                  onChange={(e) => setInventoryCategoryFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12.5px',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    background: '#FFFFFF',
                    color: '#0F172A',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                >
                  <option value="All">All Categories</option>
                  {uniqueInventoryCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div style={{ width: '160px' }}>
                <select
                  value={inventoryStatusFilter}
                  onChange={(e) => setInventoryStatusFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12.5px',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    background: '#FFFFFF',
                    color: '#0F172A',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                >
                  <option value="All">All Statuses</option>
                  <option value="In Stock">In Stock</option>
                  <option value="Low Stock">Low Stock</option>
                  <option value="Out of Stock">Out of Stock</option>
                </select>
              </div>
            </div>

            <div className="glass-card">
              <div style={{ overflowX: 'auto' }}>
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Medicine Name</th>
                      <th>Category</th>
                      <th>SKU Code</th>
                      <th>Stock Quantity</th>
                      <th>Unit</th>
                      <th>MRP (₹)</th>
                      <th>Expiry</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventory.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: '#64748B', fontWeight: 600 }}>
                          No medications match the active search and filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredInventory.map(inv => {
                        const risk = skuBatchRiskMap[String(inv.sku || '').toUpperCase()];
                        const hasExpired = risk && risk.expiredCount > 0;
                        const hasCritical = risk && risk.criticalCount > 0;
                        const hasWarning = risk && risk.warningCount > 0;

                        let rowBg = 'transparent';
                        if (hasExpired) rowBg = 'linear-gradient(90deg, rgba(254, 242, 242, 0.45) 0%, rgba(255, 255, 255, 0.95) 100%)';
                        else if (hasCritical) rowBg = 'linear-gradient(90deg, rgba(255, 247, 237, 0.45) 0%, rgba(255, 255, 255, 0.95) 100%)';
                        else if (hasWarning) rowBg = 'linear-gradient(90deg, rgba(254, 252, 232, 0.45) 0%, rgba(255, 255, 255, 0.95) 100%)';

                        return (
                          <tr key={inv._id} style={{ background: rowBg }}>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ fontWeight: 800, color: '#0F172A' }}>{inv.name}</div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  {hasExpired && (
                                    <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '5px', background: '#FEE2E2', color: '#DC2626', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      🔴 {risk.expiredCount} expired batch{risk.expiredCount > 1 ? 'es' : ''}
                                    </span>
                                  )}
                                  {hasCritical && (
                                    <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '5px', background: '#FFEDD5', color: '#C2410C', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      🟠 {risk.criticalCount} batch{risk.criticalCount > 1 ? 'es' : ''} expiring ≤30d
                                    </span>
                                  )}
                                  {hasWarning && (
                                    <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '5px', background: '#FEF9C3', color: '#854D0E', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      🟡 {risk.warningCount} batch{risk.warningCount > 1 ? 'es' : ''} expiring ≤90d
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td style={{ fontWeight: 600, color: '#64748B' }}>{inv.category}</td>
                            <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#475569' }}>{inv.sku}</td>
                            <td>
                              <b style={{ color: inv.stock > 20 ? '#10B981' : '#EF4444', fontWeight: 800 }}>
                                {inv.stock}
                              </b>
                            </td>
                            <td style={{ fontWeight: 600, color: '#64748B' }}>{inv.unit}</td>
                            <td style={{ fontWeight: 800, color: '#0F172A' }}>₹{inv.mrp ? Number(inv.mrp).toFixed(2) : '0.00'}</td>
                            <td style={{ fontWeight: 600, color: '#475569' }}>{inv.expiry}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                  className="btn btn-secondary" 
                                  style={{ padding: '6px 12px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid #E2E8F0', background: 'transparent', color: '#475569', fontWeight: 700, cursor: 'pointer' }} 
                                  onClick={() => handleOpenEdit(inv)}
                                >
                                  Edit
                                </button>
                                <button 
                                  className="btn btn-secondary" 
                                  style={{ padding: '6px 12px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid #FEE2E2', background: 'transparent', color: '#EF4444', fontWeight: 700, cursor: 'pointer' }} 
                                  onClick={() => handleDeleteMedicine(inv._id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Inventory Export Modal */}
            {showInventoryExportModal && (
              <ExportModal
                dataset="Inventory"
                data={filteredInventory}
                columns={inventoryExportColumns}
                dateField={null}
                currentFilters={{
                  search: inventorySearch,
                  category: inventoryCategoryFilter,
                  status: inventoryStatusFilter
                }}
                clinicName="CUROXA HEALTHCARE"
                onClose={() => setShowInventoryExportModal(false)}
                onSuccess={(result) => {
                  showToast(`Exported ${result.recordCount} inventory items to ${result.fileName}!`, 'success');
                }}
              />
            )}
          </div>
        )}

        {/* TAB: EXPIRY MANAGEMENT */}
        {activeTab === 'expiry' && (
          <ExpiryManagementPanel
            showToast={showToast}
            onStockUpdated={() => {
              fetchInventory();
              fetchSales();
            }}
          />
        )}

        {/* TAB 4: INTERNAL REQUESTS */}
        {activeTab === 'internal' && (() => {
          const getIndentStatusStyle = (status) => {
            switch (status) {
              case 'Pending': return { background: '#FEF3C7', color: '#D97706', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 };
              case 'Approved': return { background: '#D1FAE5', color: '#065F46', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 };
              case 'Received':
              case 'Fulfilled': return { background: '#D1FAE5', color: '#065F46', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 };
              case 'Partially Fulfilled': return { background: '#FFF3E0', color: '#E65100', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 };
              case 'Awaiting Stock': return { background: '#FEF2F2', color: '#DC2626', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 };
              case 'Rejected':
              case 'Cannot Fulfill': return { background: '#FEE2E2', color: '#991B1B', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 };
              default: return { background: '#F1F5F9', color: '#475569', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 };
            }
          };

          const getIndentRowBg = (status) => {
            if (status === 'Pending') return 'rgba(254, 243, 199, 0.15)';
            if (status === 'Approved') return 'rgba(209, 250, 229, 0.15)';
            if (status === 'Received' || status === 'Fulfilled') return 'rgba(209, 250, 229, 0.10)';
            if (status === 'Partially Fulfilled') return 'rgba(255, 243, 224, 0.15)';
            if (status === 'Awaiting Stock') return 'rgba(254, 226, 226, 0.15)';
            if (status === 'Rejected' || status === 'Cannot Fulfill') return 'rgba(254, 226, 226, 0.15)';
            return 'transparent';
          };

          const avatarColors = ['#E0F2FE', '#FEE2E2', '#E0FDF4', '#FEF3C7', '#F3E8FF'];
          const avatarText = ['#0369A1', '#991B1B', '#16A34A', '#D97706', '#6D28D9'];

          return (
            <div style={{ animation: 'slideUp 0.3s ease-out' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Internal Clinic Requests</h2>
                  <p style={{ color: '#64748B', fontSize: '14px', margin: '4px 0 0 0' }}>Review, track, and fulfill admin-authorized medicine indents and consumable supplies.</p>
                </div>
              </div>

              <div className="glass-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid #E2E8F0', borderRadius: '16px', background: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Indent ID</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Items</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Requester / Dept</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Priority</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Requested</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Approved</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Supplied</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Remaining</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {indents.length === 0 ? (
                        <tr>
                          <td colSpan={10} style={{ textAlign: 'center', padding: '48px', color: '#94A3B8', fontWeight: 600 }}>
                            No approved internal requests found
                          </td>
                        </tr>
                      ) : (
                        indents.map((ind, idx) => {
                          const reqTotal = (ind.items || []).reduce((sum, it) => sum + (Number(it.requiredQty) || 0), 0);
                          const appTotal = (ind.items || []).reduce((sum, it) => (it.approvedQty !== null && it.approvedQty !== undefined ? sum + Number(it.approvedQty) : sum), 0);
                          const supTotal = (ind.items || []).reduce((sum, it) => sum + (Number(it.suppliedQty) || 0), 0);
                          const remTotal = (ind.items || []).reduce((sum, it) => (it.approvedQty !== null && it.approvedQty !== undefined ? sum + Math.max(0, Number(it.approvedQty) - (Number(it.suppliedQty) || 0)) : sum), 0);

                          return (
                            <tr 
                              key={ind._id || ind.indentId || idx} 
                              onClick={() => { setSelectedIndent(ind); setSupplyInputMap({}); setShowIndentModal(true); }}
                              style={{ 
                                background: getIndentRowBg(ind.status), 
                                borderBottom: '1px solid rgba(241,245,249,0.8)',
                                cursor: 'pointer',
                                transition: 'background 0.2s'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(241,245,249,0.4)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = getIndentRowBg(ind.status); }}
                            >
                              <td style={{ padding: '14px 16px', fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>
                                {ind.indentId}
                              </td>
                              <td style={{ padding: '14px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={{ 
                                    width: '30px', 
                                    height: '30px', 
                                    borderRadius: '8px', 
                                    background: avatarColors[idx % avatarColors.length], 
                                    color: avatarText[idx % avatarText.length], 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    fontSize: '11px', 
                                    fontWeight: 900, 
                                    flexShrink: 0 
                                  }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/>
                                      <path d="m8.5 8.5 7 7"/>
                                    </svg>
                                  </div>
                                  <span style={{ fontWeight: 700, color: '#1E293B', fontSize: '13px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '180px' }} title={(ind.items || []).map(it => it.name).join(', ')}>
                                    {(ind.items || []).map(it => it.name).join(', ') || 'No Items'}
                                  </span>
                                </div>
                              </td>
                              <td style={{ padding: '14px 16px', fontSize: '12.5px' }}>
                                <div style={{ fontWeight: 700, color: '#1E293B' }}>{ind.requestedBy}</div>
                                <div style={{ fontSize: '11px', color: '#64748B' }}>{ind.department}</div>
                              </td>
                              <td style={{ padding: '14px 16px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, fontSize: '12px', color: ind.priority === 'Urgent' ? '#DC2626' : '#475569' }}>
                                  {ind.priority === 'Urgent' && (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="18 15 12 9 6 15"/>
                                    </svg>
                                  )}
                                  {ind.priority}
                                </span>
                              </td>
                              <td style={{ padding: '14px 16px', fontWeight: 700, color: '#475569', fontSize: '13px', textAlign: 'center' }}>
                                {reqTotal}
                              </td>
                              <td style={{ padding: '14px 16px', fontWeight: 800, color: '#2563EB', fontSize: '13px', textAlign: 'center' }}>
                                {appTotal}
                              </td>
                              <td style={{ padding: '14px 16px', fontWeight: 800, color: '#16A34A', fontSize: '13px', textAlign: 'center' }}>
                                {supTotal}
                              </td>
                              <td style={{ padding: '14px 16px', fontWeight: 800, color: remTotal > 0 ? '#D97706' : '#64748B', fontSize: '13px', textAlign: 'center' }}>
                                {remTotal}
                              </td>
                              <td style={{ padding: '14px 16px' }}>
                                <span style={getIndentStatusStyle(ind.status)}>{ind.status}</span>
                              </td>
                              <td onClick={e => e.stopPropagation()} style={{ padding: '14px 16px', textAlign: 'right' }}>
                                {!['Received', 'Fulfilled', 'Cannot Fulfill', 'Rejected'].includes(ind.status) ? (
                                  <button
                                    onClick={() => { setSelectedIndent(ind); setSupplyInputMap({}); setShowIndentModal(true); }}
                                    style={{ padding: '6px 14px', background: '#2563EB', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                  >
                                    Fulfill / Review
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => { setSelectedIndent(ind); setSupplyInputMap({}); setShowIndentModal(true); }}
                                    style={{ padding: '5px 10px', background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                                  >
                                    View Details
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

                {/* TAB 5: SALES LOG */}
        {activeTab === 'sales' && (
          <div style={{ animation: 'slideUp 0.3s ease-out' }}>
            
            {/* Header with Title and Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Sales & Settlement Logs</h2>
                <p style={{ color: '#64748B', fontSize: '13px', margin: '4px 0 0', fontWeight: 500 }}>
                  Real-time pharmacy transaction ledger for both Prescription and Direct sales.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    setDirectSaleCustomerType('WALK_IN');
                    setDirectSaleCustomerName('');
                    setDirectSaleCustomerMobile('');
                    setDirectSaleSelectedPatientId('');
                    setDirectSaleItems([]);
                    setShowDirectSaleModal(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '9px 18px',
                    borderRadius: '10px',
                    background: '#2563EB',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '13.5px',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                    transition: 'all 0.2s'
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  Direct Sale
                </button>

                <button 
                  className="btn btn-secondary" 
                  onClick={handleExportSalesCSV} 
                  style={{ 
                    padding: '9px 16px', 
                    fontSize: '13px', 
                    borderRadius: '10px', 
                    background: 'white', 
                    border: '1px solid #CBD5E1', 
                    color: '#334155', 
                    fontWeight: 700, 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Export Report
                </button>
              </div>
            </div>

            {/* Operational Summary KPI Cards */}
            {(() => {
              const todaySales = (pharmacySales || []).filter(s => {
                const d = s.saleDate || s.createdAt;
                return isTodayDate(d);
              });

              const todayRev = todaySales.reduce((acc, s) => acc + (s.grandTotal || 0), 0);
              const directCount = (pharmacySales || []).filter(s => s.saleType === 'DIRECT').length;
              const rxCount = (pharmacySales || []).filter(s => s.saleType === 'PRESCRIPTION').length;
              const totalLedgerRev = (pharmacySales || []).reduce((acc, s) => acc + (s.grandTotal || 0), 0);

              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                  <div className="glass-card" style={{ padding: '18px 20px', borderRadius: '16px', background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Today's Sales</div>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', marginTop: '6px' }}>₹{todayRev.toFixed(2)}</div>
                    <div style={{ fontSize: '11.5px', color: '#10B981', fontWeight: 700, marginTop: '4px' }}>{todaySales.length} transactions today</div>
                  </div>

                  <div className="glass-card" style={{ padding: '18px 20px', borderRadius: '16px', background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Direct Sales</div>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#4F46E5', marginTop: '6px' }}>{directCount}</div>
                    <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600, marginTop: '4px' }}>OTC / Walk-in transactions</div>
                  </div>

                  <div className="glass-card" style={{ padding: '18px 20px', borderRadius: '16px', background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Prescription Sales</div>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#059669', marginTop: '6px' }}>{rxCount}</div>
                    <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600, marginTop: '4px' }}>Dispensed via Doctor Rx</div>
                  </div>

                  <div className="glass-card" style={{ padding: '18px 20px', borderRadius: '16px', background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Page Revenue</div>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', marginTop: '6px' }}>₹{totalLedgerRev.toFixed(2)}</div>
                    <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600, marginTop: '4px' }}>Total on current view</div>
                  </div>
                </div>
              );
            })()}

            {/* Filter Toolbar */}
            <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '16px', marginBottom: '20px', border: '1px solid #E2E8F0', background: 'white' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                
                {/* Search Input */}
                <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  <input
                    type="text"
                    placeholder="Search Sale ID, Customer, Doctor..."
                    value={salesSearchQuery}
                    onChange={(e) => { setSalesSearchQuery(e.target.value); setSalesCurrentPage(1); }}
                    style={{ width: '100%', padding: '8px 14px 8px 36px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 600, color: '#1E293B', outline: 'none' }}
                  />
                  {salesSearchQuery && (
                    <button onClick={() => setSalesSearchQuery('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '13px', fontWeight: 'bold' }}>✕</button>
                  )}
                </div>

                {/* Sale Type Filter */}
                <select
                  value={salesFilterType}
                  onChange={(e) => { setSalesFilterType(e.target.value); setSalesCurrentPage(1); }}
                  style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 600, color: '#334155', background: 'white', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="ALL">All Sale Types</option>
                  <option value="DIRECT">Direct Sale</option>
                  <option value="PRESCRIPTION">Prescription Sale</option>
                </select>

                {/* Date Range Selector */}
                <select
                  value={salesFilterDateRange}
                  onChange={(e) => { setSalesFilterDateRange(e.target.value); setSalesCurrentPage(1); }}
                  style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 600, color: '#334155', background: 'white', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="All Time">All Time</option>
                  <option value="Today">Today</option>
                  <option value="This Week">This Week</option>
                  <option value="This Month">This Month</option>
                  <option value="Custom Range">Custom Range</option>
                </select>

                {/* Custom Date Pickers */}
                {salesFilterDateRange === 'Custom Range' && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="date"
                      value={salesCustomStartDate}
                      onChange={(e) => { setSalesCustomStartDate(e.target.value); setSalesCurrentPage(1); }}
                      style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12.5px', fontWeight: 600, color: '#334155' }}
                    />
                    <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700 }}>to</span>
                    <input
                      type="date"
                      value={salesCustomEndDate}
                      onChange={(e) => { setSalesCustomEndDate(e.target.value); setSalesCurrentPage(1); }}
                      style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12.5px', fontWeight: 600, color: '#334155' }}
                    />
                  </div>
                )}

                {/* Payment Method Filter */}
                <select
                  value={salesFilterPaymentMethod}
                  onChange={(e) => { setSalesFilterPaymentMethod(e.target.value); setSalesCurrentPage(1); }}
                  style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 600, color: '#334155', background: 'white', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="ALL">All Methods</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                </select>

                {/* Payment Status Filter */}
                <select
                  value={salesFilterStatus}
                  onChange={(e) => { setSalesFilterStatus(e.target.value); setSalesCurrentPage(1); }}
                  style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 600, color: '#334155', background: 'white', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="REFUNDED">Refunded</option>
                </select>

                {/* Reset Filters */}
                {(salesFilterType !== 'ALL' || salesFilterStatus !== 'ALL' || salesFilterPaymentMethod !== 'ALL' || salesFilterDateRange !== 'All Time' || salesSearchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSalesFilterType('ALL');
                      setSalesFilterStatus('ALL');
                      setSalesFilterPaymentMethod('ALL');
                      setSalesFilterDateRange('All Time');
                      setSalesCustomStartDate('');
                      setSalesCustomEndDate('');
                      setSalesSearchQuery('');
                      setSalesCurrentPage(1);
                    }}
                    style={{ padding: '8px 12px', borderRadius: '8px', background: '#F1F5F9', border: 'none', color: '#64748B', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Reset Filters
                  </button>
                )}

              </div>
            </div>

            {/* Sales Ledger Data Table */}
            <div className="glass-card" style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #E2E8F0', background: 'white' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '950px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '14px 18px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sale ID</th>
                      <th style={{ padding: '14px 18px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date & Time</th>
                      <th style={{ padding: '14px 18px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer / Patient</th>
                      <th style={{ padding: '14px 18px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sale Type</th>
                      <th style={{ padding: '14px 18px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Doctor / Source</th>
                      <th style={{ padding: '14px 18px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Items</th>
                      <th style={{ padding: '14px 18px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Amount</th>
                      <th style={{ padding: '14px 18px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payment</th>
                      <th style={{ padding: '14px 18px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                      <th style={{ padding: '14px 18px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pharmacist</th>
                      <th style={{ padding: '14px 18px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingSales ? (
                      <tr>
                        <td colSpan="11" style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                            <div style={{ width: '20px', height: '20px', border: '2px solid #2563EB', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
                            <span style={{ fontSize: '14px', fontWeight: 600 }}>Loading sales records...</span>
                          </div>
                        </td>
                      </tr>
                    ) : (pharmacySales || []).length === 0 ? (
                      <tr>
                        <td colSpan="11" style={{ padding: '48px 20px', textAlign: 'center' }}>
                          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F1F5F9', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                          </div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>No sales transactions found</div>
                          <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 16px' }}>Try adjusting your filters or complete a new Direct Sale.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setDirectSaleCustomerType('WALK_IN');
                              setDirectSaleCustomerName('');
                              setDirectSaleCustomerMobile('');
                              setDirectSaleSelectedPatientId('');
                              setDirectSaleItems([]);
                              setShowDirectSaleModal(true);
                            }}
                            style={{ padding: '8px 18px', background: '#2563EB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            + Create Direct Sale
                          </button>
                        </td>
                      </tr>
                    ) : (
                      pharmacySales.map((sale) => {
                        const dateStr = sale.saleDate ? new Date(sale.saleDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
                        const timeStr = sale.saleTime || (sale.createdAt ? new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

                        return (
                          <tr 
                            key={sale._id}
                            style={{ borderBottom: '1px solid #F1F5F9', transition: 'background-color 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            {/* Sale ID */}
                            <td style={{ padding: '14px 18px', fontWeight: 800, fontSize: '13.5px', color: '#2563EB', fontFamily: 'monospace' }}>
                              {sale.saleId}
                            </td>

                            {/* Date & Time */}
                            <td style={{ padding: '14px 18px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>{dateStr}</div>
                              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', fontWeight: 500 }}>{timeStr}</div>
                            </td>

                            {/* Customer / Patient */}
                            <td style={{ padding: '14px 18px' }}>
                              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>
                                {sale.customerName}
                              </div>
                              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px', fontWeight: 500 }}>
                                {sale.patientIdentifier ? (sale.patientIdentifier + ' • ') : ''}{sale.customerMobile || 'No contact'}
                              </div>
                            </td>

                            {/* Sale Type */}
                            <td style={{ padding: '14px 18px' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.4px',
                                background: sale.saleType === 'DIRECT' ? '#EEF2FF' : '#ECFDF5',
                                color: sale.saleType === 'DIRECT' ? '#4F46E5' : '#059669',
                                border: sale.saleType === 'DIRECT' ? '1px solid #C7D2FE' : '1px solid #A7F3D0'
                              }}>
                                {sale.saleType === 'DIRECT' ? 'DIRECT' : 'PRESCRIPTION'}
                              </span>
                            </td>

                            {/* Doctor / Source */}
                            <td style={{ padding: '14px 18px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: sale.saleType === 'DIRECT' ? '#64748B' : '#0F172A' }}>
                                {sale.doctorName || (sale.saleType === 'DIRECT' ? 'Self / No Doctor' : 'Doctor')}
                              </div>
                              {sale.prescriptionCode && (
                                <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 700, marginTop: '2px' }}>
                                  {sale.prescriptionCode}
                                </div>
                              )}
                            </td>

                            {/* Items count */}
                            <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', background: '#F1F5F9', fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                                {sale.items?.length || 0}
                              </span>
                            </td>

                            {/* Grand Total Amount */}
                            <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 900, fontSize: '14px', color: '#0F172A' }}>
                              ₹{(sale.grandTotal || 0).toFixed(2)}
                            </td>

                            {/* Payment */}
                            <td style={{ padding: '14px 18px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
                                  {sale.paymentMethod || 'Cash'}
                                </span>
                              </div>
                              <div style={{ fontSize: '11px', color: '#16A34A', fontWeight: 700, marginTop: '2px' }}>
                                {sale.paymentStatus || 'PAID'}
                              </div>
                            </td>

                            {/* Status */}
                            <td style={{ padding: '14px 18px' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 800,
                                background: sale.status === 'COMPLETED' ? '#ECFDF5' : '#FEF2F2',
                                color: sale.status === 'COMPLETED' ? '#047857' : '#DC2626'
                              }}>
                                {sale.status || 'COMPLETED'}
                              </span>
                            </td>

                            {/* Pharmacist */}
                            <td style={{ padding: '14px 18px', fontSize: '12.5px', color: '#475569', fontWeight: 600 }}>
                              {sale.pharmacistName || 'Pharmacist'}
                            </td>

                            {/* Actions */}
                            <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedSaleDetail(sale);
                                    setShowSaleDetailModal(true);
                                  }}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    background: '#EFF6FF',
                                    color: '#2563EB',
                                    border: '1px solid #DBEAFE',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                  }}
                                >
                                  Details
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePrintSaleReceipt(sale)}
                                  title="Print Tax Receipt"
                                  style={{
                                    padding: '5px 8px',
                                    borderRadius: '6px',
                                    background: '#F1F5F9',
                                    color: '#475569',
                                    border: '1px solid #E2E8F0',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar */}
              {salesTotalCount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                    Showing <strong style={{ color: '#0F172A' }}>{Math.min(salesTotalCount, (salesCurrentPage - 1) * salesPageSize + 1)}</strong> to <strong style={{ color: '#0F172A' }}>{Math.min(salesTotalCount, salesCurrentPage * salesPageSize)}</strong> of <strong style={{ color: '#0F172A' }}>{salesTotalCount}</strong> sales
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      type="button"
                      disabled={salesCurrentPage <= 1}
                      onClick={() => setSalesCurrentPage(prev => Math.max(1, prev - 1))}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        background: salesCurrentPage <= 1 ? '#F1F5F9' : 'white',
                        color: salesCurrentPage <= 1 ? '#94A3B8' : '#334155',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: salesCurrentPage <= 1 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Previous
                    </button>
                    
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569', padding: '0 4px' }}>
                      Page {salesCurrentPage} of {salesTotalPages}
                    </span>

                    <button
                      type="button"
                      disabled={salesCurrentPage >= salesTotalPages}
                      onClick={() => setSalesCurrentPage(prev => Math.min(salesTotalPages, prev + 1))}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        background: salesCurrentPage >= salesTotalPages ? '#F1F5F9' : 'white',
                        color: salesCurrentPage >= salesTotalPages ? '#94A3B8' : '#334155',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: salesCurrentPage >= salesTotalPages ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}


        {/* TAB 6: RETURNS */}
        {activeTab === 'returns' && (
          <div style={{ animation: 'slideUp 0.3s ease-out' }}>
            
            {/* Header and Log Return Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Medication Returns</h2>
              <button 
                className="btn btn-primary"
                onClick={() => {
                  setReturnType('Prescription-Linked');
                  setReturnPatientName('');
                  setReturnPatientPhone('');
                  setReturnPrescriptionId('');
                  setReturnPrescriptionCode('');
                  setReturnItems([{ medicineName: '', quantity: 1, unitPrice: 0, reason: 'Doctor changed medication', action: 'Restocked' }]);
                  setShowLogReturnModal(true);
                }}
                style={{ padding: '10px 20px', fontSize: '13px', borderRadius: '10px', background: '#2563EB', border: 'none', color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
              >
                <i data-lucide="plus" style={{ width: '16px' }}></i> Log Medication Return
              </button>
            </div>

            {/* Metrics cards row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px' }}>
              <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ background: '#EFF6FF', color: '#2563EB', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i data-lucide="refresh-cw" style={{ width: '22px' }}></i>
                </div>
                <div>
                  <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700 }}>Total Returns</span>
                  <h4 style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 900, color: '#0F172A' }}>{returnLogs.length} Cases</h4>
                </div>
              </div>

              <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ background: '#ECFDF5', color: '#10B981', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i data-lucide="dollar-sign" style={{ width: '22px' }}></i>
                </div>
                <div>
                  <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700 }}>Total Refunded</span>
                  <h4 style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 900, color: '#10B981' }}>
                    ₹{returnLogs.reduce((acc, curr) => acc + curr.totalRefund, 0).toFixed(2)}
                  </h4>
                </div>
              </div>

              <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ background: '#F0FDF4', color: '#16A34A', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i data-lucide="package" style={{ width: '22px' }}></i>
                </div>
                <div>
                  <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700 }}>Restocked Items</span>
                  <h4 style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 900, color: '#16A34A' }}>
                    {returnLogs.reduce((acc, curr) => acc + (curr.items || []).reduce((sum, item) => sum + (item.action === 'Restocked' ? item.quantity : 0), 0), 0)} Units
                  </h4>
                </div>
              </div>

              <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ background: '#FEF2F2', color: '#EF4444', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i data-lucide="trash" style={{ width: '22px' }}></i>
                </div>
                <div>
                  <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700 }}>Discarded Items</span>
                  <h4 style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 900, color: '#EF4444' }}>
                    {returnLogs.reduce((acc, curr) => acc + (curr.items || []).reduce((sum, item) => sum + (item.action === 'Discarded' ? item.quantity : 0), 0), 0)} Units
                  </h4>
                </div>
              </div>
            </div>

            {/* Return Logs Table */}
            <div className="glass-card">
              <div style={{ overflowX: 'auto' }}>
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Return ID</th>
                      <th>Type</th>
                      <th>Patient Details</th>
                      <th>Returned Medicines</th>
                      <th>Refund Amount</th>
                      <th>Date & Time</th>
                      <th>Logged By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnLogs.map(log => (
                      <tr key={log._id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563EB' }}>{log.returnId}</td>
                        <td>
                          <span 
                            className="pill-badge" 
                            style={{ 
                              background: log.returnType === 'Prescription-Linked' ? '#EFF6FF' : '#F1F5F9', 
                              color: log.returnType === 'Prescription-Linked' ? '#2563EB' : '#475569',
                              fontWeight: 700,
                              fontSize: '11px',
                              padding: '4px 10px',
                              borderRadius: '6px'
                            }}
                          >
                            {log.returnType}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 800, color: '#0F172A' }}>{log.patientName}</div>
                          {log.patientPhone && <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>{log.patientPhone}</div>}
                          {log.returnType === 'Prescription-Linked' && log.prescriptionCode && (
                            <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 700, marginTop: '4px' }}>
                              Linked: {log.prescriptionCode}
                            </div>
                          )}
                          {log.returnType === 'Prescription-Linked' && log.prescriptionId?.createdAt && (
                            <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
                              Purchased: {new Date(log.prescriptionId.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {(log.items || []).map((item, idx) => (
                              <div key={idx} style={{ fontSize: '12.5px', color: '#334155', fontWeight: 600 }}>
                                • {item.medicineName} x <b>{item.quantity}</b> 
                                <span style={{ marginLeft: '6px', fontSize: '10.5px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: item.action === 'Restocked' ? '#ECFDF5' : '#FEF2F2', color: item.action === 'Restocked' ? '#10B981' : '#EF4444' }}>
                                  {item.action}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td style={{ fontWeight: 800, color: '#10B981' }}>₹{log.totalRefund.toFixed(2)}</td>
                        <td style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>
                          {new Date(log.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                        <td style={{ fontWeight: 700, color: '#475569' }}>{log.loggedBy}</td>
                      </tr>
                    ))}
                    {returnLogs.length === 0 && (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                          <i data-lucide="inbox" style={{ width: '32px', height: '32px', marginBottom: '8px', color: '#CBD5E1', display: 'block', margin: '0 auto' }}></i>
                          No medication returns logged today.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB 7: REPORTS */}
        {activeTab === 'reports' && (
          <div style={{ animation: 'slideUp 0.3s ease-out' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', marginBottom: '24px' }}>Pharmacy Analytics & Reports</h2>
            <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
              <i data-lucide="trending-up" style={{ width: '48px', height: '48px', marginBottom: '16px', color: '#2563EB' }}></i>
              <h3>Download CSV Reports</h3>
              <p style={{ color: '#64748B', maxWidth: '400px', margin: '0 auto 20px' }}>Compile complete records of inventories, stock movements, purchase orders, and sales receipts scoped to this clinical tenant.</p>
              <button className="btn btn-primary" onClick={handleExportInventoryCSV} style={{ padding: '10px 20px', fontSize: '13px', borderRadius: '10px', background: '#2563EB', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                <i data-lucide="download" style={{ width: '16px', marginRight: '6px' }}></i> Generate CSV
              </button>
            </div>
          </div>
        )}

        {/* TAB 8: PROFILE */}
        {activeTab === 'profile-tab' && (
          <div style={{ animation: 'slideUp 0.3s ease-out' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', marginBottom: '24px' }}>Staff Profile</h2>
            <div className="glass-card" style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              <img 
                src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200&auto=format&fit=crop&q=80" 
                alt="Pharmacist Avatar" 
                style={{ width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #EFF6FF' }} 
              />
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>{user.name}</h3>
                <p style={{ margin: '4px 0 12px', fontSize: '13px', color: '#64748B', fontWeight: 700 }}>Pharmacy Operations Manager</p>
                <div style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                  <div>Email: <b>{user.email || 'ankit.sharma@curoxa.com'}</b></div>
                  <div style={{ marginTop: '4px' }}>Shift Status: <span style={{ color: '#10B981', fontWeight: 800 }}>Active Shift</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 9: PROCUREMENT SUITE */}
        {activeTab === 'procurement' && (
          <div style={{ animation: 'slideUp 0.3s ease-out', paddingBottom: '40px' }}>
            {/* SUB-TABS BAR */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Procurement Suite</h2>
              <div style={{ display: 'flex', gap: '8px', background: '#E2E8F0', padding: '4px', borderRadius: '10px' }}>
                <button 
                  className="btn" 
                  style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', background: procurementSubTab === 'vendors' ? 'white' : 'transparent', color: procurementSubTab === 'vendors' ? '#2563EB' : '#64748B', boxShadow: procurementSubTab === 'vendors' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                  onClick={() => setProcurementSubTab('vendors')}
                >
                  Vendors
                </button>
                <button 
                  className="btn" 
                  style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', background: procurementSubTab === 'pos' ? 'white' : 'transparent', color: procurementSubTab === 'pos' ? '#2563EB' : '#64748B', boxShadow: procurementSubTab === 'pos' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                  onClick={() => setProcurementSubTab('pos')}
                >
                  Purchase Orders
                </button>
                <button 
                  className="btn" 
                  style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', background: procurementSubTab === 'grn' ? 'white' : 'transparent', color: procurementSubTab === 'grn' ? '#2563EB' : '#64748B', boxShadow: procurementSubTab === 'grn' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                  onClick={() => setProcurementSubTab('grn')}
                >
                  Goods Receipts (GRN)
                </button>
                <button 
                  className="btn" 
                  style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', background: procurementSubTab === 'tickets' ? 'white' : 'transparent', color: procurementSubTab === 'tickets' ? '#2563EB' : '#64748B', boxShadow: procurementSubTab === 'tickets' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                  onClick={() => setProcurementSubTab('tickets')}
                >
                  Replenishment Tickets
                </button>
                <button 
                  className="btn" 
                  style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', background: procurementSubTab === 'catalog-approvals' ? 'white' : 'transparent', color: procurementSubTab === 'catalog-approvals' ? '#2563EB' : '#64748B', boxShadow: procurementSubTab === 'catalog-approvals' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setProcurementSubTab('catalog-approvals')}
                >
                  Catalog Approvals
                  {catalogApprovalRequests.filter(a => (a.status || '').toLowerCase() === 'pending').length > 0 && (
                    <span style={{ background: '#FEF3C7', color: '#B45309', padding: '1px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: 800 }}>
                      {catalogApprovalRequests.filter(a => (a.status || '').toLowerCase() === 'pending').length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* VENDORS VIEW */}
            {procurementSubTab === 'vendors' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1E293B', margin: 0 }}>Supplier Partnerships</h3>
                  <button 
                    className="btn btn-primary"
                    style={{ padding: '8px 16px', fontSize: '12.5px', borderRadius: '8px', background: '#2563EB', border: 'none', color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                    onClick={() => {
                      setNewVendor({
                        name: '',
                        code: `VEND-0${vendors.length + 1}`,
                        email: '',
                        phone: '',
                        address: '',
                        type: 'Medicine',
                        status: 'Proposed',
                        medicines: [{ name: '', sku: '', price: '', gst: 12, available: true }]
                      });
                      setShowAddVendorModal(true);
                    }}
                  >
                    <i data-lucide="plus" style={{ width: '16px' }}></i> Add Vendor
                  </button>
                </div>

                <div className="glass-card">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th>Vendor Code</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Phone</th>
                          <th>Address</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendors.map(v => (
                          <tr key={v._id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563EB' }}>{v.code}</td>
                            <td><div style={{ fontWeight: 800, color: '#0F172A' }}>{v.name}</div></td>
                            <td style={{ fontWeight: 600, color: '#64748B' }}>{v.email || '--'}</td>
                            <td style={{ fontWeight: 600, color: '#64748B' }}>{v.phone || '--'}</td>
                            <td style={{ fontWeight: 600, color: '#475569' }}>{v.address || '--'}</td>
                            <td>
                              <span style={{
                                fontSize: '11.5px',
                                padding: '3px 8px',
                                borderRadius: '9999px',
                                fontWeight: 800,
                                background: v.status === 'Active' ? '#DEF7EC' : v.status === 'Proposed' ? '#FEF3C7' : v.status === 'Proposed/Rejected' ? '#FDE8E8' : '#F1F5F9',
                                color: v.status === 'Active' ? '#03543F' : v.status === 'Proposed' ? '#D97706' : v.status === 'Proposed/Rejected' ? '#9B1C1C' : '#475569'
                              }}>
                                {v.status === 'Proposed' ? 'Pending Admin Approval' : v.status === 'Proposed/Rejected' ? 'Rejected' : (v.status || 'Active')}
                              </span>
                            </td>
                            <td style={{ display: 'flex', gap: '8px' }}>
                              <button 
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid #E2E8F0', background: 'transparent', color: '#2563EB', fontWeight: 700, cursor: 'pointer' }}
                                onClick={() => setSelectedVendor(v)}
                              >
                                View Profile
                              </button>
                              <button 
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '6px 12px', fontSize: '11.5px', borderRadius: '6px', border: 'none', background: '#2563EB', color: '#FFFFFF', fontWeight: 700, cursor: 'pointer' }}
                                onClick={() => {
                                  setSelectedVendor(v);
                                  setNewMedApprovalData({
                                    name: '',
                                    sku: '',
                                    price: '',
                                    gst: 12,
                                    available: true,
                                    mrp: '',
                                    comment: ''
                                  });
                                  setShowAddMedicineApprovalModal(true);
                                }}
                              >
                                + Add Med
                              </button>
                              <button 
                                className="btn"
                                style={{ padding: '6px 12px', fontSize: '11.5px', borderRadius: '6px', border: 'none', background: '#FEE2E2', color: '#DC2626', fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.2s' }}
                                onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                onClick={async () => {
                                  if (window.confirm(`Are you sure you want to delete vendor "${v.name}"?`)) {
                                    try {
                                      await api.delete(`/vendors/${v._id}`);
                                      setVendors(prev => prev.filter(x => x._id !== v._id));
                                      showToast('Vendor deleted successfully!');
                                    } catch (err) {
                                      console.error(err);
                                      showToast('Failed to delete vendor', 'error');
                                    }
                                  }
                                }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                        {vendors.length === 0 && (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>No vendors configured.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* PURCHASE ORDERS VIEW */}
            {procurementSubTab === 'pos' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1E293B', margin: 0 }}>Purchase Orders</h3>
                    <p style={{ fontSize: '12.5px', color: '#64748B', margin: '2px 0 0 0' }}>Consolidated hospital procurement &amp; vendor-specific purchase orders</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn btn-secondary"
                      style={{ padding: '8px 14px', fontSize: '12.5px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#334155', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                      onClick={() => {
                        if (purchaseOrders.length === 0) {
                          showToast('No purchase orders to export', 'info');
                          return;
                        }
                        const headers = ['PO Number', 'Type', 'Master PO', 'Supplier', 'Date', 'Total Amount', 'Status', 'Requested By'];
                        const rows = purchaseOrders.map(p => [
                          p.poId,
                          p.isParent ? 'Consolidated Master' : 'Vendor Specific',
                          p.parentPOId || '—',
                          p.isParent ? `Consolidated (${p.totalVendors || 1} Vendors)` : (p.vendorName || '—'),
                          p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—',
                          p.totalAmount ? p.totalAmount.toFixed(2) : '0.00',
                          p.status || 'Pending Approval',
                          p.requestedBy || 'Pharmacist'
                        ]);
                        const csvContent = [headers.join(','), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.setAttribute('href', url);
                        link.setAttribute('download', `purchase_orders_export_${new Date().toISOString().slice(0,10)}.csv`);
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        showToast('Exported all purchase orders to CSV!', 'success');
                      }}
                    >
                      📊 Export CSV
                    </button>
                    <button 
                      className="btn btn-primary"
                      style={{ padding: '8px 16px', fontSize: '12.5px', borderRadius: '8px', background: '#2563EB', border: 'none', color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                      onClick={() => {
                        if (activeVendors.length === 0) {
                          showToast('No Active vendors onboarded yet. Please onboard or approve a vendor first.', 'error');
                          return;
                        }
                        setPoDraftItems([{ name: '', sku: '', qty: 100, vendorId: '', vendorName: '', price: 0, tax: 12, total: 0, isLowest: true }]);
                        setShowCreatePOModal(true);
                      }}
                    >
                      <i data-lucide="plus" style={{ width: '16px' }}></i> Create Purchase Order
                    </button>
                  </div>
                </div>

                <div className="glass-card">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th>PO Number</th>
                          <th>Type / Origin</th>
                          <th>Supplier</th>
                          <th>Date</th>
                          <th>Total Amount</th>
                          <th>Status</th>
                          <th>Requested By</th>
                          <th style={{ textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchaseOrders.map(po => (
                          <tr key={po._id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{po.poId}</td>
                            <td>
                              {po.isParent ? (
                                <span style={{ background: '#EFF6FF', color: '#1D4ED8', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                                  🏢 Master PO ({po.totalVendors || po.vendorOrders?.length || 1} Vendors)
                                </span>
                              ) : po.parentPOId ? (
                                <span style={{ background: '#F1F5F9', color: '#475569', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                                  ↳ Split of {po.parentPOId}
                                </span>
                              ) : (
                                <span style={{ background: '#F8FAFC', color: '#64748B', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
                                  Direct PO
                                </span>
                              )}
                            </td>
                            <td style={{ fontWeight: 800, color: '#475569' }}>
                              {po.isParent ? `Multi-Vendor (${po.totalVendors || 1} Suppliers)` : (po.vendorName || '—')}
                            </td>
                            <td style={{ fontWeight: 600, color: '#64748B' }}>{new Date(po.createdAt || Date.now()).toLocaleDateString()}</td>
                            <td style={{ fontWeight: 800, color: '#0F172A' }}>₹{(po.totalAmount || 0).toFixed(2)}</td>
                            <td>
                              <span style={{ 
                                padding: '4px 10px', 
                                borderRadius: '6px', 
                                fontSize: '11px', 
                                fontWeight: 800,
                                background: po.status === 'Approved' ? '#DEF7EC' : (po.status === 'Rejected' ? '#FDE8E8' : (po.status === 'Partially Approved' ? '#E0E7FF' : '#FEF08A')),
                                color: po.status === 'Approved' ? '#03543F' : (po.status === 'Rejected' ? '#9B1C1C' : (po.status === 'Partially Approved' ? '#3730A3' : '#713F12'))
                              }}>
                                {po.status}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600, color: '#64748B' }}>{po.requestedBy || 'Pharmacist'}</td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                                {['Approved', 'Confirmed', 'Partially Received', 'Partially Delivered'].includes(po.status) && (
                                  <button 
                                    style={{ padding: '5px 10px', minWidth: '138px', height: '30px', fontSize: '11.5px', background: '#10B981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                                    onClick={() => {
                                      setEditingGrn(null);
                                      handleGrnPOSelection(po._id);
                                      setGrnFlowType('po');
                                      setProcurementSubTab('grn');
                                      setShowGRNModal(true);
                                    }}
                                    title={po.status === 'Partially Received' || po.status === 'Partially Delivered' ? 'Receive Remaining items against PO' : 'Receive PO delivery'}
                                  >
                                    📦 {po.status === 'Partially Received' || po.status === 'Partially Delivered' ? 'Receive Remaining' : 'Receive'}
                                  </button>
                                )}
                                <button 
                                  style={{ padding: '5px 10px', minWidth: '65px', height: '30px', fontSize: '11.5px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                                  onClick={() => printPO(po, currentUser?.tenantName || 'CUROXA HEALTHCARE')}
                                  title="Print / PDF"
                                >
                                  📄 PDF
                                </button>
                                <button 
                                  style={{ padding: '5px 10px', minWidth: '65px', height: '30px', fontSize: '11.5px', background: '#F8FAFC', color: '#334155', border: '1px solid #CBD5E1', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                                  onClick={() => handleExportPOToCSV(po)}
                                  title="Export CSV"
                                >
                                  📊 CSV
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {purchaseOrders.length === 0 && (
                          <tr>
                            <td colSpan="8" style={{ textAlign: 'center', padding: '28px', color: '#64748B' }}>No purchase orders created. Click "Create Purchase Order" above to begin.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* GOODS RECEIPTS (GRN) VIEW */}
            {procurementSubTab === 'grn' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1E293B', margin: 0 }}>Goods Receipt Notes (GRN)</h3>
                  <button 
                    className="btn btn-primary"
                    style={{ padding: '8px 16px', fontSize: '12.5px', borderRadius: '8px', background: '#2563EB', border: 'none', color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                    onClick={() => {
                      setEditingGrn(null);
                      setGrnFlowType('po');
                      setGrnSelectedPOId('');
                      setGrnDirectVendorId('');
                      setGrnItems([]);
                      setGrnInvoiceFile(null);
                      setGrnInvoiceFileName('');
                      setGrnNotes('');
                      setShowGRNModal(true);
                    }}
                  >
                    <i data-lucide="plus" style={{ width: '16px' }}></i> Create GRN
                  </button>
                </div>

                <div className="glass-card">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th>GRN ID</th>
                          <th>Reference PO</th>
                          <th>Supplier</th>
                          <th>Date</th>
                          <th>Items Received</th>
                          <th>Type</th>
                          <th>Invoice</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {goodsReceipts.map(grn => (
                          <tr key={grn._id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#059669' }}>{grn.grnId}</td>
                            <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#64748B' }}>{grn.poNumber || 'Direct Purchase'}</td>
                            <td style={{ fontWeight: 800, color: '#475569' }}>{grn.vendorName}</td>
                            <td style={{ fontWeight: 600, color: '#64748B' }}>{new Date(grn.receivedDate || grn.createdAt).toLocaleDateString()}</td>
                            <td style={{ fontWeight: 700, color: '#0F172A' }}>{grn.items.length} items</td>
                            <td>
                              <span style={{ 
                                padding: '4px 8px', 
                                borderRadius: '6px', 
                                fontSize: '11px', 
                                fontWeight: 800,
                                background: grn.poId ? '#E0F2FE' : '#F3F4F6',
                                color: grn.poId ? '#0369A1' : '#374151'
                              }}>
                                {grn.poId ? 'PO Filled' : 'Direct'}
                              </span>
                            </td>
                            <td>
                              {grn.invoiceUrl ? (
                                <a 
                                  href={grn.invoiceUrl} 
                                  download={`invoice-${grn.grnId}`} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  style={{ color: '#3B82F6', fontWeight: 800, textDecoration: 'underline', cursor: 'pointer' }}
                                >
                                  View Doc
                                </a>
                              ) : (
                                <span style={{ color: '#94A3B8' }}>—</span>
                              )}
                            </td>
                            <td>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 800,
                                background: grn.status === 'Draft' ? '#FEF3C7' : '#D1FAE5',
                                color: grn.status === 'Draft' ? '#D97706' : '#065F46'
                              }}>
                                {grn.status || 'Verified/Completed'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                <button 
                                  className="btn btn-secondary" 
                                  style={{ padding: '6px 12px', fontSize: '12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  onClick={() => setSelectedGrnDetails(grn)}
                                >
                                  View
                                </button>
                                {(() => {
                                  const ageMs = Date.now() - new Date(grn.createdAt || grn.receivedDate || Date.now()).getTime();
                                  const isEditable = ageMs <= 24 * 60 * 60 * 1000;
                                  return isEditable ? (
                                    <button 
                                      className="btn btn-primary" 
                                      style={{ padding: '6px 12px', fontSize: '12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#0EA5E9', border: 'none', color: 'white', borderRadius: '4px', fontWeight: 700 }}
                                      onClick={() => handleOpenEditGrn(grn)}
                                    >
                                      Edit
                                    </button>
                                  ) : (
                                    <button 
                                      className="btn btn-secondary" 
                                      style={{ padding: '6px 12px', fontSize: '12px', cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#F1F5F9', border: '1px solid #CBD5E1', color: '#94A3B8', borderRadius: '4px', fontWeight: 700 }}
                                      disabled
                                      title="Editing period expired (24 hours from creation)"
                                    >
                                      Expired
                                    </button>
                                  );
                                })()}
                                <button 
                                  style={{ padding: '6px 12px', fontSize: '12px', cursor: 'pointer', background: '#10B981', border: 'none', color: 'white', borderRadius: '4px', fontWeight: 700 }}
                                  onClick={() => printGRN(grn, currentUser?.tenantName || 'CUROXA HEALTHCARE')}
                                >
                                  📄 PDF
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {goodsReceipts.length === 0 && (
                          <tr>
                            <td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>No Goods Receipt Notes created yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* PROCUREMENT TICKETS VIEW */}
            {procurementSubTab === 'tickets' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1E293B', margin: 0 }}>Replenishment Tickets</h3>
                </div>

                <div className="glass-card">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Medicine</th>
                          <th>Recorded Stock</th>
                          <th>Status</th>
                          <th>Admin Comment</th>
                          <th>Pharmacy Reason</th>
                          <th style={{ textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pharmacyTickets.map(ticket => (
                          <tr key={ticket._id}>
                            <td style={{ fontWeight: 600, color: '#64748B' }}>{new Date(ticket.createdAt).toLocaleString()}</td>
                            <td style={{ fontWeight: 800, color: '#0F172A' }}>{ticket.medicineName}</td>
                            <td style={{ fontWeight: 700, color: '#EF4444' }}>{ticket.currentStock} units</td>
                            <td>
                              <span style={{ 
                                padding: '4px 8px', 
                                borderRadius: '6px', 
                                fontSize: '11px', 
                                fontWeight: 800,
                                background: ticket.status === 'Resolved' ? '#D1FAE5' : '#FEF3C7',
                                color: ticket.status === 'Resolved' ? '#065F46' : '#92400E'
                              }}>
                                {ticket.status}
                              </span>
                            </td>
                            <td style={{ color: '#475569', fontSize: '12px' }}>{ticket.adminComment}</td>
                            <td style={{ color: '#059669', fontSize: '12px', fontWeight: 600 }}>{ticket.pharmacyReason || <span style={{ color: '#94A3B8' }}>—</span>}</td>
                            <td style={{ textAlign: 'center' }}>
                              {ticket.status === 'Open' ? (
                                <button 
                                  className="btn btn-primary" 
                                  style={{ padding: '6px 12px', fontSize: '12px', cursor: 'pointer', background: '#D97706', border: 'none', color: 'white', fontWeight: 700, borderRadius: '6px' }}
                                  onClick={() => {
                                    setSelectedTicket(ticket);
                                    setTicketResolutionReason('');
                                    setShowResolveTicketModal(true);
                                  }}
                                >
                                  Resolve
                                </button>
                              ) : (
                                <span style={{ color: '#94A3B8', fontWeight: 600, fontSize: '12px' }}>Completed</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {pharmacyTickets.length === 0 && (
                          <tr>
                            <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>No replenishment tickets raised yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* CATALOG & MEDICINE APPROVAL REQUESTS VIEW */}
            {procurementSubTab === 'catalog-approvals' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1E293B', margin: 0 }}>Catalog Medicine Approvals</h3>
                    <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748B' }}>
                      Track live status of submitted vendor medicine additions and price authorizations.
                    </p>
                  </div>
                  <button 
                    className="btn btn-primary"
                    style={{ padding: '8px 16px', fontSize: '12.5px', borderRadius: '8px', background: '#2563EB', border: 'none', color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                    onClick={() => {
                      if (vendors.length > 0) {
                        setTargetVendorForMedicine(vendors[0]);
                        setNewMedApprovalData({ name: '', sku: '', price: '', gst: 12, available: true, mrp: '', comment: '' });
                        setShowAddMedicineApprovalModal(true);
                      } else {
                        showToast("Please add at least one vendor first.", "info");
                      }
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    + Propose New Medicine
                  </button>
                </div>

                <div className="glass-card" style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '0', overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="premium-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0' }}>
                          <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>REQUEST / MEDICINE</th>
                          <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TARGET VENDOR</th>
                          <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>WHOLESALE RATE</th>
                          <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>GST</th>
                          <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>REQUESTED ON</th>
                          <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>APPROVAL STATUS</th>
                          <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ADMIN REMARKS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catalogApprovalRequests.length > 0 ? (
                          catalogApprovalRequests.map(req => {
                            const isMedAddition = req.type === 'vendor_medicine_addition';
                            const med = req.details?.medicine || req.details || {};
                            const vendorName = req.details?.vendorName || (vendors.find(v => v._id === req.details?.vendorId)?.name) || 'Vendor';
                            const vendorCode = req.details?.vendorCode || (vendors.find(v => v._id === req.details?.vendorId)?.code) || '';
                            const isPending = (req.status || '').toLowerCase() === 'pending';
                            const isApproved = (req.status || '').toLowerCase() === 'approved';
                            const isRejected = (req.status || '').toLowerCase() === 'denied' || (req.status || '').toLowerCase() === 'rejected';

                            return (
                              <tr key={req._id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s' }}>
                                <td style={{ padding: '14px 18px' }}>
                                  <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0F172A' }}>
                                    {med.name || req.comment || 'Medicine Addition'}
                                  </div>
                                  {med.sku && (
                                    <div style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#2563EB', fontWeight: 700, marginTop: '2px' }}>
                                      SKU: {med.sku}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '14px 18px' }}>
                                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#1E293B' }}>{vendorName}</div>
                                  {vendorCode && <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748B' }}>({vendorCode})</span>}
                                </td>
                                <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>
                                  ₹{Number(med.price || 0).toFixed(2)}
                                </td>
                                <td style={{ padding: '14px 18px', fontWeight: 700, color: '#475569', fontSize: '13px' }}>
                                  {med.gst !== undefined ? `${med.gst}%` : '12%'}
                                </td>
                                <td style={{ padding: '14px 18px', color: '#64748B', fontSize: '12.5px', fontWeight: 500 }}>
                                  {req.createdAt ? new Date(req.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'}
                                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>by {req.requesterName || 'Pharmacist'}</div>
                                </td>
                                <td style={{ padding: '14px 18px' }}>
                                  {isPending && (
                                    <span style={{ 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '5px', 
                                      padding: '5px 11px', 
                                      borderRadius: '20px', 
                                      fontSize: '12px', 
                                      fontWeight: 800, 
                                      background: '#FFFBEB', 
                                      color: '#B45309', 
                                      border: '1px solid #FDE68A' 
                                    }}>
                                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F59E0B' }}></span>
                                      Pending Approval
                                    </span>
                                  )}
                                  {isApproved && (
                                    <span style={{ 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '5px', 
                                      padding: '5px 11px', 
                                      borderRadius: '20px', 
                                      fontSize: '12px', 
                                      fontWeight: 800, 
                                      background: '#ECFDF5', 
                                      color: '#047857', 
                                      border: '1px solid #A7F3D0' 
                                    }}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                      Approved & Active
                                    </span>
                                  )}
                                  {isRejected && (
                                    <span style={{ 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '5px', 
                                      padding: '5px 11px', 
                                      borderRadius: '20px', 
                                      fontSize: '12px', 
                                      fontWeight: 800, 
                                      background: '#FEF2F2', 
                                      color: '#B91C1C', 
                                      border: '1px solid #FECACA' 
                                    }}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                      Rejected
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: '14px 18px', fontSize: '12.5px', color: '#475569' }}>
                                  {req.rejectionReason ? (
                                    <span style={{ color: '#DC2626', fontWeight: 600 }}>Reason: {req.rejectionReason}</span>
                                  ) : req.comment ? (
                                    <span style={{ fontStyle: 'italic', color: '#64748B' }}>"{req.comment}"</span>
                                  ) : (
                                    <span style={{ color: '#94A3B8' }}>—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: '#64748B' }}>
                              <div style={{ fontSize: '14px', fontWeight: 600 }}>No catalog approval requests found.</div>
                              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>When you submit a medicine for approval, you can track its review progress right here.</div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: RECEPTIONIST DYNAMIC COVERAGE */}
        {activeTab === 'receptionist_cover' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>Receptionist Active Coverage</h2>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0, fontWeight: 600 }}>Emergency Front Desk Duty Coverage. Manage patients queue, register new OPD visits and clear billing logs.</p>
              </div>
              <span className="badge-pill new" style={{ background: '#FFE4E6', color: '#E11D48', padding: '6px 12px', fontSize: '11px', fontWeight: 800 }}>
                ● Active Receptionist Coverage
              </span>
            </div>

            {/* Sub-navigation inside coverage */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '24px' }}>
              {coverageState['rc-queue']?.on && (
                <button 
                  type="button"
                  className={`btn-view-detail ${receptionistSubTab === 'queue' ? 'active' : ''}`}
                  onClick={() => setReceptionistSubTab('queue')}
                  style={{ background: receptionistSubTab === 'queue' ? '#E11D48' : 'transparent', color: receptionistSubTab === 'queue' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Token Queue
                </button>
              )}
              {coverageState['rc-appt']?.on && (
                <button 
                  type="button"
                  className={`btn-view-detail ${receptionistSubTab === 'appt' ? 'active' : ''}`}
                  onClick={() => setReceptionistSubTab('appt')}
                  style={{ background: receptionistSubTab === 'appt' ? '#E11D48' : 'transparent', color: receptionistSubTab === 'appt' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Appointments
                </button>
              )}
              {coverageState['rc-register']?.on && (
                <button 
                  type="button"
                  className={`btn-view-detail ${receptionistSubTab === 'register' ? 'active' : ''}`}
                  onClick={() => setReceptionistSubTab('register')}
                  style={{ background: receptionistSubTab === 'register' ? '#E11D48' : 'transparent', color: receptionistSubTab === 'register' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  OPD Registration
                </button>
              )}
              {coverageState['rc-billing']?.on && (
                <button 
                  type="button"
                  className={`btn-view-detail ${receptionistSubTab === 'billing' ? 'active' : ''}`}
                  onClick={() => setReceptionistSubTab('billing')}
                  style={{ background: receptionistSubTab === 'billing' ? '#E11D48' : 'transparent', color: receptionistSubTab === 'billing' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Billing Ledger
                </button>
              )}
            </div>

            {/* SUBTAB: TOKEN QUEUE */}
            {receptionistSubTab === 'queue' && (
              <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>OPD Daily Token Roster</h3>
                  <button 
                    type="button"
                    className="btn-cover-action receptionist-primary"
                    onClick={() => {
                      showToast("Calling Next Patient in Token Queue!");
                    }}
                  >
                    Call Next Token
                  </button>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>TOKEN NO</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>PATIENT</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>STATUS</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>CHECK-IN TIME</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800, textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverageQueue.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '16px 8px', fontWeight: 800, color: '#2563EB', fontSize: '13px' }}>{item.token}</td>
                        <td style={{ padding: '16px 8px', fontWeight: 700, color: '#1E293B', fontSize: '13.5px' }}>{item.patient}</td>
                        <td style={{ padding: '16px 8px' }}>
                          <span className={`badge-pill ${item.status === 'Waiting' ? 'waiting' : 'new'}`} style={{ fontSize: '10px' }}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ padding: '16px 8px', color: '#64748B', fontSize: '12.5px', fontWeight: 600 }}>{item.time}</td>
                        <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                          {item.status !== 'Completed' ? (
                            <button 
                              type="button"
                              className="btn-cover-action receptionist-primary"
                              onClick={async () => {
                                try {
                                  await api.put(`/appointments/${item.id}`, { status: 'Completed' });
                                  showToast(`Token ${item.token} marked as Completed!`);
                                  fetchCoverageData();
                                } catch (e) {
                                  showToast('Failed to update appointment status.');
                                }
                              }}
                            >
                              Mark Completed
                            </button>
                          ) : (
                            <span style={{ fontSize: '12px', color: '#059669', fontWeight: 700 }}>Completed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* SUBTAB: APPOINTMENT */}
            {receptionistSubTab === 'appt' && (
              <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
                <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '20px' }}>Scheduled Slots</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {coverageAppts.map(app => (
                      <div key={app.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', border: '1px solid #F1F5F9', borderRadius: '12px' }}>
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', display: 'block' }}>{app.slot}</span>
                          <span style={{ fontSize: '14px', fontWeight: 750, color: '#1E293B' }}>{app.patient}</span>
                          <span style={{ fontSize: '11px', color: '#64748B', display: 'block', fontWeight: 600 }}>{app.contact}</span>
                        </div>
                        <span className="badge-pill new" style={{ fontSize: '10px' }}>{app.status}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '20px' }}>Book Appointment Slot</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const patientId = selectedPatForCoverAppt;
                    const doctorId = selectedDocForCoverAppt;
                    const slot = selectedSlotForCoverAppt;
                    const reason = e.target.elements.patReason.value || 'General Consultation';
                    if (!patientId || !doctorId) {
                      showToast("Please select a patient and a doctor");
                      return;
                    }
                    
                    try {
                      await api.post('/appointments', {
                        patientId,
                        doctorId,
                        date: new Date(),
                        time: slot,
                        reason
                      });
                      
                      const docObj = coverageDoctors.find(d => String(d._id) === String(doctorId));
                      const docFee = docObj ? (docObj.consultationFee !== undefined ? docObj.consultationFee : 500) : 500;
                      await api.post('/billing', {
                        patientId,
                        items: [
                          { description: 'OPD Consultation Fee', amount: docFee },
                          { description: 'Registration Fee', amount: 50 }
                        ],
                        totalAmount: docFee + 50,
                        paymentMethod: 'Cash'
                      });

                      showToast(`Appointment booked successfully!`);
                      e.target.reset();
                      setSelectedPatForCoverAppt('');
                      setSelectedDocForCoverAppt('');
                      setSelectedSlotForCoverAppt('09:30 AM');
                      fetchCoverageData();
                    } catch (err) {
                      showToast('Failed to book appointment.');
                    }
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Select Patient</label>
                        <SearchableDropdown
                          value={selectedPatForCoverAppt}
                          onChange={setSelectedPatForCoverAppt}
                          options={patients.map(p => ({ value: p._id, label: `${p.name} (${p.uhid || 'No UHID'})` }))}
                          placeholder="Choose Patient..."
                        />
                      </div>
                      
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Assign Doctor</label>
                        <SearchableDropdown
                          value={selectedDocForCoverAppt}
                          onChange={setSelectedDocForCoverAppt}
                          options={coverageDoctors.map(doc => ({ value: doc._id, label: `${doc.name} (${doc.specialty || 'General'})` }))}
                          placeholder="Choose Doctor..."
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Time Slot</label>
                        <SearchableDropdown
                          value={selectedSlotForCoverAppt}
                          onChange={setSelectedSlotForCoverAppt}
                          options={[
                            { value: '09:30 AM', label: '09:30 AM' },
                            { value: '10:30 AM', label: '10:30 AM' },
                            { value: '12:00 PM', label: '12:00 PM' },
                            { value: '03:30 PM', label: '03:30 PM' },
                            { value: '04:30 PM', label: '04:30 PM' }
                          ]}
                          placeholder="Select Time Slot..."
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Reason for Visit</label>
                        <input type="text" name="patReason" style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontWeight: 650, outline: 'none' }} placeholder="e.g. Cough and Fever" />
                      </div>

                      <button type="submit" className="btn-cover-action receptionist-primary" style={{ width: '100%', height: '44px', marginTop: '8px' }}>
                        Book Appointment
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* SUBTAB: REGISTRATION */}
            {receptionistSubTab === 'register' && (
              <div className="glass-card" style={{ padding: '32px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', maxWidth: '600px', margin: '0 auto' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>OPD Patient Registration</h3>
                <p style={{ fontSize: '12.5px', color: '#64748B', marginBottom: '24px', fontWeight: 600 }}>Create standard EMR clinical records for new OPD patients.</p>
                
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const name = e.target.elements.regName.value;
                  const phone = e.target.elements.regPhone.value;
                  const age = e.target.elements.regAge.value;
                  const gender = selectedRegGender;
                  const address = e.target.elements.regAddress.value;
                  if (!name || !phone) return;
                  
                  try {
                    await api.post('/patients', {
                      name,
                      contact: phone,
                      age,
                      gender,
                      address
                    });
                    showToast(`Patient "${name}" registered successfully!`);
                    e.target.reset();
                    setSelectedRegGender('Female');
                    fetchCoverageData();
                  } catch (err) {
                    showToast('Failed to register patient.');
                  }
                }}>
                  <div className="mobile-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Full Name</label>
                      <input type="text" name="regName" style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontWeight: 650, outline: 'none' }} required placeholder="e.g. Priya Nair" />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Mobile Phone</label>
                      <input type="tel" name="regPhone" style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontWeight: 650, outline: 'none' }} required placeholder="e.g. +91 91122 33445" />
                    </div>
                  </div>

                  <div className="mobile-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Age (Years)</label>
                      <input type="number" name="regAge" style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontWeight: 650, outline: 'none' }} defaultValue="28" required />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Gender</label>
                      <SearchableDropdown
                        value={selectedRegGender}
                        onChange={setSelectedRegGender}
                        options={[
                          { value: 'Female', label: 'Female' },
                          { value: 'Male', label: 'Male' },
                          { value: 'Other', label: 'Other' }
                        ]}
                        placeholder="Select Gender..."
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Residential Address</label>
                    <textarea name="regAddress" style={{ width: '100%', height: '70px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', fontWeight: 650, outline: 'none', resize: 'none' }} placeholder="e.g. Sector-14, DLF Phase 1, Gurgaon" defaultValue="" />
                  </div>

                  <button type="submit" className="btn-cover-action receptionist-primary" style={{ width: '100%', height: '46px' }}>
                    Register & Open EMR Account
                  </button>
                </form>
              </div>
            )}

            {/* SUBTAB: BILLING */}
            {receptionistSubTab === 'billing' && (
              <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '20px' }}>OPD Billing Clearance Ledger</h3>
                
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>BILL ID</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>PATIENT</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>SERVICE</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>AMOUNT</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>STATUS</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800, textAlign: 'right' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverageBills.map(bill => (
                      <tr key={bill.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '16px 8px', fontWeight: 800, color: '#475569', fontSize: '12.5px' }}>#{bill.id}</td>
                        <td style={{ padding: '16px 8px', fontWeight: 700, color: '#1E293B', fontSize: '13.5px' }}>{bill.name}</td>
                        <td style={{ padding: '16px 8px', color: '#475569', fontSize: '13px', fontWeight: 600 }}>{bill.service}</td>
                        <td style={{ padding: '16px 8px', fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>₹{bill.amount}</td>
                        <td style={{ padding: '16px 8px' }}>
                          <span className={`badge-pill ${bill.paid ? 'new' : 'waiting'}`} style={{ fontSize: '10px' }}>
                            {bill.paid ? 'Paid' : 'Unpaid'}
                          </span>
                        </td>
                        <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                          {!bill.paid ? (
                            <button 
                              type="button"
                              className="btn-cover-action receptionist-primary"
                              onClick={async () => {
                                try {
                                  await api.put(`/billing/${bill.id}`, { status: 'Paid' });
                                  showToast(`Payment ₹${bill.amount} collected for ${bill.name}!`);
                                  fetchCoverageData();
                                } catch (e) {
                                  showToast('Failed to clear bill.');
                                }
                              }}
                            >
                              Collect Fee
                            </button>
                          ) : (
                            <button 
                              type="button"
                              className="btn-cover-action receptionist-primary"
                              style={{ background: 'transparent', border: '1px solid #E2E8F0', color: '#64748B' }}
                              onClick={() => showToast("Re-printing duplicate receipt...")}
                            >
                              Print Receipt
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: LAB DYNAMIC COVERAGE */}
        {activeTab === 'lab_cover' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>Laboratory Active Coverage</h2>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0, fontWeight: 600 }}>Providing emergency clinical oversight for Diagnostic Lab. All report signing logged.</p>
              </div>
              <span className="badge-pill new" style={{ background: '#D1FAE5', color: '#059669', padding: '6px 12px', fontSize: '11px', fontWeight: 800 }}>
                ● Clinical Lab Coverage
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '24px' }}>
              {coverageState['lt-queue']?.on && (
                <button 
                  type="button"
                  className={`btn-view-detail ${labSubTab === 'tests' ? 'active' : ''}`}
                  onClick={() => setLabSubTab('tests')}
                  style={{ background: labSubTab === 'tests' ? '#059669' : 'transparent', color: labSubTab === 'tests' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Emergency Test Orders
                </button>
              )}
              {coverageState['lt-reagents']?.on && (
                <button 
                  type="button"
                  className={`btn-view-detail ${labSubTab === 'reagents' ? 'active' : ''}`}
                  onClick={() => setLabSubTab('reagents')}
                  style={{ background: labSubTab === 'reagents' ? '#059669' : 'transparent', color: labSubTab === 'reagents' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Reagents & Kits Inventory
                </button>
              )}
            </div>

            {/* SUBTAB: TESTS QUEUE */}
            {labSubTab === 'tests' && (
              <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '20px' }}>Diagnostic Test Orders Queue</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {coverageLabRequests.map(test => (
                    <div key={test.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid #F1F5F9', borderRadius: '12px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>{test.name}</span>
                          <span className={`badge-pill ${test.priority === 'High' ? 'revisit' : 'new'}`} style={{ fontSize: '9px', padding: '2px 6px' }}>{test.priority} Priority</span>
                        </div>
                        <span style={{ fontSize: '12.5px', color: '#475569', fontWeight: 600, display: 'block', marginTop: '4px' }}>Test: <b>{test.test}</b></span>
                        <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 550 }}>Order ID: #{test.id} · Status: {test.status}</span>
                      </div>
                      {test.status === 'Pending' ? (
                        <button 
                          type="button"
                          className="btn-cover-action lab-primary"
                          style={{ background: '#2563EB', borderColor: '#2563EB' }}
                          onClick={async () => {
                            try {
                              await api.put(`/labs/${test.id}`, {
                                status: 'In Progress',
                                notes: 'Specimen sample collected by delegated clinical coverage.'
                              });
                              showToast(`Sample collected successfully for ${test.name}!`);
                              fetchCoverageData();
                            } catch (e) {
                              showToast('Failed to update sample status.');
                            }
                          }}
                        >
                          Collect Sample
                        </button>
                      ) : test.status === 'In Progress' ? (
                        <button 
                          type="button"
                          className="btn-cover-action lab-primary"
                          onClick={() => {
                            setSelectedCoverageLabTest(test);
                            setCoverageLabRemarks('');
                            setCoverageLabParams({ value: '', unit: 'g/dL' });
                            setCoverageLabFileName('');
                            setShowCoverageLabModal(true);
                          }}
                        >
                          Enter Results
                        </button>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', color: '#059669', fontWeight: 700 }}>Signed & Dispatched</span>
                          <button 
                            type="button"
                            className="btn-cover-action lab-primary"
                            style={{ background: '#475569', color: 'white', padding: '4px 10px', fontSize: '11px' }}
                            onClick={() => {
                              setSelectedCoverageLabTest(test);
                              setShowCoverageLabDetailsModal(true);
                            }}
                          >
                            View Report
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUBTAB: REAGENTS */}
            {labSubTab === 'reagents' && (
              <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '20px' }}>Diagnostic Reagents Ledger</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>REAGENT NAME</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>STOCK LEVEL</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>MIN SAFE STOCK</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>STATUS</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800, textAlign: 'right' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverageReagents.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '16px 8px', fontWeight: 700, color: '#1E293B', fontSize: '13.5px' }}>{item.name}</td>
                        <td style={{ padding: '16px 8px', fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>{item.level} {item.unit}</td>
                        <td style={{ padding: '16px 8px', color: '#64748B', fontSize: '13px', fontWeight: 600 }}>{item.minSafe} {item.unit}</td>
                        <td style={{ padding: '16px 8px' }}>
                          <span className={`badge-pill ${item.status === 'Safe' ? 'new' : 'waiting'}`} style={{ fontSize: '10px' }}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                          <button 
                            type="button"
                            className="btn-cover-action lab-primary"
                            onClick={async () => {
                              try {
                                await api.put(`/lab-inventory/${item.id}`, {
                                  isRestock: true,
                                  addQty: 50
                                });
                                showToast(`Emergency restock order issued for ${item.name}!`);
                                fetchCoverageData();
                              } catch (e) {
                                showToast('Failed to restock reagent.');
                              }
                            }}
                          >
                            Restock +50
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Log Return Modal */}
      {showLogReturnModal && (
        <div className="modal-overlay" data-lenis-prevent onClick={() => { setShowLogReturnModal(false); setIsRxDropdownOpen(false); }}>
          <div className="modal-box glass-card" style={{ width: '90%', maxWidth: '750px', maxHeight: '90vh', background: 'white', padding: '28px 28px 20px', borderRadius: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.15)', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => { e.stopPropagation(); setIsRxDropdownOpen(false); }}>
            <style>{`
              .modal-scroll-body::-webkit-scrollbar {
                width: 6px;
              }
              .modal-scroll-body::-webkit-scrollbar-track {
                background: transparent;
              }
              .modal-scroll-body::-webkit-scrollbar-thumb {
                background: #CBD5E1;
                border-radius: 3px;
              }
              .modal-scroll-body::-webkit-scrollbar-thumb:hover {
                background: #94A3B8;
              }
            `}</style>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
              <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#1A1D23', margin: 0 }}>
                Log Medication Return
              </h2>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} onClick={() => { setShowLogReturnModal(false); setIsRxDropdownOpen(false); }}>
                <i data-lucide="x" style={{ width: '20px', height: '20px' }}></i>
              </button>
            </div>

            <form onSubmit={handleSaveReturnLog} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="modal-scroll-body" data-lenis-prevent style={{ overflowY: 'auto', flex: 1, paddingRight: '8px', marginBottom: '16px', display: 'flex', flexDirection: 'column' }}>
                
                {/* Return Type Toggle */}
                <div style={{ display: 'flex', gap: '8px', background: '#F1F5F9', padding: '4px', borderRadius: '10px', marginBottom: '20px' }}>
                  <button 
                    type="button"
                    onClick={() => { setReturnType('Prescription-Linked'); setReturnItems([{ medicineName: '', quantity: 1, unitPrice: 0, reason: 'Doctor changed medication', action: 'Restocked' }]); setReturnPatientName(''); setReturnPatientPhone(''); setRxSearchQuery(''); setIsRxDropdownOpen(false); }}
                    style={{ flex: 1, padding: '10px', fontSize: '13px', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', background: returnType === 'Prescription-Linked' ? 'white' : 'transparent', color: returnType === 'Prescription-Linked' ? '#2563EB' : '#64748B', boxShadow: returnType === 'Prescription-Linked' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                  >
                    Hospital Prescription
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setReturnType('Walk-in / Offline'); setReturnItems([{ medicineName: '', quantity: 1, unitPrice: 0, reason: 'Doctor changed medication', action: 'Restocked' }]); setReturnPatientName(''); setReturnPatientPhone(''); setRxSearchQuery(''); setIsRxDropdownOpen(false); }}
                    style={{ flex: 1, padding: '10px', fontSize: '13px', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', background: returnType === 'Walk-in / Offline' ? 'white' : 'transparent', color: returnType === 'Walk-in / Offline' ? '#2563EB' : '#64748B', boxShadow: returnType === 'Walk-in / Offline' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                  >
                    Walk-in / Offline Sale
                  </button>
                </div>

                {returnType === 'Prescription-Linked' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                      <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>Select Dispensed Prescription</label>
                      <div style={{ position: 'relative' }}>
                        <input 
                          type="text"
                          placeholder="Search prescription by patient name or RX code..."
                          value={rxSearchQuery}
                          onFocus={() => setIsRxDropdownOpen(true)}
                          onChange={(e) => { setRxSearchQuery(e.target.value); setIsRxDropdownOpen(true); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const filtered = dispensedPrescriptions.filter(p => {
                                const rxCode = `RX-${p._id.substring(p._id.length - 6).toUpperCase()}`;
                                const name = (p.patientId?.name || '').toLowerCase();
                                const query = rxSearchQuery.toLowerCase().trim();
                                return rxCode.toLowerCase().includes(query) || name.includes(query);
                              });
                              if (filtered.length > 0) {
                                const p = filtered[0];
                                const rxCode = `RX-${p._id.substring(p._id.length - 6).toUpperCase()}`;
                                const formattedDate = new Date(p.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
                                handleSelectPrescriptionForReturn(p._id);
                                setRxSearchQuery(`${rxCode} - ${p.patientId?.name || 'Unknown Patient'} (${formattedDate})`);
                                setIsRxDropdownOpen(false);
                              }
                            }
                          }}
                          style={{ width: '100%', padding: '10px 36px 10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', fontSize: '13.5px', fontWeight: 600, color: '#334155', background: 'white' }}
                        />
                        <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        </span>
                        {rxSearchQuery && (
                          <button 
                            type="button" 
                            onClick={() => {
                              setRxSearchQuery('');
                              setReturnPrescriptionId('');
                              setReturnPrescriptionCode('');
                              setReturnPatientName('');
                              setReturnPatientPhone('');
                              setReturnItems([{ medicineName: '', quantity: 1, unitPrice: 0, reason: 'Doctor changed medication', action: 'Restocked' }]);
                            }}
                            style={{ position: 'absolute', right: '32px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex', alignItems: 'center', padding: 0 }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        )}
                      </div>

                      {/* Dropdown Suggestions List */}
                      {isRxDropdownOpen && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'white', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: '220px', overflowY: 'auto', padding: '6px' }}>
                          {(() => {
                            const filtered = dispensedPrescriptions.filter(p => {
                              const rxCode = `RX-${p._id.substring(p._id.length - 6).toUpperCase()}`;
                              const name = (p.patientId?.name || '').toLowerCase();
                              const query = rxSearchQuery.toLowerCase().trim();
                              return rxCode.toLowerCase().includes(query) || name.includes(query);
                            });

                            if (filtered.length === 0) {
                              return (
                                <div style={{ padding: '12px', textAlign: 'center', fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>
                                  No dispensed prescriptions found
                                </div>
                              );
                            }

                            return filtered.map(p => {
                              const rxCode = `RX-${p._id.substring(p._id.length - 6).toUpperCase()}`;
                              const formattedDate = new Date(p.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
                              const isSelected = p._id === returnPrescriptionId;
                              
                              return (
                                <button
                                  key={p._id}
                                  type="button"
                                  onClick={() => {
                                    handleSelectPrescriptionForReturn(p._id);
                                    setRxSearchQuery(`${rxCode} - ${p.patientId?.name || 'Unknown Patient'} (${formattedDate})`);
                                    setIsRxDropdownOpen(false);
                                  }}
                                  style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '8px', border: 'none', background: isSelected ? '#EFF6FF' : 'transparent', textAlign: 'left', cursor: 'pointer', marginBottom: '2px', transition: 'all 0.15s' }}
                                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#F8FAFC'; }}
                                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: isSelected ? '#2563EB' : '#1E293B' }}>{rxCode}</span>
                                    <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>{formattedDate}</span>
                                  </div>
                                  <div style={{ fontSize: '12.5px', fontWeight: 650, color: '#475569', marginTop: '2px' }}>
                                    Patient: <span style={{ fontWeight: 750, color: '#0F172A' }}>{p.patientId?.name || 'Unknown Patient'}</span>
                                  </div>
                                </button>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>

                    {returnPrescriptionId && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>Patient Name</label>
                          <input type="text" readOnly value={returnPatientName} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '13px', fontWeight: 600, color: '#64748B' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>Contact Number</label>
                          <input type="text" readOnly value={returnPatientPhone} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '13px', fontWeight: 600, color: '#64748B' }} />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    <div>
                      <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>Patient Name *</label>
                      <input 
                        type="text" 
                        required
                        value={returnPatientName} 
                        onChange={(e) => setReturnPatientName(e.target.value)} 
                        placeholder="Enter patient name"
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', fontWeight: 600, color: '#334155' }} 
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>Contact Number</label>
                      <input 
                        type="text" 
                        value={returnPatientPhone} 
                        onChange={(e) => setReturnPatientPhone(e.target.value)} 
                        placeholder="Enter phone number"
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', fontWeight: 600, color: '#334155' }} 
                      />
                    </div>
                  </div>
                )}

                {/* Medicines List to Return */}
                <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B', marginBottom: '12px', marginTop: '10px' }}>Medicines to Return</h4>
                
                {/* Column Headers */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: returnType === 'Prescription-Linked' ? '40px 1.5fr 80px 100px 1.2fr 100px' : '2fr 80px 100px 1.2fr 100px 40px', 
                  gap: '10px', 
                  padding: '0 12px',
                  marginBottom: '8px',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  {returnType === 'Prescription-Linked' ? (
                    <>
                      <div style={{ textAlign: 'center' }}>Ret?</div>
                      <div>Medicine Name</div>
                      <div style={{ textAlign: 'center' }}>Qty</div>
                      <div style={{ textAlign: 'center' }}>Price (₹)</div>
                      <div>Reason</div>
                      <div>Action</div>
                    </>
                  ) : (
                    <>
                      <div>Medicine Name</div>
                      <div style={{ textAlign: 'center' }}>Qty</div>
                      <div style={{ textAlign: 'center' }}>Price (₹)</div>
                      <div>Reason</div>
                      <div>Action</div>
                      <div></div>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {returnItems.map((item, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: returnType === 'Prescription-Linked' ? '40px 1.5fr 80px 100px 1.2fr 100px' : '2fr 80px 100px 1.2fr 100px 40px', gap: '10px', alignItems: 'center', background: '#F8FAFC', padding: '12px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                      
                      {returnType === 'Prescription-Linked' && (
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={!!item.included} 
                            onChange={(e) => {
                              const updated = [...returnItems];
                              updated[idx].included = e.target.checked;
                              setReturnItems(updated);
                            }}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                        </div>
                      )}

                      {returnType === 'Prescription-Linked' ? (
                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155', wordBreak: 'break-word' }}>
                          {item.medicineName}
                        </div>
                      ) : (
                        <SearchableDropdown
                          value={item.medicineName}
                          onChange={(val) => handleOfflineMedicineChange(idx, val)}
                          options={inventory.map(inv => ({ value: inv.name, label: `${inv.name} (₹${inv.mrp.toFixed(2)})` }))}
                          placeholder="Select Medicine..."
                        />
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                        <input 
                          type="number"
                          min={1}
                          max={returnType === 'Prescription-Linked' ? item.maxQuantity : undefined}
                          value={item.quantity}
                          onChange={(e) => {
                            const updated = [...returnItems];
                            updated[idx].quantity = Math.max(1, Number(e.target.value) || 1);
                            if (returnType === 'Prescription-Linked' && item.maxQuantity && updated[idx].quantity > item.maxQuantity) {
                              updated[idx].quantity = item.maxQuantity;
                            }
                            setReturnItems(updated);
                          }}
                          style={{ width: '100%', height: '38px', padding: '8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', fontWeight: 600, textAlign: 'center' }}
                        />
                        {returnType === 'Prescription-Linked' && (
                          <div style={{ fontSize: '10px', color: '#94A3B8', textAlign: 'center', marginTop: '2px', fontWeight: 700 }}>Max: {item.maxQuantity}</div>
                        )}
                      </div>

                      <div style={{ width: '100%' }}>
                        <input 
                          type="number"
                          step="0.01"
                          readOnly={returnType === 'Prescription-Linked'}
                          value={item.unitPrice}
                          onChange={(e) => {
                            const updated = [...returnItems];
                            updated[idx].unitPrice = Number(e.target.value) || 0;
                            setReturnItems(updated);
                          }}
                          style={{ width: '100%', height: '38px', padding: '8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', fontWeight: 600, textAlign: 'center', background: returnType === 'Prescription-Linked' ? '#F1F5F9' : 'white' }}
                        />
                      </div>

                      <div style={{ width: '100%' }}>
                        <SearchableDropdown
                          value={item.reason}
                          onChange={(val) => {
                            const updated = [...returnItems];
                            updated[idx].reason = val;
                            setReturnItems(updated);
                          }}
                          options={[
                            { value: 'Doctor changed medication', label: 'Doctor changed med' },
                            { value: 'Wrong item purchased', label: 'Wrong item purchased' },
                            { value: 'Defective/Expired batch', label: 'Defective/Expired batch' },
                            { value: 'Excess quantity', label: 'Excess quantity' },
                            { value: 'Other', label: 'Other' }
                          ]}
                          placeholder="Select Reason"
                        />
                      </div>

                      <div style={{ width: '100%' }}>
                        <SearchableDropdown
                          value={item.action}
                          onChange={(val) => {
                            const updated = [...returnItems];
                            updated[idx].action = val;
                            setReturnItems(updated);
                          }}
                          options={[
                            { value: 'Restocked', label: 'Restock' },
                            { value: 'Discarded', label: 'Discard' }
                          ]}
                          placeholder="Select Action"
                        />
                      </div>

                      {returnType === 'Walk-in / Offline' && (
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <button
                            type="button"
                            disabled={returnItems.length <= 1}
                            onClick={() => {
                              if (returnItems.length > 1) {
                                setReturnItems(returnItems.filter((_, i) => i !== idx));
                              }
                            }}
                            style={{ background: 'none', border: 'none', cursor: returnItems.length <= 1 ? 'not-allowed' : 'pointer', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                          </button>
                        </div>
                      )}

                    </div>
                  ))}
                </div>

                {returnType === 'Walk-in / Offline' && (
                  <button
                    type="button"
                    onClick={handleAddOfflineReturnItem}
                    style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#F1F5F9', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#2563EB', cursor: 'pointer' }}
                  >
                    <i data-lucide="plus" style={{ width: '16px' }}></i> Add Medicine Row
                  </button>
                )}

                <div style={{ background: '#EFF6FF', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1D4ED8' }}>Estimated Total Refund</span>
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#2563EB', fontWeight: 600 }}>Refund will be processed back to original source.</p>
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#1D4ED8' }}>
                    ₹{returnItems.reduce((acc, curr) => {
                      if (returnType === 'Prescription-Linked' && !curr.included) return acc;
                      if (returnType === 'Walk-in / Offline' && !curr.medicineName) return acc;
                      return acc + (Number(curr.quantity) || 0) * (Number(curr.unitPrice) || 0);
                    }, 0).toFixed(2)}
                  </div>
                </div>

              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexShrink: 0, borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
                <button type="button" className="btn btn-secondary" style={{ padding: '10px 20px', border: '1px solid #CBD5E1', background: 'transparent', color: '#64748B', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }} onClick={() => setShowLogReturnModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ padding: '10px 24px', background: '#2563EB', border: 'none', color: 'white', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                  Confirm Return & Restock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified Manage Medicine Modal */}
      {showMedicineModal && (
        <div className="modal-overlay" data-lenis-prevent onClick={() => setShowMedicineModal(false)}>
          <div className="modal-box glass-card" style={{ width: '90%', maxWidth: '500px', maxHeight: '90vh', background: 'white', padding: '28px 28px 20px', borderRadius: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.15)', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <style>{`
              .modal-scroll-body::-webkit-scrollbar {
                width: 6px;
              }
              .modal-scroll-body::-webkit-scrollbar-track {
                background: transparent;
              }
              .modal-scroll-body::-webkit-scrollbar-thumb {
                background: #CBD5E1;
                border-radius: 3px;
              }
              .modal-scroll-body::-webkit-scrollbar-thumb:hover {
                background: #94A3B8;
              }
            `}</style>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
              <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#1A1D23', margin: 0 }}>
                {modalMode === 'add' ? 'Add New Medicine' : modalMode === 'restock' ? 'Restock Medicine' : 'Edit Medicine Details'}
              </h2>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} onClick={() => setShowMedicineModal(false)}>
                <i data-lucide="x" style={{ width: '20px', height: '20px' }}></i>
              </button>
            </div>

            <form onSubmit={handleSaveMedicine} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {/* Scrollable Form Fields Body */}
              <div className="modal-scroll-body" data-lenis-prevent style={{ overflowY: 'auto', flex: 1, paddingRight: '8px', marginBottom: '16px', display: 'flex', flexDirection: 'column' }}>
                {modalMode !== 'restock' ? (
                <>
                  {/* Premium Scanner Toolbar */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
                    <button 
                      type="button" 
                      onClick={isWebcamScanning ? stopWebcamScanner : startWebcamScanner} 
                      style={{ 
                        flex: 1, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '8px', 
                        height: '42px', 
                        borderRadius: '10px', 
                        border: '1px solid #E2E8F0', 
                        background: isWebcamScanning ? '#FFF1F2' : '#F0F9FF', 
                        color: isWebcamScanning ? '#E11D48' : '#0284C7', 
                        fontWeight: 700, 
                        fontSize: '12.5px', 
                        cursor: 'pointer', 
                        transition: 'all 0.2s' 
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                      {isWebcamScanning ? 'Stop Camera Scanning' : 'Scan with Webcam'}
                    </button>
                  </div>

                  {/* Live Webcam Scanner Reader Viewport */}
                  {isWebcamScanning && (
                    <div style={{ marginBottom: '16px', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', background: '#F8FAFC', flexShrink: 0 }}>
                      <style>{`
                        @keyframes scanLineMove {
                          0% { top: 25%; }
                          50% { top: 75%; }
                          100% { top: 25%; }
                        }
                      `}</style>
                      <div style={{ padding: '8px 12px', background: '#F1F5F9', fontSize: '11px', fontWeight: 700, color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Webcam Barcode Scan View</span>
                        <span style={{ color: '#EF4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#EF4444', display: 'inline-block', animation: 'pulse 1s infinite' }}></span> Active Camera
                        </span>
                      </div>
                      {/* Resilient video track container wrapper */}
                      <div style={{ width: '100%', minHeight: '220px', background: '#000', position: 'relative' }}>
                        {/* Pure mount container for html5-qrcode video track */}
                        <div id="barcode-webcam-reader" style={{ width: '100%' }}></div>
                        
                        {/* Glowing red laser scanning animation line overlays cleanly on top */}
                        <div style={{
                          position: 'absolute',
                          top: '50%',
                          left: '10%',
                          width: '80%',
                          height: '2px',
                          background: '#EF4444',
                          boxShadow: '0 0 10px #EF4444, 0 0 4px #EF4444',
                          zIndex: 10,
                          pointerEvents: 'none',
                          animation: 'scanLineMove 2.2s infinite ease-in-out'
                        }}></div>
                      </div>
                    </div>
                  )}
                  {/* Debug status bar */}
                  {scanDebugLog && (
                    <div style={{ padding: '8px 12px', marginBottom: '12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', fontSize: '11px', fontWeight: 600, color: '#92400E', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      🔬 {scanDebugLog}
                    </div>
                  )}

                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: '#64748B' }}>Medicine Name</label>
                    <input type="text" className="form-control" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required style={{ width: '100%', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '13px', outline: 'none' }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div className="form-group">
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: '#64748B' }}>Category</label>
                      <SearchableDropdown
                        value={formData.category}
                        onChange={(val) => setFormData({...formData, category: val})}
                        options={[
                          { value: 'Pain Relief', label: 'Pain Relief' },
                          { value: 'Antibiotic', label: 'Antibiotic' },
                          { value: 'Anti-Allergic', label: 'Anti-Allergic' },
                          { value: 'Antacid', label: 'Antacid' },
                          { value: 'Cough Syrup', label: 'Cough Syrup' },
                          { value: 'Vitamins', label: 'Vitamins' }
                        ]}
                        placeholder="Select Category"
                      />
                    </div>

                    <div className="form-group">
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: '#64748B' }}>SKU Code (or scan physical gun)</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={formData.sku} 
                        onChange={e => setFormData({...formData, sku: e.target.value})} 
                        onKeyDown={handleSkuKeyDown}
                        placeholder="Scan or Enter barcode"
                        required 
                        style={{ width: '100%', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '13px', outline: 'none' }} 
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div className="form-group">
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: '#64748B' }}>Unit Type</label>
                      <SearchableDropdown
                        value={formData.unit}
                        onChange={(val) => setFormData({...formData, unit: val})}
                        options={[
                          { value: 'Strip', label: 'Strip' },
                          { value: 'Capsule', label: 'Capsule' },
                          { value: 'Bottle', label: 'Bottle' },
                          { value: 'Tablet', label: 'Tablet' }
                        ]}
                        placeholder="Select Unit Type"
                      />
                    </div>

                    <div className="form-group">
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: '#64748B' }}>MRP (₹)</label>
                      <input type="number" step="0.01" className="form-control" value={formData.mrp} onChange={e => setFormData({...formData, mrp: Number(e.target.value)})} required style={{ width: '100%', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '13px', outline: 'none' }} />
                    </div>
                  </div>
                </>
              ) : null}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div className="form-group">
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: '#64748B' }}>
                    {modalMode === 'restock' ? 'New Stock Quantity' : 'Initial Stock'}
                  </label>
                  <input type="number" className="form-control" value={formData.stock} onChange={e => setFormData({...formData, stock: Number(e.target.value)})} required style={{ width: '100%', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '13px', outline: 'none' }} />
                </div>

                <div className="form-group">
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: '#64748B' }}>Expiry Date</label>
                  <input type="text" className="form-control" placeholder="DD/MM/YYYY" value={formData.expiry} onChange={e => setFormData({...formData, expiry: e.target.value})} required style={{ width: '100%', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '13px', outline: 'none' }} />
                </div>
              </div>

              </div>

              {/* Sticky Action Footer */}
              <div style={{ display: 'flex', gap: '16px', paddingTop: '12px', borderTop: '1px solid #F1F5F9', flexShrink: 0 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center', height: '48px', borderRadius: '12px', border: '1px solid #E2E8F0', background: 'transparent', color: '#64748B', fontWeight: 700, cursor: 'pointer' }} onClick={() => setShowMedicineModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', height: '48px', borderRadius: '12px', background: '#2563EB', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                  {modalMode === 'add' ? 'Add Medicine' : modalMode === 'restock' ? 'Verify Restock' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Prescribed Medicines Modal */}
      {showPrescriptionModal && selectedPrescriptionGroup && (
        <div 
          onClick={() => setShowPrescriptionModal(false)} 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(15,23,42,0.45)', 
            backdropFilter: 'blur(4px)', 
            zIndex: 9000, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '20px' 
          }}
        >
          <div 
            onClick={e => e.stopPropagation()} 
            style={{ 
              background: 'white', 
              borderRadius: '24px', 
              width: '100%', 
              maxWidth: '520px', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', 
              maxHeight: '90vh', 
              display: 'flex', 
              flexDirection: 'column', 
              overflow: 'hidden', 
              animation: 'fadeIn 0.25s ease-out',
              border: '1px solid rgba(226, 232, 240, 0.8)'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 28px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  {prescriptionModalStep === 'details' ? 'Prescription Details' : 'Payment Settlement'}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>
                    {selectedPrescriptionGroup.id || 'RX10058'}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: selectedPrescriptionGroup.status === 'Pending' ? '#FFF7ED' : '#ECFDF5',
                    color: selectedPrescriptionGroup.status === 'Pending' ? '#EA580C' : '#10B981',
                    textTransform: 'uppercase'
                  }}>
                    {selectedPrescriptionGroup.status}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setShowPrescriptionModal(false)} 
                style={{ 
                  background: '#F1F5F9', 
                  border: 'none', 
                  borderRadius: '50%', 
                  width: '32px', 
                  height: '32px', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  color: '#64748B', 
                  fontSize: '14px', 
                  fontWeight: 'bold',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#E2E8F0'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
              >
                ✕
              </button>
            </div>

            {prescriptionModalStep === 'details' ? (
              <>
                {/* Modal Body: DETAILS STEP */}
                <div style={{ padding: '28px', overflowY: 'auto', flex: 1 }} data-lenis-prevent>
                  {/* Patient Details */}
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Patient Details</span>
                    </div>
                    <div style={{ paddingLeft: '24px' }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>{selectedPrescriptionGroup.name}</div>
                      <div style={{ fontSize: '13.5px', color: '#475569', marginTop: '4px', fontWeight: 600 }}>
                        {selectedPrescriptionGroup.age} Y, {selectedPrescriptionGroup.gender}
                      </div>
                      <div style={{ fontSize: '13.5px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>
                        {selectedPrescriptionGroup.phone || '9876543210'}
                      </div>
                    </div>
                  </div>

                  {/* Doctor Details */}
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Doctor Details</span>
                    </div>
                    <div style={{ paddingLeft: '24px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedPrescriptionGroup.docName}</div>
                      <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>{selectedPrescriptionGroup.specialty}</div>
                    </div>
                  </div>

                  {/* Date & Time */}
                  <div style={{ marginBottom: '24px', borderBottom: '1px solid #F1F5F9', paddingBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date & Time</span>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>
                        {selectedPrescriptionGroup.dateStr || '24 May 2024'}, {selectedPrescriptionGroup.time}
                      </span>
                    </div>
                  </div>

                  {/* Items List with Price Breakdown */}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
                      Items ({selectedPrescriptionGroup.itemsList?.length || 0})
                    </div>
                    {/* Table Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '8px', padding: '8px 0', borderBottom: '2px solid #E2E8F0', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>Medicine</span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'center', minWidth: '40px' }}>Qty</span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right', minWidth: '60px' }}>Rate</span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', textAlign: 'right', minWidth: '70px' }}>Amount</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {selectedPrescriptionGroup.itemsList && selectedPrescriptionGroup.itemsList.length > 0 ? (
                        selectedPrescriptionGroup.itemsList.map((item, idx) => (
                          <div 
                            key={idx} 
                            style={{ 
                              display: 'grid', 
                              gridTemplateColumns: '1fr auto auto auto', 
                              gap: '8px',
                              alignItems: 'center',
                              padding: '10px 0',
                              borderBottom: idx === selectedPrescriptionGroup.itemsList.length - 1 ? 'none' : '1px solid #F1F5F9'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '14px', color: '#0F172A' }}>{item.medicine}</div>
                              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>
                                {item.dosage} • {item.duration} {item.instructions ? `• ${item.instructions}` : ''}
                              </div>
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569', textAlign: 'center', minWidth: '40px' }}>
                              {item.quantity || 1}
                            </span>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569', textAlign: 'right', minWidth: '60px' }}>
                              ₹{(item.unitPrice || 0).toFixed(2)}
                            </span>
                            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', textAlign: 'right', minWidth: '70px' }}>
                              ₹{(item.lineTotal || 0).toFixed(2)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#94A3B8', fontSize: '13px', fontWeight: 600 }}>
                          No medicines listed.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Modal Footer: DETAILS STEP */}
                <div style={{ padding: '24px 28px', borderTop: '1px solid #F1F5F9', flexShrink: 0, background: '#F8FAFC', borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: '#475569' }}>Total Amount</span>
                    <span style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A' }}>
                      ₹{(selectedPrescriptionGroup.amountVal || 0).toFixed(2)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div>
                      <input type="file" id="upload-pharm-letterhead" accept="image/*" onChange={handlePharmacyLetterheadUpload} style={{ display: 'none' }} />
                      <label 
                        htmlFor="upload-pharm-letterhead" 
                        style={{
                          padding: '10px 16px',
                          background: '#EFF6FF',
                          color: '#2563EB',
                          border: '1px solid #DBEAFE',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s ease-in-out',
                          height: '48px',
                          boxSizing: 'border-box'
                        }}
                      >
                        <i data-lucide="image" style={{ width: '14px', height: '14px' }}></i>
                        {customPharmacyLetterhead ? 'Change Letterhead' : 'Upload Letterhead'}
                      </label>
                      {customPharmacyLetterhead && (
                        <button 
                          type="button"
                          onClick={() => {
                            localStorage.removeItem('curoxa_pharmacy_letterhead');
                            setCustomPharmacyLetterhead(null);
                          }}
                          style={{ marginLeft: '8px', padding: '10px 12px', background: '#FEF2F2', color: '#DC2626', border: '1px solid #FEE2E2', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', height: '48px', boxSizing: 'border-box' }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <button 
                      type="button" 
                      style={{ 
                        flex: 1, 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        height: '48px', 
                        borderRadius: '12px', 
                        border: '1px solid #CBD5E1', 
                        background: 'white', 
                        color: '#334155', 
                        fontWeight: 700, 
                        fontSize: '14px',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s'
                      }} 
                      onClick={() => handlePrintInvoice(selectedPrescriptionGroup)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                      View Invoice
                    </button>
                    {selectedPrescriptionGroup.status === 'Pending' && (
                      <button 
                        type="button" 
                        style={{ 
                          flex: 1, 
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          height: '48px', 
                          borderRadius: '12px', 
                          background: '#2563EB', 
                          border: 'none', 
                          color: 'white', 
                          fontWeight: 700, 
                          fontSize: '14px',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s',
                          boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
                        }}
                        onClick={() => {
                          setPrescriptionModalStep('payment');
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        Dispense Now
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Modal Body: CHECKOUT STEP */}
                <div style={{ padding: '28px', overflowY: 'auto', flex: 1 }} data-lenis-prevent>
                  {/* Bill Summary */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '16px 20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #F1F5F9' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Amount Due</div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', marginTop: '2px' }}>
                        ₹{(selectedPrescriptionGroup.amountVal || 0).toFixed(2)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#475569' }}>{selectedPrescriptionGroup.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>{selectedPrescriptionGroup.items} Items Prescribed</div>
                    </div>
                  </div>

                  {/* Payment Mode Selector Grid */}
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                    Select Payment Method
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                    {['UPI', 'Cash', 'Card'].map(mode => {
                      const active = selectedPaymentMode === mode;
                      return (
                        <button
                          key={mode}
                          onClick={() => {
                            setSelectedPaymentMode(mode);
                            setCashReceived('');
                          }}
                          style={{
                            height: '46px',
                            borderRadius: '12px',
                            border: active ? '2px solid #2563EB' : '1px solid #CBD5E1',
                            background: active ? '#EFF6FF' : 'white',
                            color: active ? '#2563EB' : '#475569',
                            fontWeight: 800,
                            fontSize: '13.5px',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                          }}
                        >
                          {mode === 'UPI' && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="2" width="20" height="20" rx="2" ry="2"/><rect x="6" y="6" width="12" height="12"/></svg>}
                          {mode === 'Cash' && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>}
                          {mode === 'Card' && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>}
                          <span>{mode}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Interactive Payment Forms */}
                  {selectedPaymentMode === 'UPI' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '20px', background: '#F8FAFC', borderRadius: '16px', border: '1px dashed #CBD5E1' }}>
                      <div style={{ padding: '12px', background: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 10px rgba(0,0,0,0.03)', textAlign: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B', marginBottom: '8px' }}>Send payment link to patient</div>
                        <button style={{ padding: '8px 16px', background: '#2563EB', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Send SMS Link</button>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>UPI Payment Pending</div>
                        <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '4px', fontWeight: 600 }}>Supports GPay, PhonePe, Paytm & BHIM UPI</div>
                      </div>
                    </div>
                  )}

                  {selectedPaymentMode === 'Cash' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'slideUp 0.2s ease-out' }}>
                      <div className="form-group">
                        <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '8px' }}>Cash Amount Received</label>
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: '#475569', fontSize: '15px' }}>₹</span>
                          <input 
                            type="number" 
                            placeholder="Enter amount given by patient" 
                            value={cashReceived} 
                            onChange={(e) => setCashReceived(e.target.value)} 
                            style={{ 
                              width: '100%', 
                              height: '46px', 
                              paddingLeft: '32px', 
                              border: '1px solid #CBD5E1', 
                              borderRadius: '12px', 
                              fontSize: '15px', 
                              fontWeight: 700, 
                              outline: 'none',
                              color: '#0F172A'
                            }} 
                            required
                          />
                        </div>
                      </div>
                      {cashReceived && Number(cashReceived) >= (selectedPrescriptionGroup.amountVal || 0) && (
                        <div style={{ 
                          background: '#ECFDF5', 
                          border: '1px solid #A7F3D0', 
                          padding: '14px 18px', 
                          borderRadius: '12px', 
                          color: '#047857', 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          fontSize: '14px', 
                          fontWeight: 800,
                          animation: 'slideUp 0.15s ease-out'
                        }}>
                          <span>Change to Return:</span>
                          <span>₹{(Number(cashReceived) - (selectedPrescriptionGroup.amountVal || 0)).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedPaymentMode === 'Card' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '24px 20px', background: '#F8FAFC', borderRadius: '16px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, color: '#1E293B', fontSize: '14.5px' }}>POS Terminal Awaiting Card</div>
                        <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '6px', fontWeight: 600 }}>Please tap or insert the customer's Credit/Debit card on the POS machine.</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer: CHECKOUT STEP */}
                <div style={{ padding: '24px 28px', borderTop: '1px solid #F1F5F9', flexShrink: 0, background: '#F8FAFC', borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px' }}>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <button 
                      type="button" 
                      style={{ 
                        flex: 1, 
                        height: '48px', 
                        borderRadius: '12px', 
                        border: '1px solid #CBD5E1', 
                        background: 'white', 
                        color: '#64748B', 
                        fontWeight: 700, 
                        fontSize: '14px',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s'
                      }} 
                      onClick={() => setPrescriptionModalStep('details')}
                    >
                      Back
                    </button>
                    <button 
                      type="button" 
                      style={{ 
                        flex: 2, 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        height: '48px', 
                        borderRadius: '12px', 
                        background: '#10B981', 
                        border: 'none', 
                        color: 'white', 
                        fontWeight: 800, 
                        fontSize: '14px',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                      }}
                      onClick={handleConfirmPaymentAndDispense}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Confirm Pay & Dispense
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* COVERAGE LAB MODALS */}
      {showCoverageLabModal && selectedCoverageLabTest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5000, padding: '20px' }} onClick={() => setShowCoverageLabModal(false)}>
          <div style={{ width: '100%', maxWidth: '500px', padding: '28px', borderRadius: '16px', background: 'white' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Enter Diagnostic Lab Results</h3>
              <button 
                type="button" 
                onClick={() => setShowCoverageLabModal(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748B' }}
              >✕</button>
            </div>
            
            <div style={{ background: '#F8FAFC', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Patient: <b style={{ color: '#0F172A' }}>{selectedCoverageLabTest.name}</b></div>
              <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, marginTop: '4px' }}>Test Type: <b style={{ color: '#0F172A' }}>{selectedCoverageLabTest.test}</b></div>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const resultsObj = {
                  parameters: {
                    value: coverageLabParams.value,
                    unit: coverageLabParams.unit || 'g/dL'
                  },
                  remarks: coverageLabRemarks,
                  document: coverageLabFileName || 'LabReport_Signed.pdf',
                  finalizedAt: new Date().toISOString()
                };
                await api.put(`/labs/${selectedCoverageLabTest.id}`, {
                  status: 'Completed',
                  results: JSON.stringify(resultsObj)
                });
                showToast(`Lab results finalized & dispatched for ${selectedCoverageLabTest.name}!`);
                setShowCoverageLabModal(false);
                fetchCoverageData();
              } catch (err) {
                showToast('Failed to finalize results.');
              }
            }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>Test Value / Parameter Value</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    placeholder="e.g. 14.2" 
                    value={coverageLabParams.value} 
                    onChange={e => setCoverageLabParams({ ...coverageLabParams, value: e.target.value })}
                    required
                    style={{ flex: 1, height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', outline: 'none' }}
                  />
                  <input 
                    type="text" 
                    placeholder="Unit (e.g. g/dL, mg/dL)" 
                    value={coverageLabParams.unit} 
                    onChange={e => setCoverageLabParams({ ...coverageLabParams, unit: e.target.value })}
                    required
                    style={{ width: '150px', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>Remarks & Diagnostic Observations</label>
                <textarea 
                  placeholder="Enter medical observations, ranges, or comments..." 
                  value={coverageLabRemarks} 
                  onChange={e => setCoverageLabRemarks(e.target.value)}
                  required
                  style={{ width: '100%', height: '80px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 12px', outline: 'none', resize: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>Upload Diagnostic Report Document</label>
                <div 
                  style={{ border: '2px dashed #CBD5E1', borderRadius: '8px', padding: '16px', textAlign: 'center', cursor: 'pointer', background: '#F8FAFC' }}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'application/pdf,image/*';
                    input.onchange = (e) => {
                      if (e.target.files && e.target.files[0]) {
                        setCoverageLabFileName(e.target.files[0].name);
                      }
                    };
                    input.click();
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>
                    {coverageLabFileName ? `Selected: ${coverageLabFileName}` : 'Click to select or drop lab report PDF'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>PDF, PNG, JPG up to 10MB</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  onClick={() => setShowCoverageLabModal(false)}
                  style={{ height: '40px', padding: '0 16px', background: '#F1F5F9', border: 'none', borderRadius: '8px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                >Cancel</button>
                <button 
                  type="submit" 
                  style={{ height: '40px', padding: '0 20px', background: '#059669', border: 'none', borderRadius: '8px', fontWeight: 700, color: 'white', cursor: 'pointer' }}
                >Finalize & Dispatch</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCoverageLabDetailsModal && selectedCoverageLabTest && (() => {
        const parsed = parseResults(selectedCoverageLabTest.results);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5000, padding: '20px' }} onClick={() => setShowCoverageLabDetailsModal(false)}>
            <div style={{ width: '100%', maxWidth: '480px', padding: '28px', borderRadius: '16px', background: 'white' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Lab Report Details</h3>
                <button 
                  type="button" 
                  onClick={() => setShowCoverageLabDetailsModal(false)} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748B' }}
                >✕</button>
              </div>

              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, marginBottom: '6px' }}>PATIENT</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedCoverageLabTest.name}</div>
                <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Order ID: #{selectedCoverageLabTest.id}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Test Conducted</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B' }}>{selectedCoverageLabTest.test}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Reported Value</span>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#059669', background: '#ECFDF5', padding: '4px 8px', borderRadius: '6px', display: 'inline-block' }}>
                    {parsed.parameters?.value || 'N/A'} {parsed.parameters?.unit || ''}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Clinical Observations & Remarks</span>
                  <p style={{ fontSize: '13.5px', color: '#334155', background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #F1F5F9', margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
                    {parsed.remarks || 'No remarks provided.'}
                  </p>
                </div>
                {parsed.document && (
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Attached Document</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#EFF6FF', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E40AF', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{parsed.document}</span>
                      <a 
                        href="#" 
                        onClick={(e) => { e.preventDefault(); showToast(`Downloading: ${parsed.document}`); }} 
                        style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', textDecoration: 'none' }}
                      >Download</a>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  onClick={() => setShowCoverageLabDetailsModal(false)}
                  style={{ height: '40px', padding: '0 20px', background: '#0F172A', border: 'none', borderRadius: '8px', fontWeight: 700, color: 'white', cursor: 'pointer' }}
                >Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Profile Edit Modal */}
      {showProfileEditModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.3)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000 }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '440px', padding: '28px', borderRadius: '24px', border: '1px solid #E2E8F0', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Edit Pharmacist Profile</h2>
              <button 
                onClick={() => setShowProfileEditModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '50%' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
              </button>
            </div>

            {profileError && (
              <div style={{ padding: '12px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
                {profileError}
              </div>
            )}

            {profileSuccess && (
              <div style={{ padding: '12px', borderRadius: '8px', background: '#F0FDF4', border: '1px solid #86EFAC', color: '#16A34A', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
                {profileSuccess}
              </div>
            )}

            <form onSubmit={handleUpdateProfileSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
                {profileEditAvatar ? (
                  <img 
                    src={profileEditAvatar} 
                    alt="Preview" 
                    style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #10B981', boxShadow: '0 8px 20px rgba(16,185,129,0.15)' }} 
                  />
                ) : (
                  <div style={{ width: '90px', height: '90px', borderRadius: '50%', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 800, boxShadow: '0 8px 20px rgba(16,185,129,0.15)' }}>
                    {profileEditName ? profileEditName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'PH'}
                  </div>
                )}
                
                <div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#ECFDF5', color: '#047857', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', border: '1px dashed #10B981' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                    Upload Picture
                    <input 
                      type="file" 
                      accept="image/*" 
                      style={{ display: 'none' }} 
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          if (file.size > 5000000) {
                            showToast("File size must be under 5MB", "error");
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            setProfileEditAvatar(event.target.result);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                  {profileEditAvatar && (
                    <button
                      type="button"
                      onClick={() => setProfileEditAvatar('')}
                      style={{ display: 'block', margin: '6px auto 0', background: 'none', border: 'none', color: '#EF4444', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Remove Picture
                    </button>
                  )}
                </div>
              </div>

               <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, marginBottom: '6px', color: '#475569' }}>Full Name</label>
                <input 
                  type="text" 
                  style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: '8px', height: '40px', padding: '0 12px', fontSize: '13px', fontWeight: 600, outline: 'none', backgroundColor: '#F1F5F9', cursor: 'not-allowed' }}
                  value={profileEditName} 
                  disabled
                  required 
                />
                <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', display: 'block' }}>Managed by Administrator</span>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, marginBottom: '6px', color: '#475569' }}>Email Address</label>
                <input 
                  type="email" 
                  style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: '8px', height: '40px', padding: '0 12px', fontSize: '13px', fontWeight: 600, outline: 'none', backgroundColor: '#F1F5F9', cursor: 'not-allowed' }}
                  value={profileEditEmail} 
                  disabled
                  required 
                />
                <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', display: 'block' }}>Managed by Administrator</span>
              </div>

              <button 
                type="submit" 
                style={{ width: '100%', height: '44px', fontWeight: 800, borderRadius: '8px', background: '#10B981', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}
                disabled={profileEditLoading}
              >
                {profileEditLoading ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD VENDOR */}
      {showAddVendorModal && (
        <div className="modal-overlay" data-lenis-prevent style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }} onClick={() => setShowAddVendorModal(false)}>
          <div className="modal-box glass-card" style={{ width: '95%', maxWidth: '800px', maxHeight: '90vh', background: 'white', padding: '28px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', position: 'relative', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Propose New Vendor & Rate List</h2>
                <span style={{ fontSize: '12px', color: '#64748B' }}>Submit vendor profile and medicine catalogue for Admin review & MRP definition</span>
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} onClick={() => setShowAddVendorModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form onSubmit={handleAddVendor}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>Vendor Code *</label>
                  <input 
                    type="text" 
                    value={newVendor.code} 
                    onChange={e => setNewVendor({ ...newVendor, code: e.target.value })}
                    style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', outline: 'none', fontSize: '13px', fontWeight: 600, fontFamily: 'monospace' }}
                    placeholder="e.g. VEND-04"
                    required 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>Vendor / Supplier Name *</label>
                  <input 
                    type="text" 
                    value={newVendor.name} 
                    onChange={e => setNewVendor({ ...newVendor, name: e.target.value })}
                    placeholder="e.g. MedLife Distributors"
                    style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', outline: 'none', fontSize: '13px', fontWeight: 600 }}
                    required 
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>Email Address</label>
                  <input 
                    type="email" 
                    value={newVendor.email} 
                    onChange={e => setNewVendor({ ...newVendor, email: e.target.value })}
                    placeholder="e.g. orders@medlife.com"
                    style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', outline: 'none', fontSize: '13px', fontWeight: 600 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>Phone Number</label>
                  <input 
                    type="text" 
                    value={newVendor.phone} 
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setNewVendor({ ...newVendor, phone: val });
                    }}
                    placeholder="e.g. 9876543210"
                    maxLength={10}
                    style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', outline: 'none', fontSize: '13px', fontWeight: 600 }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>Address / Location</label>
                <input 
                  type="text"
                  value={newVendor.address} 
                  onChange={e => setNewVendor({ ...newVendor, address: e.target.value })}
                  placeholder="Street details, City, State"
                  style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', outline: 'none', fontSize: '13px', fontWeight: 600 }}
                />
              </div>

              {/* MEDICINE RATE LIST BUILDER */}
              <div style={{ marginTop: '20px', marginBottom: '20px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase' }}>Vendor Medicine Rate List *</span>
                    <span style={{ display: 'block', fontSize: '11.5px', color: '#64748B' }}>Add the medicines and wholesale purchase prices offered by this vendor</span>
                  </div>
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid #CBD5E1', background: 'white', color: '#2563EB', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                    onClick={handleAddVendorMedicineRow}
                  >
                    + Add Medicine
                  </button>
                </div>

                <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px', background: 'white' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '8px 10px', fontWeight: 800, color: '#475569' }}>Medicine Name *</th>
                        <th style={{ padding: '8px 10px', fontWeight: 800, color: '#475569', width: '140px' }}>SKU / Code *</th>
                        <th style={{ padding: '8px 10px', fontWeight: 800, color: '#475569', width: '130px' }}>Purchase Price (₹) *</th>
                        <th style={{ padding: '8px 10px', fontWeight: 800, color: '#475569', width: '90px' }}>GST (%)</th>
                        <th style={{ padding: '8px 10px', width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(newVendor.medicines || []).map((med, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '6px 10px' }}>
                            <input 
                              type="text" 
                              value={med.name} 
                              onChange={e => handleVendorMedicineChange(idx, 'name', e.target.value)}
                              placeholder="e.g. Dolo 650mg"
                              style={{ width: '100%', height: '34px', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0 8px', outline: 'none', fontSize: '12.5px', fontWeight: 600 }}
                              required 
                            />
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <input 
                              type="text" 
                              value={med.sku} 
                              onChange={e => handleVendorMedicineChange(idx, 'sku', e.target.value)}
                              placeholder="e.g. DOLO-650"
                              style={{ width: '100%', height: '34px', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0 8px', outline: 'none', fontSize: '12.5px', fontFamily: 'monospace', textTransform: 'uppercase' }}
                              required 
                            />
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <input 
                              type="number" 
                              step="0.01"
                              min="0.01"
                              value={med.price} 
                              onChange={e => handleVendorMedicineChange(idx, 'price', e.target.value)}
                              placeholder="₹ 0.00"
                              style={{ width: '100%', height: '34px', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0 8px', outline: 'none', fontSize: '12.5px', fontWeight: 700 }}
                              required 
                            />
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <input 
                              type="number" 
                              step="0.1"
                              min="0"
                              value={med.gst !== undefined ? med.gst : 12} 
                              onChange={e => handleVendorMedicineChange(idx, 'gst', e.target.value)}
                              style={{ width: '100%', height: '34px', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0 8px', outline: 'none', fontSize: '12.5px', fontWeight: 600 }}
                            />
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                            {(newVendor.medicines || []).length > 1 && (
                              <button 
                                type="button" 
                                style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontWeight: 800, fontSize: '14px' }}
                                onClick={() => handleRemoveVendorMedicineRow(idx)}
                                title="Remove row"
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #E2E8F0' }}>
                <button 
                  type="button" 
                  style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontWeight: 800, cursor: 'pointer' }}
                  onClick={() => setShowAddVendorModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  style={{ padding: '10px 24px', fontWeight: 800, borderRadius: '8px', background: '#2563EB', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  Submit for Admin Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: VENDOR DETAILS DRAWER / PROFILE */}
      {selectedVendor && (
        <div className="modal-overlay" data-lenis-prevent style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }} onClick={() => setSelectedVendor(null)}>
          <div className="modal-box glass-card" style={{ width: '90%', maxWidth: '800px', maxHeight: '90vh', background: 'white', padding: '28px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', position: 'relative', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: 0 }}>{selectedVendor.name}</h2>
                <span style={{ fontSize: '13px', fontFamily: 'monospace', color: '#2563EB', fontWeight: 700 }}>Code: {selectedVendor.code}</span>
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} onClick={() => setSelectedVendor(null)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '10px' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact Information</h4>
                <div style={{ fontSize: '13.5px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>Email: <b style={{ color: '#0F172A' }}>{selectedVendor.email || '--'}</b></div>
                  <div>Phone: <b style={{ color: '#0F172A' }}>{selectedVendor.phone || '--'}</b></div>
                  <div>Address: <b style={{ color: '#0F172A' }}>{selectedVendor.address || '--'}</b></div>
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '10px' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Commercial Snapshot</h4>
                <div style={{ fontSize: '13.5px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>Price List Scope: <b style={{ color: '#0F172A' }}>{selectedVendor.medicines?.length || 0} Products</b></div>
                  <div>Completed Orders: <b style={{ color: '#0F172A' }}>{selectedVendor.purchaseHistory?.length || 0} POs</b></div>
                </div>
              </div>
            </div>

            {/* Price list panel */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>Catalog Price List</h4>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '6px 12px', fontSize: '11.5px', borderRadius: '6px', cursor: 'pointer', border: '1px solid #E2E8F0', background: '#F8FAFC', fontWeight: 700, color: '#2563EB' }}
                  onClick={() => {
                    setEditablePriceList(selectedVendor.medicines || []);
                    setShowPriceListModal(true);
                  }}
                >
                  Manage Price List
                </button>
              </div>

              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>Medicine</th>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>SKU Code</th>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>Unit Price</th>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>Availability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedVendor.medicines?.map((med, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>{med.name}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#64748B' }}>{med.sku}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 800, color: '#0F172A' }}>₹{med.price.toFixed(2)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ 
                            fontSize: '11px', 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            fontWeight: 800, 
                            background: med.available ? '#DEF7EC' : '#FDE8E8', 
                            color: med.available ? '#03543F' : '#9B1C1C' 
                          }}>
                            {med.available ? 'In Stock' : 'Out of Stock'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {(!selectedVendor.medicines || selectedVendor.medicines.length === 0) && (
                      <tr>
                        <td colSpan="4" style={{ padding: '14px', textStyle: 'italic', textAlign: 'center', color: '#94A3B8' }}>No items listed.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Purchase History panel */}
            <div>
              <h4 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>Purchase Order History</h4>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>PO Number</th>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>Date</th>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>Total Cost</th>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedVendor.purchaseHistory?.map((hist, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{hist.poId}</td>
                        <td style={{ padding: '10px 14px', color: '#64748B' }}>{new Date(hist.date).toLocaleDateString()}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 800, color: '#0F172A' }}>₹{hist.amount.toFixed(2)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', fontWeight: 800, background: '#DEF7EC', color: '#03543F' }}>
                            {hist.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {(!selectedVendor.purchaseHistory || selectedVendor.purchaseHistory.length === 0) && (
                      <tr>
                        <td colSpan="4" style={{ padding: '14px', textStyle: 'italic', textAlign: 'center', color: '#94A3B8' }}>No purchase history recorded.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD MEDICINE FOR APPROVAL */}
      {showAddMedicineApprovalModal && (
        <div 
          className="modal-overlay" 
          data-lenis-prevent 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            backgroundColor: 'rgba(15, 23, 42, 0.55)', 
            backdropFilter: 'blur(8px)', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            zIndex: 10000,
            padding: '20px'
          }} 
          onClick={() => setShowAddMedicineApprovalModal(false)}
        >
          <div 
            style={{ 
              width: '100%', 
              maxWidth: '560px', 
              maxHeight: '90vh', 
              background: '#FFFFFF', 
              padding: '30px 32px', 
              borderRadius: '24px', 
              boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8)', 
              position: 'relative', 
              overflowY: 'auto',
              animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }} 
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px' }}>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                <div style={{ 
                  width: '46px', 
                  height: '46px', 
                  borderRadius: '14px', 
                  background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)', 
                  border: '1px solid #BFDBFE',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  color: '#2563EB',
                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.12)'
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/>
                    <path d="m8.5 8.5 7 7"/>
                  </svg>
                </div>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
                    Add Medicine for Approval
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 500 }}>Target Vendor:</span>
                    <span style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', padding: '2px 9px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700, color: '#1E293B' }}>
                      {selectedVendor?.name || 'Selected Vendor'}
                    </span>
                    {selectedVendor?.code && (
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#2563EB', background: '#EFF6FF', padding: '2px 7px', borderRadius: '6px', fontSize: '11.5px', border: '1px solid #DBEAFE' }}>
                        {selectedVendor.code}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button 
                type="button" 
                style={{ 
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: '#F8FAFC', 
                  border: '1px solid #E2E8F0', 
                  cursor: 'pointer', 
                  color: '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }} 
                onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#0F172A'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.color = '#64748B'; }}
                onClick={() => setShowAddMedicineApprovalModal(false)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form onSubmit={handleSubmitMedicineForApproval} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Medicine Name */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1E293B', marginBottom: '6px' }}>
                  Medicine Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Paracetamol 650mg, Amoxicillin 500mg"
                    value={newMedApprovalData.name}
                    onChange={e => setNewMedApprovalData({ ...newMedApprovalData, name: e.target.value })}
                    style={{ 
                      width: '100%', 
                      height: '42px', 
                      padding: '0 14px', 
                      borderRadius: '10px', 
                      border: '1.5px solid #CBD5E1', 
                      fontSize: '13.5px', 
                      outline: 'none', 
                      background: '#F8FAFC',
                      color: '#0F172A',
                      fontWeight: 600,
                      boxSizing: 'border-box',
                      transition: 'all 0.15s ease'
                    }}
                    onFocus={e => { e.target.style.borderColor = '#2563EB'; e.target.style.background = '#FFFFFF'; e.target.style.boxShadow = '0 0 0 3.5px rgba(37, 99, 235, 0.12)'; }}
                    onBlur={e => { e.target.style.borderColor = '#CBD5E1'; e.target.style.background = '#F8FAFC'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              {/* SKU and Price Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1E293B', marginBottom: '6px' }}>
                    SKU / Item Code <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. PAR-650"
                    value={newMedApprovalData.sku}
                    onChange={e => setNewMedApprovalData({ ...newMedApprovalData, sku: e.target.value.toUpperCase() })}
                    style={{ 
                      width: '100%', 
                      height: '42px', 
                      padding: '0 14px', 
                      borderRadius: '10px', 
                      border: '1.5px solid #CBD5E1', 
                      fontSize: '13.5px', 
                      outline: 'none', 
                      fontFamily: 'monospace', 
                      fontWeight: 700,
                      color: '#2563EB',
                      background: '#F8FAFC',
                      boxSizing: 'border-box',
                      transition: 'all 0.15s ease'
                    }}
                    onFocus={e => { e.target.style.borderColor = '#2563EB'; e.target.style.background = '#FFFFFF'; e.target.style.boxShadow = '0 0 0 3.5px rgba(37, 99, 235, 0.12)'; }}
                    onBlur={e => { e.target.style.borderColor = '#CBD5E1'; e.target.style.background = '#F8FAFC'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1E293B', marginBottom: '6px' }}>
                    Wholesale Price (₹) <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '10px', fontSize: '15px', fontWeight: 800, color: '#64748B' }}>₹</span>
                    <input 
                      type="number" 
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={newMedApprovalData.price}
                      onChange={e => setNewMedApprovalData({ ...newMedApprovalData, price: e.target.value })}
                      style={{ 
                        width: '100%', 
                        height: '42px', 
                        padding: '0 14px 0 28px', 
                        borderRadius: '10px', 
                        border: '1.5px solid #CBD5E1', 
                        fontSize: '14px', 
                        outline: 'none', 
                        fontWeight: 800, 
                        color: '#0F172A',
                        background: '#F8FAFC',
                        boxSizing: 'border-box',
                        transition: 'all 0.15s ease'
                      }}
                      onFocus={e => { e.target.style.borderColor = '#2563EB'; e.target.style.background = '#FFFFFF'; e.target.style.boxShadow = '0 0 0 3.5px rgba(37, 99, 235, 0.12)'; }}
                      onBlur={e => { e.target.style.borderColor = '#CBD5E1'; e.target.style.background = '#F8FAFC'; e.target.style.boxShadow = 'none'; }}
                    />
                  </div>
                </div>
              </div>

              {/* GST and Availability Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1E293B', marginBottom: '6px' }}>
                    GST Rate (%)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type="number" 
                      min="0"
                      max="100"
                      value={newMedApprovalData.gst}
                      onChange={e => setNewMedApprovalData({ ...newMedApprovalData, gst: e.target.value })}
                      style={{ 
                        width: '100%', 
                        height: '42px', 
                        padding: '0 32px 0 14px', 
                        borderRadius: '10px', 
                        border: '1.5px solid #CBD5E1', 
                        fontSize: '13.5px', 
                        outline: 'none', 
                        fontWeight: 700,
                        color: '#0F172A',
                        background: '#F8FAFC',
                        boxSizing: 'border-box',
                        transition: 'all 0.15s ease'
                      }}
                      onFocus={e => { e.target.style.borderColor = '#2563EB'; e.target.style.background = '#FFFFFF'; e.target.style.boxShadow = '0 0 0 3.5px rgba(37, 99, 235, 0.12)'; }}
                      onBlur={e => { e.target.style.borderColor = '#CBD5E1'; e.target.style.background = '#F8FAFC'; e.target.style.boxShadow = 'none'; }}
                    />
                    <span style={{ position: 'absolute', right: '12px', top: '10px', fontSize: '13.5px', fontWeight: 800, color: '#64748B' }}>%</span>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1E293B', marginBottom: '6px' }}>
                    Procurement Status
                  </label>
                  <label 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      height: '42px', 
                      padding: '0 12px', 
                      borderRadius: '10px', 
                      border: '1.5px solid #CBD5E1', 
                      background: newMedApprovalData.available ? '#F0FDF4' : '#F8FAFC',
                      cursor: 'pointer',
                      gap: '10px',
                      userSelect: 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <input 
                      type="checkbox" 
                      id="medAvailableCheck"
                      checked={newMedApprovalData.available}
                      onChange={e => setNewMedApprovalData({ ...newMedApprovalData, available: e.target.checked })}
                      style={{ cursor: 'pointer', width: '17px', height: '17px', accentColor: '#16A34A' }}
                    />
                    <span style={{ fontSize: '12.5px', color: newMedApprovalData.available ? '#15803D' : '#64748B', fontWeight: 700 }}>
                      {newMedApprovalData.available ? '● Available for PO' : '○ Out of Stock'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Justification / Request Note */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1E293B', marginBottom: '6px' }}>
                  Request Note / Justification <span style={{ color: '#94A3B8', fontWeight: 500 }}>(Optional)</span>
                </label>
                <textarea 
                  rows={2}
                  placeholder="e.g. Rate negotiated per wholesale contract renewal..."
                  value={newMedApprovalData.comment}
                  onChange={e => setNewMedApprovalData({ ...newMedApprovalData, comment: e.target.value })}
                  style={{ 
                    width: '100%', 
                    padding: '10px 14px', 
                    borderRadius: '10px', 
                    border: '1.5px solid #CBD5E1', 
                    fontSize: '13px', 
                    outline: 'none', 
                    fontFamily: 'inherit', 
                    background: '#F8FAFC',
                    boxSizing: 'border-box',
                    lineHeight: 1.4,
                    resize: 'none',
                    transition: 'all 0.15s ease'
                  }}
                  onFocus={e => { e.target.style.borderColor = '#2563EB'; e.target.style.background = '#FFFFFF'; e.target.style.boxShadow = '0 0 0 3.5px rgba(37, 99, 235, 0.12)'; }}
                  onBlur={e => { e.target.style.borderColor = '#CBD5E1'; e.target.style.background = '#F8FAFC'; e.target.style.boxShadow = 'none'; }}
                />
              </div>

              {/* Workflow Card Banner */}
              <div style={{ 
                padding: '12px 16px', 
                background: 'linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 100%)', 
                border: '1px solid #BAE6FD', 
                borderRadius: '12px', 
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{ 
                  width: '32px', 
                  height: '32px', 
                  borderRadius: '50%', 
                  background: '#DBEAFE', 
                  color: '#2563EB', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  flexShrink: 0 
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <path d="m9 12 2 2 4-4"/>
                  </svg>
                </div>
                <div style={{ fontSize: '12px', color: '#1E40AF', lineHeight: 1.45 }}>
                  <strong>Admin Authorization Required:</strong> This medicine will be submitted for verification. It becomes active immediately once approved by the Admin.
                </div>
              </div>

              {/* Footer Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '6px', paddingTop: '10px' }}>
                <button 
                  type="button" 
                  disabled={isSubmittingMedApproval}
                  onClick={() => setShowAddMedicineApprovalModal(false)}
                  style={{ 
                    padding: '10px 20px', 
                    borderRadius: '10px', 
                    border: '1.5px solid #E2E8F0', 
                    background: '#F8FAFC', 
                    color: '#475569', 
                    fontWeight: 700, 
                    fontSize: '13px', 
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#0F172A'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.color = '#475569'; }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmittingMedApproval}
                  style={{ 
                    padding: '10px 24px', 
                    borderRadius: '10px', 
                    border: 'none', 
                    background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', 
                    color: '#FFFFFF', 
                    fontWeight: 800, 
                    fontSize: '13px', 
                    cursor: isSubmittingMedApproval ? 'not-allowed' : 'pointer', 
                    opacity: isSubmittingMedApproval ? 0.75 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {isSubmittingMedApproval ? (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
                        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/>
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                      </svg>
                      Submitting...
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      Submit for Approval
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: PRICE LIST EDITOR */}
      {showPriceListModal && (
        <div className="modal-overlay" data-lenis-prevent style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }} onClick={() => setShowPriceListModal(false)}>
          <div className="modal-box glass-card" style={{ width: '90%', maxWidth: '650px', maxHeight: '85vh', background: 'white', padding: '28px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', position: 'relative', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Configure Price List ({selectedVendor?.name})</h2>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748B' }}>Update active items or propose new medicines for Admin approval.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', border: 'none', background: '#2563EB', fontWeight: 700, color: '#FFFFFF', cursor: 'pointer' }}
                  onClick={() => {
                    setNewMedApprovalData({
                      name: '',
                      sku: '',
                      price: '',
                      gst: 12,
                      available: true,
                      mrp: '',
                      comment: ''
                    });
                    setShowAddMedicineApprovalModal(true);
                  }}
                >
                  + Add Medicine for Approval
                </button>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} onClick={() => setShowPriceListModal(false)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            <form onSubmit={handleSavePriceList}>
              <div style={{ maxHeight: '45vh', overflowY: 'auto', marginBottom: '20px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>Medicine</th>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>SKU Code</th>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>Price (₹)</th>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>GST (%)</th>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>Available</th>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editablePriceList.map((med, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                          <input 
                            type="text" 
                            value={med.name} 
                            onChange={e => {
                              const updated = [...editablePriceList];
                              updated[idx].name = e.target.value;
                              setEditablePriceList(updated);
                            }}
                            style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: '4px', height: '30px', padding: '0 8px', outline: 'none' }}
                          />
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <input 
                            type="text" 
                            value={med.sku} 
                            onChange={e => {
                              const updated = [...editablePriceList];
                              updated[idx].sku = e.target.value;
                              setEditablePriceList(updated);
                            }}
                            style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: '4px', height: '30px', padding: '0 8px', outline: 'none', fontFamily: 'monospace' }}
                          />
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <input 
                            type="number" 
                            step="0.01"
                            value={med.price} 
                            onChange={e => {
                              const updated = [...editablePriceList];
                              updated[idx].price = Number(e.target.value) || 0;
                              setEditablePriceList(updated);
                            }}
                            style={{ width: '80px', border: '1px solid #E2E8F0', borderRadius: '4px', height: '30px', padding: '0 8px', outline: 'none', fontWeight: 800 }}
                          />
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <input 
                            type="number" 
                            min="0"
                            max="100"
                            value={med.gst !== undefined ? med.gst : 12} 
                            onChange={e => {
                              const updated = [...editablePriceList];
                              updated[idx].gst = Number(e.target.value) || 0;
                              setEditablePriceList(updated);
                            }}
                            style={{ width: '60px', border: '1px solid #E2E8F0', borderRadius: '4px', height: '30px', padding: '0 8px', outline: 'none' }}
                          />
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={med.available} 
                            onChange={e => {
                              const updated = [...editablePriceList];
                              updated[idx].available = e.target.checked;
                              setEditablePriceList(updated);
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <button 
                            type="button" 
                            style={{ background: 'none', border: 'none', color: '#EF4444', fontWeight: 800, cursor: 'pointer' }}
                            onClick={() => {
                              setEditablePriceList(editablePriceList.filter((_, i) => i !== idx));
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '12px', border: '1px dashed #2563EB', background: 'transparent', color: '#2563EB', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}
                  onClick={() => {
                    setEditablePriceList([...editablePriceList, { name: '', sku: '', price: 10.0, gst: 12, available: true }]);
                  }}
                >
                  + Add Custom Medicine
                </button>

                <button 
                  type="button" 
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '12px', border: '1px solid #CBD5E1', background: 'transparent', color: '#334155', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}
                  onClick={() => {
                    const existingSkus = editablePriceList.map(x => x.sku);
                    const newItems = inventory
                      .filter(x => !existingSkus.includes(x.sku))
                      .map(x => ({
                        name: x.name,
                        sku: x.sku,
                        price: Math.round(x.mrp * 0.7),
                        gst: 12,
                        available: true
                      }));
                    setEditablePriceList([...editablePriceList, ...newItems]);
                  }}
                >
                  + Populate from Clinic Inventory
                </button>
              </div>

              <button 
                type="submit" 
                style={{ width: '100%', height: '44px', fontWeight: 800, borderRadius: '8px', background: '#2563EB', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                Save Price List Configurations
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CREATE PURCHASE ORDER */}
      {showCreatePOModal && (() => {
        // Compute live splits and summary
        const splitsMap = {};
        let grandSub = 0;
        let grandTax = 0;
        let grandTot = 0;
        let validLinesCount = 0;

        poDraftItems.forEach(row => {
          if (!row.name || !row.sku || !row.vendorId || !row.qty) return;
          validLinesCount++;
          const qty = Number(row.qty) || 0;
          const price = Number(row.price) || 0;
          const tax = row.tax !== undefined ? Number(row.tax) : 12;
          const lineSub = qty * price;
          const lineTax = (lineSub * tax) / 100;
          const lineTot = lineSub + lineTax;

          grandSub += lineSub;
          grandTax += lineTax;
          grandTot += lineTot;

          const vKey = row.vendorId.toString();
          if (!splitsMap[vKey]) {
            splitsMap[vKey] = {
              vendorId: row.vendorId,
              vendorName: row.vendorName || 'Supplier',
              items: [],
              subtotal: 0,
              taxAmount: 0,
              totalAmount: 0
            };
          }
          splitsMap[vKey].items.push({
            name: row.name,
            sku: row.sku,
            qty: qty,
            price: price,
            tax: tax,
            total: lineTot
          });
          splitsMap[vKey].subtotal += lineSub;
          splitsMap[vKey].taxAmount += lineTax;
          splitsMap[vKey].totalAmount += lineTot;
        });

        const liveSplits = Object.values(splitsMap);

        return (
          <div className="modal-overlay" data-lenis-prevent style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }} onClick={() => setShowCreatePOModal(false)}>
            <div className="modal-box glass-card" style={{ width: '96%', maxWidth: '1150px', maxHeight: '92vh', background: 'white', padding: '28px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', position: 'relative', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Create Consolidated Purchase Order</h2>
                  <p style={{ fontSize: '12.5px', color: '#64748B', margin: '3px 0 0 0' }}>Select medicines across approved suppliers. Lowest available rate is auto-selected; override as needed.</p>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} onClick={() => setShowCreatePOModal(false)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Prescribed Procurement Items</h4>
                    <span style={{ fontSize: '12px', color: '#64748B' }}>{poDraftItems.length} line item(s)</span>
                  </div>

                  <div style={{ maxHeight: '48vh', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px', marginBottom: '16px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                          <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, minWidth: '180px' }}>Medicine Name</th>
                          <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, width: '90px' }}>SKU</th>
                          <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 800, minWidth: '200px' }}>Assigned Supplier</th>
                          <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 800, width: '70px', textAlign: 'center' }}>Qty</th>
                          <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 800, width: '80px', textAlign: 'right' }}>Rate (₹)</th>
                          <th style={{ padding: '10px 8px', color: '#475569', fontWeight: 800, width: '50px', textAlign: 'center' }}>GST</th>
                          <th style={{ padding: '10px 10px', color: '#475569', fontWeight: 800, width: '90px', textAlign: 'right' }}>Total (₹)</th>
                          <th style={{ padding: '10px 8px', width: '30px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {poDraftItems.map((item, idx) => {
                          const availableSuppliers = getVendorsOfferingItem(item.sku);
                          const cheapest = availableSuppliers.length > 0 ? availableSuppliers[0] : null;

                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '8px 10px' }}>
                                <SearchableDropdown
                                  value={item.name}
                                  onChange={val => handleDraftPOItemSelect(idx, val)}
                                  options={uniqueMedCatalog.map(m => ({ value: m.name, label: m.name }))}
                                  placeholder="Select medicine..."
                                />
                              </td>
                              <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#2563EB', fontSize: '11.5px' }}>
                                {item.sku || '—'}
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                {item.sku && availableSuppliers.length > 0 ? (
                                  <div>
                                    <select
                                      value={item.vendorId ? item.vendorId.toString() : ''}
                                      onChange={(e) => handleDraftPOVendorSelect(idx, e.target.value)}
                                      style={{ width: '100%', height: '32px', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0 6px', fontSize: '12px', outline: 'none', background: 'white' }}
                                    >
                                      {availableSuppliers.map(sup => (
                                        <option key={sup.vendorId} value={sup.vendorId.toString()}>
                                          {sup.vendorName} — ₹{sup.price.toFixed(2)} {cheapest && sup.vendorId.toString() === cheapest.vendorId.toString() ? '★ Best Price' : ''}
                                        </option>
                                      ))}
                                    </select>
                                    {item.isLowest && (
                                      <div style={{ marginTop: '3px', display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#DEF7EC', color: '#03543F', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                                        ✓ Lowest Price
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{ color: '#94A3B8', fontSize: '11.5px', fontStyle: 'italic' }}>Select item first</span>
                                )}
                              </td>
                              <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                <input 
                                  type="number" 
                                  min="1"
                                  value={item.qty} 
                                  onChange={e => handleDraftPOQtyChange(idx, e.target.value)}
                                  style={{ width: '60px', height: '32px', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0 4px', textAlign: 'center', outline: 'none', fontWeight: 800 }}
                                />
                              </td>
                              <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, color: '#1E293B' }}>
                                ₹{(item.price || 0).toFixed(2)}
                              </td>
                              <td style={{ padding: '8px 8px', textAlign: 'center', color: '#64748B', fontWeight: 600 }}>
                                {item.tax !== undefined ? item.tax : 12}%
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                                ₹{(item.total || 0).toFixed(2)}
                              </td>
                              <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                <button 
                                  type="button" 
                                  style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontWeight: 800, fontSize: '14px' }}
                                  onClick={() => handleDraftPORemoveRow(idx)}
                                  title="Remove item"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      style={{ padding: '8px 16px', fontSize: '12.5px', border: '1px solid #CBD5E1', background: '#F8FAFC', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}
                      onClick={handleDraftPOAddRow}
                    >
                      + Add Item
                    </button>
                  </div>
                </div>

                {/* RIGHT COLUMN: REAL-TIME SPLIT BREAKDOWN & CONFIRMATION */}
                <div style={{ borderLeft: '1px solid #E2E8F0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Consolidated Order Summary</h4>
                    
                    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                        <span style={{ color: '#64748B' }}>Total Line Items:</span>
                        <strong style={{ color: '#0F172A' }}>{validLinesCount}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                        <span style={{ color: '#64748B' }}>Suppliers Involved:</span>
                        <strong style={{ color: '#2563EB' }}>{liveSplits.length} Vendor(s)</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                        <span style={{ color: '#64748B' }}>Subtotal:</span>
                        <strong style={{ color: '#0F172A' }}>₹{grandSub.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                        <span style={{ color: '#64748B' }}>Estimated GST:</span>
                        <strong style={{ color: '#0F172A' }}>₹{grandTax.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #CBD5E1', paddingTop: '8px', marginTop: '6px', fontSize: '15px' }}>
                        <span style={{ fontWeight: 800, color: '#0F172A' }}>Grand Outlay:</span>
                        <strong style={{ fontWeight: 900, color: '#2563EB' }}>₹{grandTot.toFixed(2)}</strong>
                      </div>
                    </div>

                    <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Vendor Split Orders</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '28vh', overflowY: 'auto', marginBottom: '16px' }}>
                      {liveSplits.map((split, index) => (
                        <div key={index} style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', background: '#FFFFFF', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '13px' }}>{split.vendorName}</span>
                            <span style={{ fontWeight: 900, color: '#2563EB', fontSize: '13px' }}>₹{split.totalAmount.toFixed(2)}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                            {split.items.map(i => `${i.name} (x${i.qty})`).join(', ')}
                          </div>
                        </div>
                      ))}
                      {liveSplits.length === 0 && (
                        <span style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic', padding: '8px 0' }}>Select medications to preview vendor splits.</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <button 
                      type="button" 
                      disabled={validLinesCount === 0}
                      onClick={handleSendPurchaseOrders}
                      style={{ width: '100%', height: '44px', fontWeight: 800, borderRadius: '8px', background: validLinesCount > 0 ? '#10B981' : '#CBD5E1', color: 'white', border: 'none', cursor: validLinesCount > 0 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13.5px', boxShadow: validLinesCount > 0 ? '0 4px 6px -1px rgba(16, 185, 129, 0.2)' : 'none' }}
                    >
                      <span>🚀 Submit Consolidated PO ({liveSplits.length} Orders)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 5: CREATE GOODS RECEIPT NOTE (GRN) */}
      {showGRNModal && (() => {
        const selectedPoObj = grnFlowType === 'po' 
          ? purchaseOrders.find(x => x._id === grnSelectedPOId || x.poId === grnSelectedPOId) 
          : null;

        // Live financial computations across all items in form
        const liveTotals = grnItems.reduce((acc, item) => {
          const qty = Math.max(0, Number(item.qtyReceived) || 0);
          const rate = Math.max(0, Number(item.price || item.purchaseRate) || 0);
          const discPct = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
          const gstRate = Math.max(0, Number(item.gst !== undefined ? item.gst : 12));

          const gross = qty * rate;
          const discAmt = Math.round((gross * (discPct / 100)) * 100) / 100;
          const taxable = Math.max(0, Math.round((gross - discAmt) * 100) / 100);
          const gstAmt = Math.round((taxable * (gstRate / 100)) * 100) / 100;
          const net = Math.round((taxable + gstAmt) * 100) / 100;

          return {
            subtotal: acc.subtotal + gross,
            totalDiscount: acc.totalDiscount + discAmt,
            taxableBase: acc.taxableBase + taxable,
            totalGst: acc.totalGst + gstAmt,
            grandTotal: acc.grandTotal + net
          };
        }, { subtotal: 0, totalDiscount: 0, taxableBase: 0, totalGst: 0, grandTotal: 0 });

        const invoicedVal = Number(grnInvoiceAmount) || 0;
        const varianceVal = invoicedVal > 0 ? Math.round((liveTotals.grandTotal - invoicedVal) * 100) / 100 : 0;

        return (
          <div className="modal-overlay" data-lenis-prevent style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }} onClick={() => setShowGRNModal(false)}>
            <div className="modal-box glass-card" style={{ width: '96%', maxWidth: '1200px', maxHeight: '92vh', background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', position: 'relative', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Goods Receipt Note (GRN) Generation</h2>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Receive, inspect, and verify ordered inventory against supplier invoice and PO specifications</div>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} onClick={() => setShowGRNModal(false)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              <form onSubmit={(e) => handleSaveGRN(e, 'Verified/Completed')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  
                  {/* 1. FLOW TYPE & LOCATION HEADER */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '11.5px', textTransform: 'uppercase', color: '#475569', fontWeight: 800 }}>Receipt Workflow Type</label>
                      <div style={{ display: 'flex', gap: '20px', marginTop: '6px' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#1E293B', cursor: 'pointer' }}>
                          <input 
                            type="radio" 
                            name="grnFlowType" 
                            checked={grnFlowType === 'po'} 
                            onChange={() => {
                              setGrnFlowType('po');
                              setGrnSelectedPOId('');
                              setGrnDirectVendorId('');
                              setGrnItems([]);
                            }} 
                          />
                          Receive against Approved PO
                        </label>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#1E293B', cursor: 'pointer' }}>
                          <input 
                            type="radio" 
                            name="grnFlowType" 
                            checked={grnFlowType === 'direct'} 
                            onChange={() => {
                              setGrnFlowType('direct');
                              setGrnSelectedPOId('');
                              setGrnDirectVendorId('');
                              setGrnItems([{
                                name: '',
                                sku: '',
                                itemType: 'Medicine',
                                unit: 'Strip',
                                barcode: '',
                                qtyOrdered: 0,
                                orderedQty: 0,
                                previouslyReceivedQty: 0,
                                remainingQty: 0,
                                qtyReceived: 100,
                                rejectedQty: 0,
                                rejectionReason: '',
                                price: 10,
                                purchaseRate: 10,
                                discountPercent: 0,
                                gst: 12,
                                batchNumber: '',
                                expiryDate: '',
                                mfgDate: ''
                              }]);
                            }} 
                          />
                          Direct Purchase (No PO)
                        </label>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', textTransform: 'uppercase', color: '#475569', fontWeight: 800, marginBottom: '6px' }}>Receiving Location / Store *</label>
                      <select 
                        value={grnLocation} 
                        onChange={e => setGrnLocation(e.target.value)}
                        style={{ width: '100%', height: '36px', fontSize: '13px', fontWeight: 700, border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0 8px', outline: 'none' }}
                      >
                        <option value="Main Pharmacy Store">Main Pharmacy Store</option>
                        <option value="Central Warehouse Depot">Central Warehouse Depot</option>
                        <option value="OPD Dispensing Store">OPD Dispensing Store</option>
                        <option value="Emergency & ICU Store">Emergency & ICU Store</option>
                      </select>
                    </div>
                  </div>

                  {/* 2. PO SELECTION & READ-ONLY ORDER DETAILS */}
                  {grnFlowType === 'po' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11.5px', textTransform: 'uppercase', color: '#475569', fontWeight: 800, marginBottom: '6px' }}>
                          Select Approved Purchase Order *
                        </label>
                        <SearchableDropdown
                          value={grnSelectedPOId}
                          onChange={handleGrnPOSelection}
                          options={purchaseOrders.filter(x => ['Approved', 'Sent', 'Confirmed', 'Partially Delivered', 'Partially Received'].includes(x.status)).map(po => ({ 
                            value: po._id, 
                            label: `${po.poId} — ${po.vendorName} (₹${Number(po.totalAmount || 0).toLocaleString()} • ${po.status})` 
                          }))}
                          placeholder="Choose approved order..."
                        />
                      </div>

                      {selectedPoObj && (
                        <div style={{ background: '#EFF6FF', border: '1.5px solid #BFDBFE', borderRadius: '10px', padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase' }}>PO Number</span>
                            <div style={{ fontSize: '15px', fontWeight: 900, color: '#1E3A8A', fontFamily: 'monospace', marginTop: '2px' }}>{selectedPoObj.poId}</div>
                          </div>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase' }}>PO Order Date</span>
                            <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>
                              {new Date(selectedPoObj.createdAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </div>
                          </div>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase' }}>Supplier / Vendor</span>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>{selectedPoObj.vendorName}</div>
                          </div>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase' }}>PO Status</span>
                            <div style={{ marginTop: '2px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', background: '#DBEAFE', color: '#1D4ED8' }}>
                                {selectedPoObj.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', textTransform: 'uppercase', color: '#475569', fontWeight: 800, marginBottom: '6px' }}>Supplier / Vendor *</label>
                      <SearchableDropdown
                        value={grnDirectVendorId}
                        onChange={setGrnDirectVendorId}
                        options={vendors.map(v => ({ value: v._id, label: `${v.name} (${v.code})` }))}
                        placeholder="Choose supplier..."
                      />
                    </div>
                  )}

                  {/* 3. ITEM RECEIVING TABLE */}
                  {grnItems.length > 0 && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12.5px', textTransform: 'uppercase', color: '#334155', fontWeight: 800 }}>
                          Item Receiving &amp; Quality Inspection Ledger ({grnItems.length} items)
                        </span>
                        {grnFlowType === 'direct' && (
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 10px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer', borderRadius: '6px' }}
                            onClick={() => {
                              setGrnItems([...grnItems, {
                                name: '',
                                sku: '',
                                itemType: 'Medicine',
                                unit: 'Strip',
                                barcode: '',
                                qtyOrdered: 0,
                                orderedQty: 0,
                                previouslyReceivedQty: 0,
                                remainingQty: 0,
                                qtyReceived: 100,
                                rejectedQty: 0,
                                rejectionReason: '',
                                price: 10,
                                purchaseRate: 10,
                                discountPercent: 0,
                                gst: 12,
                                batchNumber: '',
                                expiryDate: '',
                                mfgDate: ''
                              }]);
                            }}
                          >
                            + Add Item
                          </button>
                        )}
                      </div>

                      <div style={{ overflowX: 'auto', border: '1.5px solid #E2E8F0', borderRadius: '10px', background: '#FFFFFF' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '1150px' }}>
                          <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0' }}>
                              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: '#475569', minWidth: '180px' }}>Item Specification</th>
                              <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 800, color: '#475569', width: '110px' }}>Barcode</th>
                              <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 800, color: '#475569', width: '100px' }}>Batch No. *</th>
                              <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 800, color: '#475569', width: '110px' }}>Mfg Date</th>
                              <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 800, color: '#475569', width: '110px' }}>Expiry Date *</th>
                              {grnFlowType === 'po' && (
                                <>
                                  <th style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#64748B', width: '60px' }}>PO Qty</th>
                                  <th style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#64748B', width: '65px' }}>Prev. Recv</th>
                                  <th style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#2563EB', width: '65px' }}>Remaining</th>
                                </>
                              )}
                              <th style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#059669', width: '75px' }}>Recv Qty *</th>
                              <th style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#DC2626', width: '70px' }}>Rej Qty</th>
                              <th style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 800, color: '#475569', width: '75px' }}>Rate (₹)</th>
                              <th style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#475569', width: '60px' }}>Disc %</th>
                              <th style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#475569', width: '50px' }}>GST %</th>
                              <th style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 800, color: '#2563EB', width: '75px' }}>Buy Price</th>
                              <th style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 900, color: '#0F172A', width: '85px' }}>Net Total</th>
                              {grnFlowType === 'direct' && <th style={{ padding: '10px 6px', width: '30px' }}></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {grnItems.map((item, idx) => {
                              const qty = Math.max(0, Number(item.qtyReceived) || 0);
                              const rate = Math.max(0, Number(item.price || item.purchaseRate) || 0);
                              const discPct = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
                              const gstRate = Math.max(0, Number(item.gst !== undefined ? item.gst : 12));

                              const gross = qty * rate;
                              const discAmt = Math.round((gross * (discPct / 100)) * 100) / 100;
                              const taxable = Math.max(0, Math.round((gross - discAmt) * 100) / 100);
                              const gstAmt = Math.round((taxable * (gstRate / 100)) * 100) / 100;
                              const netAmt = Math.round((taxable + gstAmt) * 100) / 100;
                              const unitBuyPrice = qty > 0 ? Math.round((netAmt / qty) * 100) / 100 : 0;

                              const remainingLimit = item.remainingQty !== undefined ? item.remainingQty : (item.qtyOrdered || 999999);

                              return (
                                <tr key={`grn-item-row-${idx}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                  <td style={{ padding: '8px 10px' }}>
                                    {grnFlowType === 'po' ? (
                                      <div>
                                        <div style={{ fontWeight: 800, color: '#0F172A' }}>{item.name}</div>
                                        <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', display: 'flex', gap: '6px' }}>
                                          <span style={{ fontFamily: 'monospace', color: '#2563EB', fontWeight: 700 }}>{item.sku}</span>
                                          <span>•</span>
                                          <span>{item.unit || 'Strip'}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <input 
                                          type="text" 
                                          required 
                                          placeholder="Item Name" 
                                          value={item.name} 
                                          onChange={e => {
                                            const updated = [...grnItems];
                                            updated[idx].name = e.target.value;
                                            setGrnItems(updated);
                                          }}
                                          style={{ height: '28px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '0 6px', outline: 'none' }}
                                        />
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                          <input 
                                            type="text" 
                                            placeholder="SKU" 
                                            value={item.sku} 
                                            onChange={e => {
                                              const updated = [...grnItems];
                                              updated[idx].sku = e.target.value;
                                              setGrnItems(updated);
                                            }}
                                            style={{ height: '24px', fontSize: '11px', width: '90px', fontFamily: 'monospace', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '0 4px', outline: 'none' }}
                                          />
                                          <input 
                                            type="text" 
                                            placeholder="Unit (Strip)" 
                                            value={item.unit} 
                                            onChange={e => {
                                              const updated = [...grnItems];
                                              updated[idx].unit = e.target.value;
                                              setGrnItems(updated);
                                            }}
                                            style={{ height: '24px', fontSize: '11px', width: '70px', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '0 4px', outline: 'none' }}
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </td>

                                  <td style={{ padding: '8px 6px' }}>
                                    <input 
                                      type="text" 
                                      placeholder="Barcode" 
                                      value={item.barcode || ''} 
                                      onChange={e => {
                                        const updated = [...grnItems];
                                        updated[idx].barcode = e.target.value;
                                        setGrnItems(updated);
                                      }}
                                      style={{ height: '28px', width: '100%', fontSize: '11.5px', padding: '0 6px', fontFamily: 'monospace', border: '1px solid #CBD5E1', borderRadius: '4px', outline: 'none' }}
                                    />
                                  </td>

                                  <td style={{ padding: '8px 6px' }}>
                                    <input 
                                      type="text" 
                                      required 
                                      placeholder="Batch" 
                                      value={item.batchNumber || ''} 
                                      onChange={e => {
                                        const updated = [...grnItems];
                                        updated[idx].batchNumber = e.target.value;
                                        setGrnItems(updated);
                                      }}
                                      style={{ height: '28px', width: '100%', fontSize: '11.5px', padding: '0 6px', fontWeight: 700, border: '1px solid #CBD5E1', borderRadius: '4px', outline: 'none' }}
                                    />
                                  </td>

                                  <td style={{ padding: '8px 6px' }}>
                                    <input 
                                      type="date" 
                                      max={new Date().toISOString().split('T')[0]}
                                      value={item.mfgDate || ''} 
                                      onChange={e => {
                                        const updated = [...grnItems];
                                        updated[idx].mfgDate = e.target.value;
                                        setGrnItems(updated);
                                      }}
                                      style={{ height: '28px', width: '100%', fontSize: '11px', padding: '0 4px', border: '1px solid #CBD5E1', borderRadius: '4px', outline: 'none' }}
                                    />
                                  </td>

                                  <td style={{ padding: '8px 6px' }}>
                                    <input 
                                      type="date" 
                                      required
                                      value={item.expiryDate || ''} 
                                      onChange={e => {
                                        const updated = [...grnItems];
                                        updated[idx].expiryDate = e.target.value;
                                        setGrnItems(updated);
                                      }}
                                      style={{ height: '28px', width: '100%', fontSize: '11px', padding: '0 4px', border: '1px solid #CBD5E1', borderRadius: '4px', outline: 'none' }}
                                    />
                                  </td>

                                  {grnFlowType === 'po' && (
                                    <>
                                      <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>
                                        {item.qtyOrdered || 0}
                                      </td>
                                      <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#64748B' }}>
                                        {item.previouslyReceivedQty || 0}
                                      </td>
                                      <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 800, color: '#2563EB' }}>
                                        {item.remainingQty !== undefined ? item.remainingQty : Math.max(0, (item.qtyOrdered || 0) - (item.previouslyReceivedQty || 0))}
                                      </td>
                                    </>
                                  )}

                                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                    <input 
                                      type="number" 
                                      required 
                                      min="0"
                                      max={grnFlowType === 'po' ? remainingLimit : 999999}
                                      value={item.qtyReceived !== undefined ? item.qtyReceived : ''} 
                                      onChange={e => {
                                        let val = Number(e.target.value);
                                        if (grnFlowType === 'po' && val > remainingLimit) {
                                          showToast(`Quantity received (${val}) exceeds remaining quantity (${remainingLimit})!`, 'error');
                                          val = remainingLimit;
                                        }
                                        const updated = [...grnItems];
                                        updated[idx].qtyReceived = val;
                                        setGrnItems(updated);
                                      }}
                                      style={{ height: '28px', width: '65px', fontSize: '12px', padding: '0 4px', textAlign: 'center', fontWeight: 800, color: '#059669', border: '1.5px solid #A7F3D0', borderRadius: '4px', outline: 'none' }}
                                    />
                                  </td>

                                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                    <input 
                                      type="number" 
                                      min="0"
                                      value={item.rejectedQty !== undefined ? item.rejectedQty : 0} 
                                      onChange={e => {
                                        const updated = [...grnItems];
                                        updated[idx].rejectedQty = Math.max(0, Number(e.target.value) || 0);
                                        setGrnItems(updated);
                                      }}
                                      style={{ height: '28px', width: '55px', fontSize: '12px', padding: '0 4px', textAlign: 'center', fontWeight: 800, color: '#DC2626', border: '1.5px solid #FECACA', borderRadius: '4px', outline: 'none' }}
                                      title="Rejected units will not be added to active stock"
                                    />
                                  </td>

                                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                                    <input 
                                      type="number" 
                                      step="0.01"
                                      min="0"
                                      required
                                      value={item.price !== undefined ? item.price : item.purchaseRate || 0} 
                                      onChange={e => {
                                        const updated = [...grnItems];
                                        const p = Math.max(0, Number(e.target.value) || 0);
                                        updated[idx].price = p;
                                        updated[idx].purchaseRate = p;
                                        setGrnItems(updated);
                                      }}
                                      style={{ height: '28px', width: '70px', fontSize: '12px', padding: '0 6px', textAlign: 'right', fontWeight: 700, border: '1px solid #CBD5E1', borderRadius: '4px', outline: 'none' }}
                                    />
                                  </td>

                                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                    <input 
                                      type="number" 
                                      min="0"
                                      max="100"
                                      value={item.discountPercent !== undefined ? item.discountPercent : 0} 
                                      onChange={e => {
                                        const updated = [...grnItems];
                                        updated[idx].discountPercent = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                        setGrnItems(updated);
                                      }}
                                      style={{ height: '28px', width: '50px', fontSize: '12px', padding: '0 4px', textAlign: 'center', border: '1px solid #CBD5E1', borderRadius: '4px', outline: 'none' }}
                                    />
                                  </td>

                                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                    <input 
                                      type="number" 
                                      min="0"
                                      max="100"
                                      value={item.gst !== undefined ? item.gst : 12} 
                                      onChange={e => {
                                        const updated = [...grnItems];
                                        updated[idx].gst = Math.max(0, Number(e.target.value) || 0);
                                        setGrnItems(updated);
                                      }}
                                      style={{ height: '28px', width: '45px', fontSize: '12px', padding: '0 4px', textAlign: 'center', border: '1px solid #CBD5E1', borderRadius: '4px', outline: 'none' }}
                                    />
                                  </td>

                                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#2563EB', fontSize: '12px' }}>
                                    ₹{unitBuyPrice.toFixed(2)}
                                  </td>

                                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 900, color: '#0F172A', fontSize: '13px' }}>
                                    ₹{netAmt.toFixed(2)}
                                  </td>

                                  {grnFlowType === 'direct' && (
                                    <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                                      <button 
                                        type="button" 
                                        style={{ background: 'none', border: 'none', color: '#EF4444', fontWeight: 800, cursor: 'pointer' }}
                                        onClick={() => setGrnItems(grnItems.filter((_, i) => i !== idx))}
                                      >
                                        ✕
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 4. INVOICE DETAILS & ATTACHMENT CARD */}
                  <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 900, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                        Supplier Invoice Details
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748B' }}>
                        (Verify supplier bill information against physical invoice document)
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', alignItems: 'flex-start' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11.5px', textTransform: 'uppercase', color: '#475569', fontWeight: 800, marginBottom: '6px' }}>Invoice Number</label>
                        <input 
                          type="text" 
                          placeholder="e.g. INV-2026-9901" 
                          value={grnInvoiceNumber} 
                          onChange={e => setGrnInvoiceNumber(e.target.value)}
                          style={{ width: '100%', height: '36px', fontSize: '13px', fontWeight: 700, border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0 8px', outline: 'none' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '11.5px', textTransform: 'uppercase', color: '#475569', fontWeight: 800, marginBottom: '6px' }}>Invoice Date</label>
                        <input 
                          type="date" 
                          value={grnInvoiceDate} 
                          onChange={e => setGrnInvoiceDate(e.target.value)}
                          style={{ width: '100%', height: '36px', fontSize: '13px', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0 8px', outline: 'none' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '11.5px', textTransform: 'uppercase', color: '#475569', fontWeight: 800, marginBottom: '6px' }}>Billed Invoice Amount (₹)</label>
                        <input 
                          type="number" 
                          step="0.01"
                          placeholder="e.g. 5250.00" 
                          value={grnInvoiceAmount} 
                          onChange={e => setGrnInvoiceAmount(e.target.value)}
                          style={{ width: '100%', height: '36px', fontSize: '13px', fontWeight: 800, border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0 8px', outline: 'none' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '11.5px', textTransform: 'uppercase', color: '#475569', fontWeight: 800, marginBottom: '6px' }}>Invoice Document Attachment</label>
                        
                        {!grnInvoiceFileName ? (
                          <div>
                            <input 
                              type="file" 
                              id="pharmacy-grn-invoice-file-input"
                              accept="image/*,application/pdf"
                              style={{ display: 'none' }}
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setGrnIsUploading(true);
                                  setGrnUploadProgress(0);
                                  let p = 0;
                                  const timer = setInterval(() => {
                                    p += 25;
                                    setGrnUploadProgress(p);
                                    if (p >= 100) {
                                      clearInterval(timer);
                                      setGrnIsUploading(false);
                                      const reader = new FileReader();
                                      reader.onload = (event) => {
                                        setGrnInvoiceFile(file);
                                        setGrnInvoiceFileName(event.target.result || file.name);
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }, 80);
                                }
                              }}
                            />
                            <button 
                              type="button" 
                              style={{ height: '36px', width: '100%', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 700, background: 'white', border: '1px solid #CBD5E1', borderRadius: '6px', cursor: 'pointer', color: '#334155' }}
                              onClick={() => document.getElementById('pharmacy-grn-invoice-file-input')?.click()}
                            >
                              + Add Invoice Document
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: '8px', height: '36px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: '#166534', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                              ✓ {grnInvoiceFile ? grnInvoiceFile.name : 'Invoice Attached'}
                            </span>
                            <button 
                              type="button" 
                              style={{ background: 'none', border: 'none', color: '#DC2626', fontWeight: 800, cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                              onClick={() => {
                                setGrnInvoiceFile(null);
                                setGrnInvoiceFileName('');
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        )}

                        {grnIsUploading && (
                          <div style={{ marginTop: '6px' }}>
                            <div style={{ height: '4px', background: '#E2E8F0', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ width: `${grnUploadProgress}%`, height: '100%', background: '#2563EB', transition: 'width 0.1s ease' }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 5. NOTES & SUMMARY DUAL ROW */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', alignItems: 'stretch' }}>
                    
                    {/* Left: Notes & Discrepancy Remarks */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <label style={{ display: 'block', fontSize: '11.5px', textTransform: 'uppercase', color: '#475569', fontWeight: 800, marginBottom: '6px' }}>
                        Inspection Notes / Discrepancy Remarks
                      </label>
                      <textarea 
                        placeholder="Add inspection observations, batch discrepancies, damaged packaging notes..." 
                        value={grnNotes} 
                        onChange={e => setGrnNotes(e.target.value)}
                        style={{ flex: 1, minHeight: '110px', fontSize: '13px', padding: '10px', border: '1px solid #CBD5E1', borderRadius: '6px', outline: 'none' }}
                      />
                    </div>

                    {/* Right: Authoritative GRN Summary & Variance Card */}
                    <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: '2px', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>
                        GRN Financial Summary
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>
                        <span>Gross Subtotal:</span>
                        <strong style={{ color: '#0F172A' }}>₹{liveTotals.subtotal.toFixed(2)}</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>
                        <span>Total Line Discount:</span>
                        <strong style={{ color: '#16A34A' }}>−₹{liveTotals.totalDiscount.toFixed(2)}</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>
                        <span>Taxable Goods Base:</span>
                        <strong style={{ color: '#0F172A' }}>₹{liveTotals.taxableBase.toFixed(2)}</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>
                        <span>Total GST Tax Burden:</span>
                        <strong style={{ color: '#EA580C' }}>+₹{liveTotals.totalGst.toFixed(2)}</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #CBD5E1', paddingTop: '8px', marginTop: '4px', fontSize: '16px', fontWeight: 900, color: '#0F172A' }}>
                        <span>Calculated GRN Amount:</span>
                        <span style={{ color: '#2563EB' }}>₹{liveTotals.grandTotal.toFixed(2)}</span>
                      </div>

                      {invoicedVal > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: varianceVal === 0 ? '#DCFCE7' : '#FEF3C7', border: `1px solid ${varianceVal === 0 ? '#86EFAC' : '#FDE68A'}`, padding: '6px 10px', borderRadius: '8px', marginTop: '4px' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: 800, color: varianceVal === 0 ? '#166534' : '#92400E' }}>
                            {varianceVal === 0 ? '✓ Invoice Matched' : `Invoice Variance (${varianceVal > 0 ? '+' : ''}₹${varianceVal.toFixed(2)})`}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 900, color: varianceVal === 0 ? '#166534' : '#92400E' }}>
                            Billed: ₹{invoicedVal.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => setShowGRNModal(false)}
                    style={{ height: '40px', padding: '0 20px', borderRadius: '8px', border: '1px solid #CBD5E1', background: 'white', color: '#475569', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Cancel
                  </button>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      type="button" 
                      disabled={grnItems.length === 0}
                      style={{ height: '40px', padding: '0 18px', borderRadius: '8px', border: '1px solid #2563EB', background: 'transparent', color: '#2563EB', fontWeight: 800, cursor: grnItems.length > 0 ? 'pointer' : 'not-allowed' }}
                      onClick={(e) => handleSaveGRN(e, 'Draft')}
                    >
                      Save as Draft
                    </button>
                    <button 
                      type="submit" 
                      disabled={grnItems.length === 0 || (grnFlowType === 'direct' && !grnDirectVendorId)}
                      style={{ height: '40px', padding: '0 22px', borderRadius: '8px', background: (grnItems.length > 0 && (grnFlowType === 'po' || grnDirectVendorId)) ? '#059669' : '#CBD5E1', color: 'white', border: 'none', fontWeight: 800, cursor: (grnItems.length > 0 && (grnFlowType === 'po' || grnDirectVendorId)) ? 'pointer' : 'not-allowed' }}
                    >
                      Generate GRN &amp; Update Inventory
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* MODAL: RESOLVE REPLENISHMENT TICKET */}
      {showResolveTicketModal && selectedTicket && (
        <div className="modal-overlay" data-lenis-prevent style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }} onClick={() => setShowResolveTicketModal(false)}>
          <div className="modal-box glass-card" style={{ width: '95%', maxWidth: '500px', background: 'white', padding: '28px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Resolve Replenishment Ticket</h2>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} onClick={() => setShowResolveTicketModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form onSubmit={handleResolveTicket}>
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>MEDICINE NAME</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>{selectedTicket.medicineName}</span>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>ADMIN COMMENT</span>
                <p style={{ fontSize: '13px', color: '#334155', background: '#F8FAFC', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0', margin: 0 }}>{selectedTicket.adminComment}</p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', display: 'block', marginBottom: '6px' }}>
                  Resolution / Sourcing Reason <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <textarea
                  className="form-control"
                  required
                  rows="4"
                  placeholder="e.g. Sourced 100 units from Satyam Distributors. Stock replenished."
                  value={ticketResolutionReason}
                  onChange={(e) => setTicketResolutionReason(e.target.value)}
                  style={{ width: '100%', padding: '10px', fontSize: '13px', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowResolveTicketModal(false)}
                  style={{ height: '38px', padding: '0 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: 'white', fontWeight: 700, cursor: 'pointer', color: '#475569' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ height: '38px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#059669', color: 'white', fontWeight: 800, cursor: 'pointer' }}
                >
                  Resolve & Add Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Indent Order Summary Modal */}
      {showIndentModal && selectedIndent && (
        <div onClick={() => { setShowIndentModal(false); setSelectedIndent(null); setSupplyInputMap({}); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '750px', boxShadow: '0 24px 64px rgba(0,0,0,0.15)', animation: 'slideUp 0.3s ease-out', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A' }}>Indent Fulfillment & Review</div>
                <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>Requisition ID: {selectedIndent.indentId}</div>
              </div>
              <button onClick={() => { setShowIndentModal(false); setSelectedIndent(null); setSupplyInputMap({}); }} style={{ background: '#F1F5F9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '16px', fontWeight: 'bold' }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingRight: '4px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Department</span>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>{selectedIndent.department}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Requested Date</span>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>
                    {new Date(selectedIndent.createdAt || selectedIndent.requiredDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Requested By</span>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>{selectedIndent.requestedBy}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Status:</span>
                <span style={{
                  background: selectedIndent.status === 'Received' || selectedIndent.status === 'Fulfilled' ? '#D1FAE5' : selectedIndent.status === 'Pending' ? '#FEF3C7' : selectedIndent.status === 'Approved' ? '#EFF6FF' : selectedIndent.status === 'Partially Fulfilled' ? '#FFF3E0' : '#FEE2E2',
                  color: selectedIndent.status === 'Received' || selectedIndent.status === 'Fulfilled' ? '#065F46' : selectedIndent.status === 'Pending' ? '#D97706' : selectedIndent.status === 'Approved' ? '#2563EB' : selectedIndent.status === 'Partially Fulfilled' ? '#E65100' : '#991B1B',
                  padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800
                }}>{selectedIndent.status}</span>
                {selectedIndent.priority === 'Urgent' && (
                  <span style={{ background: '#FEE2E2', color: '#DC2626', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>⚡ Urgent</span>
                )}
              </div>

              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#475569', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Requested Consumables & Drugs</h4>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Specify the quantity to supply now (deducts from pharmacy inventory)</span>
                </div>

                <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Item Name</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Requested</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#2563EB' }}>Approved</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#16A34A' }}>Supplied</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#D97706' }}>Stock</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#0F172A' }}>Supply Now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedIndent.items || []).map((item, idx) => {
                        const itemKey = item._id || item.name;
                        const isApproved = item.approvedQty !== null && item.approvedQty !== undefined;
                        const reqQty = Number(item.requiredQty) || 0;
                        const appQty = isApproved ? Number(item.approvedQty) : 0;
                        const supQty = Number(item.suppliedQty || 0);
                        const remQty = isApproved ? Math.max(0, appQty - supQty) : 0;

                        const matchedMed = (inventory || []).find(m => m.name && m.name.trim().toLowerCase() === item.name.trim().toLowerCase());
                        const curStock = matchedMed ? Number(matchedMed.stock || 0) : 0;
                        const maxAllowed = Math.min(remQty, curStock);
                        const currentInput = supplyInputMap[itemKey] !== undefined ? supplyInputMap[itemKey] : (remQty > 0 && curStock > 0 ? String(maxAllowed) : '0');

                        const isActionDisabled = !isApproved || remQty === 0 || ['Received', 'Fulfilled', 'Cannot Fulfill', 'Rejected'].includes(selectedIndent.status);

                        return (
                          <tr key={idx} style={{ borderBottom: idx === (selectedIndent.items || []).length - 1 ? 'none' : '1px solid #F1F5F9' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                              <div>{item.name}</div>
                              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>{item.category || item.unit || 'Strip'}</div>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>
                              {reqQty}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#2563EB' }}>
                              {isApproved ? appQty : <span style={{ color: '#94A3B8', fontSize: '11px' }}>Pending</span>}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#16A34A' }}>
                              {supQty}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: curStock === 0 ? '#DC2626' : curStock <= 20 ? '#D97706' : '#1E293B' }}>
                              {curStock}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              {isActionDisabled ? (
                                <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700 }}>
                                  {remQty === 0 ? '✓ Complete' : !isApproved ? 'Unapproved' : 'Closed'}
                                </span>
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  max={maxAllowed}
                                  value={currentInput}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setSupplyInputMap(prev => ({ ...prev, [itemKey]: val }));
                                  }}
                                  style={{
                                    width: '75px',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontWeight: 800,
                                    fontSize: '13px',
                                    textAlign: 'center',
                                    background: maxAllowed === 0 ? '#F8FAFC' : '#FFFFFF',
                                    color: '#0F172A'
                                  }}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedIndent.purpose && (
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '14px' }}>
                  <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Remarks/Purpose:</span>
                  <div style={{ fontSize: '13px', color: '#475569', marginTop: '3px', fontStyle: 'italic' }}>{selectedIndent.purpose}</div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0 0 0', borderTop: '1px solid #F1F5F9', flexShrink: 0, marginTop: '20px', flexWrap: 'wrap', gap: '10px' }}>
              <button
                onClick={() => { setShowIndentModal(false); setSelectedIndent(null); setSupplyInputMap({}); }}
                style={{ height: '40px', padding: '0 16px', borderRadius: '8px', border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#64748B' }}
              >
                Close
              </button>

              {!['Received', 'Fulfilled', 'Cannot Fulfill', 'Rejected'].includes(selectedIndent.status) && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {/* Cannot Fulfill Button */}
                  <button
                    disabled={loading}
                    onClick={async () => {
                      try {
                        setLoading(true);
                        const response = await api.put(`/indents/${selectedIndent._id}`, { status: 'Cannot Fulfill' });
                        const updated = response.data || { ...selectedIndent, status: 'Cannot Fulfill' };
                        setIndents(prev => prev.map(ind => ind._id === selectedIndent._id ? updated : ind));
                        setSelectedIndent(null);
                        setShowIndentModal(false);
                        setSupplyInputMap({});
                        showToast('Indent marked as Cannot Fulfill');
                      } catch (err) {
                        console.error(err);
                        showToast(err.response?.data?.error || 'Failed to update indent status', 'error');
                      } finally {
                        setLoading(false);
                      }
                    }}
                    style={{ height: '40px', padding: '0 14px', borderRadius: '8px', border: 'none', background: '#EF4444', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    Cannot Fulfill
                  </button>

                  {/* Awaiting Stock Button */}
                  <button
                    disabled={loading}
                    onClick={async () => {
                      try {
                        setLoading(true);
                        const response = await api.put(`/indents/${selectedIndent._id}`, { status: 'Awaiting Stock', suppliedItems: [] });
                        const updated = response.data || { ...selectedIndent, status: 'Awaiting Stock' };
                        setIndents(prev => prev.map(ind => ind._id === selectedIndent._id ? updated : ind));
                        setSelectedIndent(null);
                        setShowIndentModal(false);
                        setSupplyInputMap({});
                        showToast('Indent marked as Awaiting Stock');
                      } catch (err) {
                        console.error(err);
                        showToast(err.response?.data?.error || 'Failed to update indent status', 'error');
                      } finally {
                        setLoading(false);
                      }
                    }}
                    style={{ height: '40px', padding: '0 14px', borderRadius: '8px', border: 'none', background: '#64748B', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    Awaiting Stock
                  </button>

                  {/* Supply & Fulfill Action Button */}
                  <button
                    disabled={loading}
                    onClick={async () => {
                      try {
                        setLoading(true);
                        const suppliedItems = (selectedIndent.items || []).map(it => {
                          const itemKey = it._id || it.name;
                          const isApproved = it.approvedQty !== null && it.approvedQty !== undefined;
                          const appQty = isApproved ? Number(it.approvedQty) : 0;
                          const supQty = Number(it.suppliedQty || 0);
                          const remQty = isApproved ? Math.max(0, appQty - supQty) : 0;
                          const matchedMed = (inventory || []).find(m => m.name && m.name.trim().toLowerCase() === it.name.trim().toLowerCase());
                          const curStock = matchedMed ? Number(matchedMed.stock || 0) : 0;
                          const maxAllowed = Math.min(remQty, curStock);

                          const rawVal = supplyInputMap[itemKey] !== undefined ? supplyInputMap[itemKey] : (remQty > 0 && curStock > 0 ? String(maxAllowed) : '0');
                          const numVal = Number(rawVal) || 0;
                          return { itemId: it._id, name: it.name, supplyQty: numVal };
                        });

                        // Local validation check
                        for (const s of suppliedItems) {
                          if (s.supplyQty < 0) {
                            showToast(`Supply quantity cannot be negative for ${s.name}`, 'error');
                            setLoading(false);
                            return;
                          }
                          const it = (selectedIndent.items || []).find(i => i.name === s.name);
                          const isApproved = it && it.approvedQty !== null && it.approvedQty !== undefined;
                          if (!isApproved) {
                            showToast(`Item ${s.name} is not approved for fulfillment`, 'error');
                            setLoading(false);
                            return;
                          }
                          const rem = Math.max(0, Number(it.approvedQty) - (Number(it.suppliedQty) || 0));
                          if (s.supplyQty > rem) {
                            showToast(`Supply quantity (${s.supplyQty}) exceeds remaining approved quantity (${rem}) for ${s.name}`, 'error');
                            setLoading(false);
                            return;
                          }
                          const matchedMed = (inventory || []).find(m => m.name && m.name.trim().toLowerCase() === s.name.trim().toLowerCase());
                          const curStock = matchedMed ? Number(matchedMed.stock || 0) : 0;
                          if (s.supplyQty > curStock) {
                            showToast(`Supply quantity (${s.supplyQty}) exceeds available stock (${curStock}) for ${s.name}`, 'error');
                            setLoading(false);
                            return;
                          }
                        }

                        const response = await api.put(`/indents/${selectedIndent._id}`, { suppliedItems });
                        const updated = response.data;
                        setIndents(prev => prev.map(ind => ind._id === selectedIndent._id ? updated : ind));
                        setSelectedIndent(null);
                        setShowIndentModal(false);
                        setSupplyInputMap({});
                        showToast('Requisition fulfilled successfully!');
                        if (typeof fetchInventory === 'function') fetchInventory();
                      } catch (err) {
                        console.error(err);
                        showToast(err.response?.data?.error || 'Failed to fulfill requisition', 'error');
                      } finally {
                        setLoading(false);
                      }
                    }}
                    style={{ height: '40px', padding: '0 18px', borderRadius: '8px', border: 'none', background: '#10B981', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Supply & Fulfill
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: STRUCTURED GRN DETAILS & INSPECTION VIEW */}
      {selectedGrnDetails && (() => {
        const detailTotals = (selectedGrnDetails.items || []).reduce((acc, item) => {
          const qty = Number(item.qtyReceived) || 0;
          const rate = Number(item.price || item.purchaseRate) || 0;
          const discPct = Number(item.discountPercent) || 0;
          const gstRate = item.gst !== undefined ? Number(item.gst) : 12;

          const gross = qty * rate;
          const discAmt = item.discountAmount !== undefined ? Number(item.discountAmount) : Math.round((gross * (discPct / 100)) * 100) / 100;
          const taxable = Math.max(0, gross - discAmt);
          const gstAmt = item.gstAmount !== undefined ? Number(item.gstAmount) : Math.round((taxable * (gstRate / 100)) * 100) / 100;
          const net = item.netAmount !== undefined ? Number(item.netAmount) : taxable + gstAmt;

          return {
            subtotal: acc.subtotal + gross,
            totalDiscount: acc.totalDiscount + discAmt,
            totalGst: acc.totalGst + gstAmt,
            grandTotal: acc.grandTotal + net
          };
        }, {
          subtotal: 0,
          totalDiscount: selectedGrnDetails.totalDiscount || 0,
          totalGst: selectedGrnDetails.totalGst || 0,
          grandTotal: selectedGrnDetails.grandTotal || 0
        });

        const invoiceAmt = Number(selectedGrnDetails.invoiceAmount) || 0;
        const varianceVal = invoiceAmt > 0 ? Math.round(((selectedGrnDetails.grandTotal || detailTotals.grandTotal) - invoiceAmt) * 100) / 100 : 0;

        return (
          <div className="modal-overlay" data-lenis-prevent style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }} onClick={() => setSelectedGrnDetails(null)}>
            <div className="modal-box glass-card" style={{ width: '95%', maxWidth: '980px', maxHeight: '90vh', background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', position: 'relative', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Goods Receipt Note (GRN) Inspection</h2>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Verified inspection breakdown and inventory intake record</div>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} onClick={() => setSelectedGrnDetails(null)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                
                {/* Header Information Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>GRN Identifier</span>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#059669', fontFamily: 'monospace', marginTop: '2px' }}>{selectedGrnDetails.grnId}</div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Location: {selectedGrnDetails.grnLocation || 'Main Pharmacy Store'}</div>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Reference Order</span>
                    <div style={{ fontSize: '15px', fontWeight: 900, color: '#2563EB', fontFamily: 'monospace', marginTop: '2px' }}>
                      {selectedGrnDetails.poNumber || 'Direct Purchase'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                      Date: {new Date(selectedGrnDetails.receivedDate || selectedGrnDetails.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Supplier / Vendor</span>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>{selectedGrnDetails.vendorName}</div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Received By: {selectedGrnDetails.receivedBy || 'Staff'}</div>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Supplier Invoice</span>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                      {selectedGrnDetails.invoiceNumber ? `No. ${selectedGrnDetails.invoiceNumber}` : (selectedGrnDetails.invoiceUrl ? 'Doc Attached' : '—')}
                    </div>
                    {invoiceAmt > 0 && (
                      <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                        Billed: ₹{invoiceAmt.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Items Breakdown Table */}
                <div>
                  <span style={{ fontSize: '12px', color: '#475569', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                    Received Items &amp; Quality Specifications
                  </span>
                  <div style={{ overflowX: 'auto', border: '1.5px solid #E2E8F0', borderRadius: '10px', background: '#FFFFFF' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left', minWidth: '850px' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0' }}>
                          <th style={{ padding: '8px 12px', color: '#475569', fontWeight: 800 }}>Medicine / Item</th>
                          <th style={{ padding: '8px 8px', color: '#475569', fontWeight: 800 }}>Batch / Expiry</th>
                          <th style={{ padding: '8px 8px', color: '#475569', fontWeight: 800, textAlign: 'center' }}>Ord. Qty</th>
                          <th style={{ padding: '8px 8px', color: '#475569', fontWeight: 800, textAlign: 'center' }}>Recv Qty</th>
                          <th style={{ padding: '8px 8px', color: '#475569', fontWeight: 800, textAlign: 'center' }}>Rej. Qty</th>
                          <th style={{ padding: '8px 8px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Rate (₹)</th>
                          <th style={{ padding: '8px 8px', color: '#475569', fontWeight: 800, textAlign: 'center' }}>Disc %</th>
                          <th style={{ padding: '8px 8px', color: '#475569', fontWeight: 800, textAlign: 'center' }}>GST</th>
                          <th style={{ padding: '8px 8px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Buy Price</th>
                          <th style={{ padding: '8px 12px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Net Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedGrnDetails.items || []).map((item, idx) => {
                          const qty = item.qtyReceived || 0;
                          const price = Number(item.price || item.purchaseRate) || 0;
                          const discPct = item.discountPercent || 0;
                          const gstRate = item.gst !== undefined ? item.gst : 12;
                          const gross = qty * price;
                          const discAmt = item.discountAmount !== undefined ? item.discountAmount : (gross * (discPct / 100));
                          const taxable = Math.max(0, gross - discAmt);
                          const gstAmt = item.gstAmount !== undefined ? item.gstAmount : (taxable * (gstRate / 100));
                          const totalAmt = item.netAmount !== undefined ? item.netAmount : (taxable + gstAmt);
                          const buyRate = item.buyPrice !== undefined ? item.buyPrice : (qty > 0 ? totalAmt / qty : 0);

                          return (
                            <tr key={`grn-detail-${idx}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                                <div style={{ color: '#0F172A' }}>{item.name}</div>
                                <div style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>{item.sku || '—'}</div>
                              </td>
                              <td style={{ padding: '10px 8px', fontSize: '11.5px' }}>
                                <div style={{ fontWeight: 800, color: '#334155' }}>Batch: {item.batchNumber || '—'}</div>
                                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                                  Exp: {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '—'}
                                </div>
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', color: '#64748B' }}>
                                {item.qtyOrdered !== undefined ? item.qtyOrdered : '—'}
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 800, color: '#059669' }}>
                                {qty}
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: item.rejectedQty > 0 ? '#DC2626' : '#94A3B8' }}>
                                {item.rejectedQty || 0}
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>
                                ₹{price.toFixed(2)}
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', color: '#64748B' }}>
                                {discPct}%
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', color: '#64748B' }}>
                                {gstRate}%
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#2563EB' }}>
                                ₹{Number(buyRate).toFixed(2)}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, color: '#0F172A' }}>
                                ₹{Number(totalAmt).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Summary & Inspection Remarks */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                  {selectedGrnDetails.notes && (
                    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
                      <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Inspection Remarks</span>
                      <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#334155', fontStyle: 'italic' }}>"{selectedGrnDetails.notes}"</p>
                    </div>
                  )}

                  <div style={{ background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '14px', marginLeft: 'auto', width: '100%', maxWidth: '360px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>
                      <span>Subtotal (Gross):</span>
                      <span>₹{(selectedGrnDetails.grandTotal ? (selectedGrnDetails.grandTotal + (selectedGrnDetails.totalDiscount || 0) - (selectedGrnDetails.totalGst || 0)) : detailTotals.subtotal).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px', color: '#16A34A', fontWeight: 700 }}>
                      <span>Total Discount:</span>
                      <span>−₹{(selectedGrnDetails.totalDiscount || detailTotals.totalDiscount).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px', color: '#EA580C', fontWeight: 700 }}>
                      <span>Total GST Burden:</span>
                      <span>+₹{(selectedGrnDetails.totalGst || detailTotals.totalGst).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #CBD5E1', paddingTop: '6px', marginTop: '4px', fontSize: '15px', fontWeight: 900, color: '#0F172A' }}>
                      <span>GRN Total:</span>
                      <span style={{ color: '#2563EB' }}>₹{(selectedGrnDetails.grandTotal || detailTotals.grandTotal).toFixed(2)}</span>
                    </div>
                    {invoiceAmt > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '12px', fontWeight: 700, color: varianceVal === 0 ? '#16A34A' : '#D97706' }}>
                        <span>Billed Invoice:</span>
                        <span>₹{invoiceAmt.toFixed(2)} {varianceVal !== 0 ? `(Diff: ₹${varianceVal.toFixed(2)})` : '✓'}</span>
                      </div>
                    )}
                  </div>
                </div>

              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
                {(() => {
                  const ageMs = Date.now() - new Date(selectedGrnDetails.createdAt || selectedGrnDetails.receivedDate || Date.now()).getTime();
                  const isEditable = ageMs <= 24 * 60 * 60 * 1000;
                  return isEditable ? (
                    <button 
                      type="button" 
                      style={{ padding: '8px 20px', borderRadius: '8px', background: '#0EA5E9', color: 'white', fontWeight: 800, cursor: 'pointer', border: 'none' }} 
                      onClick={() => {
                        const toEdit = selectedGrnDetails;
                        setSelectedGrnDetails(null);
                        handleOpenEditGrn(toEdit);
                      }}
                    >
                      Edit GRN
                    </button>
                  ) : (
                    <button 
                      type="button" 
                      style={{ padding: '8px 20px', borderRadius: '8px', background: '#F1F5F9', color: '#94A3B8', fontWeight: 700, cursor: 'not-allowed', border: '1px solid #CBD5E1' }} 
                      disabled
                      title="Editing period expired (24 hours from creation)"
                    >
                      Editing Period Expired
                    </button>
                  );
                })()}
                <button 
                  type="button" 
                  style={{ padding: '8px 20px', borderRadius: '8px', background: '#10B981', color: 'white', fontWeight: 800, cursor: 'pointer', border: 'none' }} 
                  onClick={() => printGRN(selectedGrnDetails, currentUser?.tenantName || 'CUROXA HEALTHCARE')}
                >
                  Download PDF
                </button>
                <button type="button" className="btn btn-secondary" style={{ padding: '8px 20px', borderRadius: '8px', background: '#334155', color: 'white', fontWeight: 800, cursor: 'pointer', border: 'none' }} onClick={() => setSelectedGrnDetails(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* DIRECT SALE POS MODAL */}
      {showDirectSaleModal && (
        <div
          onClick={() => setShowDirectSaleModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 9200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '24px',
              width: '100%',
              maxWidth: '850px',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              animation: 'fadeIn 0.2s ease-out'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#EEF2FF', color: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                </div>
                <div>
                  <h3 style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Direct Pharmacy Sale</h3>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>Over-The-Counter (OTC) Direct Dispense • Self / No Doctor</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowDirectSaleModal(false)}
                style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '14px', fontWeight: 'bold' }}
              >✕</button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }} data-lenis-prevent>
              
              {/* Customer Type Selector & Doctor Pill */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Customer Type
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setDirectSaleCustomerType('WALK_IN')}
                      style={{
                        flex: 1,
                        padding: '9px 12px',
                        borderRadius: '10px',
                        border: directSaleCustomerType === 'WALK_IN' ? '2px solid #2563EB' : '1px solid #CBD5E1',
                        background: directSaleCustomerType === 'WALK_IN' ? '#EFF6FF' : 'white',
                        color: directSaleCustomerType === 'WALK_IN' ? '#2563EB' : '#475569',
                        fontWeight: 800,
                        fontSize: '12.5px',
                        cursor: 'pointer'
                      }}
                    >
                      Walk-in Customer
                    </button>

                    <button
                      type="button"
                      onClick={() => setDirectSaleCustomerType('REGISTERED')}
                      style={{
                        flex: 1,
                        padding: '9px 12px',
                        borderRadius: '10px',
                        border: directSaleCustomerType === 'REGISTERED' ? '2px solid #2563EB' : '1px solid #CBD5E1',
                        background: directSaleCustomerType === 'REGISTERED' ? '#EFF6FF' : 'white',
                        color: directSaleCustomerType === 'REGISTERED' ? '#2563EB' : '#475569',
                        fontWeight: 800,
                        fontSize: '12.5px',
                        cursor: 'pointer'
                      }}
                    >
                      Registered Patient
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Doctor / Source
                  </label>
                  <div style={{ padding: '9px 14px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#475569', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#64748B' }}></span>
                    Self / No Doctor (Direct OTC)
                  </div>
                </div>
              </div>

              {/* Customer Inputs */}
              {directSaleCustomerType === 'WALK_IN' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', marginBottom: '24px', background: '#F8FAFC', padding: '16px', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Customer Name (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Walk-in Customer"
                      value={directSaleCustomerName}
                      onChange={(e) => setDirectSaleCustomerName(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13.5px', fontWeight: 600, color: '#0F172A', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Mobile Number (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="10-digit mobile"
                      value={directSaleCustomerMobile}
                      onChange={(e) => setDirectSaleCustomerMobile(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13.5px', fontWeight: 600, color: '#0F172A', outline: 'none' }}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '24px', background: '#F8FAFC', padding: '16px', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                      Search & Select Registered Patient *
                    </label>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                      {(patients || []).length} registered patients
                    </span>
                  </div>

                  {directSaleSelectedPatientId ? (
                    (() => {
                      const sel = (patients || []).find(p => p._id === directSaleSelectedPatientId);
                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#EFF6FF', border: '1.5px solid #93C5FD', padding: '12px 16px', borderRadius: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#2563EB', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '14px' }}>
                              {(sel?.name || 'P')[0]?.toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '14px', color: '#0F172A' }}>
                                {sel?.name || 'Selected Patient'}
                              </div>
                              <div style={{ fontSize: '12px', color: '#475569', marginTop: '1px', fontWeight: 600 }}>
                                <span style={{ fontFamily: 'monospace', color: '#2563EB', fontWeight: 700 }}>{sel?.uhid || sel?.patientId || 'ID'}</span> • {sel?.contact || sel?.phone || 'No phone'} {sel?.age ? `• ${sel.age} Y` : ''} {sel?.gender || ''}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setDirectSaleSelectedPatientId('');
                              setDirectSaleCustomerName('');
                              setDirectSaleCustomerMobile('');
                              setDirectSaleSearchPatientText('');
                            }}
                            style={{ padding: '6px 12px', background: 'white', border: '1px solid #BFDBFE', borderRadius: '8px', color: '#2563EB', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                          >
                            Change Patient
                          </button>
                        </div>
                      );
                    })()
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'relative' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input
                          ref={directSaleSearchPatientInputRef}
                          type="text"
                          placeholder="Type to search patient by name, mobile, or Patient ID / UHID..."
                          value={directSaleSearchPatientText}
                          onChange={(e) => {
                            setDirectSaleSearchPatientText(e.target.value);
                            setDirectSalePatientHighlightIndex(0);
                          }}
                          onKeyDown={(e) => {
                            const q = (directSaleSearchPatientText || '').trim().toLowerCase();
                            const filtered = (patients || []).filter(p => {
                              if (!q) return true;
                              return (p.name && p.name.toLowerCase().includes(q)) ||
                                     (p.contact && String(p.contact).includes(q)) ||
                                     (p.phone && String(p.phone).includes(q)) ||
                                     (p.patientId && p.patientId.toLowerCase().includes(q)) ||
                                     (p.uhid && p.uhid.toLowerCase().includes(q));
                            }).slice(0, 10);

                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              if (filtered.length > 0) {
                                setDirectSalePatientHighlightIndex(prev => (prev + 1) % filtered.length);
                              }
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              if (filtered.length > 0) {
                                setDirectSalePatientHighlightIndex(prev => (prev - 1 + filtered.length) % filtered.length);
                              }
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              if (filtered.length > 0) {
                                const sel = filtered[directSalePatientHighlightIndex] || filtered[0];
                                setDirectSaleSelectedPatientId(sel._id);
                                setDirectSaleCustomerName(sel.name);
                                setDirectSaleCustomerMobile(sel.contact || sel.phone || '');
                                setDirectSaleSearchPatientText('');
                                setDirectSalePatientHighlightIndex(0);
                                setTimeout(() => {
                                  directSaleSearchMedInputRef.current?.focus();
                                }, 50);
                              }
                            }
                          }}
                          style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '13.5px', fontWeight: 600, color: '#0F172A', outline: 'none', background: 'white' }}
                          autoFocus
                        />
                      </div>

                      {/* Dropdown list */}
                      {(() => {
                        const q = (directSaleSearchPatientText || '').trim().toLowerCase();
                        const filtered = (patients || []).filter(p => {
                          if (!q) return true;
                          return (p.name && p.name.toLowerCase().includes(q)) ||
                                 (p.contact && String(p.contact).includes(q)) ||
                                 (p.phone && String(p.phone).includes(q)) ||
                                 (p.patientId && p.patientId.toLowerCase().includes(q)) ||
                                 (p.uhid && p.uhid.toLowerCase().includes(q));
                        }).slice(0, 10);

                        return (
                          <div style={{ marginTop: '6px', background: 'white', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', border: '1px solid #E2E8F0', maxHeight: '200px', overflowY: 'auto' }}>
                            {filtered.length === 0 ? (
                              <div style={{ padding: '12px 16px', fontSize: '13px', color: '#94A3B8', fontWeight: 600, textAlign: 'center' }}>
                                No registered patients found matching "{directSaleSearchPatientText}"
                              </div>
                            ) : (
                              filtered.map((p, idx) => {
                                const isHighlighted = idx === directSalePatientHighlightIndex;
                                return (
                                  <div
                                    key={p._id}
                                    onClick={() => {
                                      setDirectSaleSelectedPatientId(p._id);
                                      setDirectSaleCustomerName(p.name);
                                      setDirectSaleCustomerMobile(p.contact || p.phone || '');
                                      setDirectSaleSearchPatientText('');
                                      setDirectSalePatientHighlightIndex(0);
                                      setTimeout(() => {
                                        directSaleSearchMedInputRef.current?.focus();
                                      }, 50);
                                    }}
                                    style={{
                                      padding: '10px 16px',
                                      borderBottom: '1px solid #F1F5F9',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      transition: 'background-color 0.15s',
                                      backgroundColor: isHighlighted ? '#EFF6FF' : 'transparent'
                                    }}
                                    onMouseEnter={() => setDirectSalePatientHighlightIndex(idx)}
                                  >
                                    <div>
                                      <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0F172A' }}>{p.name}</div>
                                      <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '1px' }}>
                                        <span style={{ fontFamily: 'monospace', color: '#2563EB', fontWeight: 700 }}>{p.uhid || p.patientId || 'ID'}</span> • {p.contact || p.phone || 'No phone'}
                                      </div>
                                    </div>
                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>
                                      {p.age ? `${p.age} Y` : ''} {p.gender || ''}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Medicine Search & Selection */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                    Add Medicines from Inventory
                  </label>
                  <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>
                    {(inventory || []).length} items in inventory
                  </span>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    ref={directSaleSearchMedInputRef}
                    type="text"
                    placeholder="Search medicine by name or SKU to add..."
                    value={directSaleSearchMedText}
                    onChange={(e) => {
                      setDirectSaleSearchMedText(e.target.value);
                      setDirectSaleMedHighlightIndex(0);
                    }}
                    onKeyDown={(e) => {
                      const q = (directSaleSearchMedText || '').trim().toLowerCase();
                      const matches = (inventory || []).filter(m => 
                        (m.name && m.name.toLowerCase().includes(q)) || 
                        (m.sku && m.sku.toLowerCase().includes(q))
                      ).slice(0, 10);

                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        if (matches.length > 0) {
                          setDirectSaleMedHighlightIndex(prev => (prev + 1) % matches.length);
                        }
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        if (matches.length > 0) {
                          setDirectSaleMedHighlightIndex(prev => (prev - 1 + matches.length) % matches.length);
                        }
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (matches.length > 0) {
                          const target = matches[directSaleMedHighlightIndex] || matches[0];
                          handleAddDirectSaleMedicine(target);
                          setDirectSaleMedHighlightIndex(0);
                        }
                      }
                    }}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '13.5px', fontWeight: 600, outline: 'none' }}
                  />

                  {/* Autocomplete Dropdown */}
                  {directSaleSearchMedText.trim().length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'white', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)', border: '1px solid #E2E8F0', maxHeight: '220px', overflowY: 'auto', zIndex: 100 }}>
                      {(() => {
                        const q = directSaleSearchMedText.trim().toLowerCase();
                        const matches = (inventory || []).filter(m => 
                          (m.name && m.name.toLowerCase().includes(q)) || 
                          (m.sku && m.sku.toLowerCase().includes(q))
                        ).slice(0, 10);

                        if (matches.length === 0) {
                          return (
                            <div style={{ padding: '12px 16px', fontSize: '13px', color: '#94A3B8', fontWeight: 600 }}>
                              No medicines found matching "{directSaleSearchMedText}"
                            </div>
                          );
                        }

                        return matches.map((med, idx) => {
                          const isHighlighted = idx === directSaleMedHighlightIndex;
                          return (
                            <div
                              key={med._id}
                              onClick={() => {
                                handleAddDirectSaleMedicine(med);
                                setDirectSaleMedHighlightIndex(0);
                              }}
                              style={{
                                padding: '10px 16px',
                                borderBottom: '1px solid #F1F5F9',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                transition: 'background-color 0.15s',
                                backgroundColor: isHighlighted ? '#EFF6FF' : 'transparent'
                              }}
                              onMouseEnter={() => setDirectSaleMedHighlightIndex(idx)}
                            >
                              <div>
                                <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0F172A' }}>{med.name}</div>
                                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '1px' }}>SKU: {med.sku} • {med.unit || 'Strip'}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#059669' }}>₹{Number(med.mrp || 0).toFixed(2)}</div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: (med.stock || 0) <= 0 ? '#EF4444' : (med.stock || 0) <= 20 ? '#F59E0B' : '#10B981' }}>
                                  Stock: {med.stock || 0}
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* Items Line Items Table */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Sale Line Items ({directSaleItems.length})
                </div>

                {directSaleItems.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', background: '#F8FAFC', borderRadius: '12px', border: '1px dashed #CBD5E1' }}>
                    <div style={{ color: '#64748B', fontSize: '13px', fontWeight: 600 }}>No medicines added yet. Use the search bar above to add items.</div>
                  </div>
                ) : (
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Medicine</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Stock</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#475569', fontSize: '11px', textTransform: 'uppercase', width: '100px' }}>Qty</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>MRP</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#475569', fontSize: '11px', textTransform: 'uppercase', width: '80px' }}>Disc %</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#475569', fontSize: '11px', textTransform: 'uppercase', width: '80px' }}>GST %</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Total</th>
                          <th style={{ padding: '10px 8px', textAlign: 'center', width: '40px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {directSaleItems.map((item, idx) => {
                          const gross = item.quantity * item.mrp;
                          const discAmt = gross * ((item.discountPercent || 0) / 100);
                          const taxAmt = gross - discAmt;
                          const gstAmt = taxAmt * ((item.gstPercent || 0) / 100);
                          const net = taxAmt + gstAmt;
                          const isOverStock = item.quantity > item.stock;

                          return (
                            <tr key={idx} style={{ borderBottom: idx === directSaleItems.length - 1 ? 'none' : '1px solid #F1F5F9', background: isOverStock ? '#FEF2F2' : 'white' }}>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: 800, color: '#0F172A' }}>{item.medicineName}</div>
                                {item.sku && <div style={{ fontSize: '11px', color: '#64748B' }}>SKU: {item.sku}</div>}
                              </td>

                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <span style={{
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  background: item.stock <= 0 ? '#FEE2E2' : item.stock <= 20 ? '#FEF3C7' : '#DCFCE7',
                                  color: item.stock <= 0 ? '#DC2626' : item.stock <= 20 ? '#D97706' : '#15803D'
                                }}>
                                  {item.stock}
                                </span>
                              </td>

                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <input
                                  type="number"
                                  min="1"
                                  max={item.stock}
                                  value={item.quantity}
                                  onChange={(e) => handleDirectSaleItemChange(idx, 'quantity', e.target.value)}
                                  style={{
                                    width: '60px',
                                    padding: '4px 6px',
                                    borderRadius: '6px',
                                    border: isOverStock ? '2px solid #EF4444' : '1px solid #CBD5E1',
                                    textAlign: 'center',
                                    fontSize: '13px',
                                    fontWeight: 800,
                                    outline: 'none'
                                  }}
                                />
                                {isOverStock && (
                                  <div style={{ fontSize: '10px', color: '#EF4444', fontWeight: 700, marginTop: '2px' }}>Max: {item.stock}</div>
                                )}
                              </td>

                              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#334155' }}>
                                ₹{item.mrp.toFixed(2)}
                              </td>

                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={item.discountPercent}
                                  onChange={(e) => handleDirectSaleItemChange(idx, 'discountPercent', e.target.value)}
                                  style={{ width: '50px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #CBD5E1', textAlign: 'center', fontSize: '12.5px', fontWeight: 700, outline: 'none' }}
                                />
                              </td>

                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <select
                                  value={item.gstPercent}
                                  onChange={(e) => handleDirectSaleItemChange(idx, 'gstPercent', e.target.value)}
                                  style={{ padding: '4px 6px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', fontWeight: 700, outline: 'none', background: 'white' }}
                                >
                                  <option value="0">0%</option>
                                  <option value="5">5%</option>
                                  <option value="12">12%</option>
                                  <option value="18">18%</option>
                                </select>
                              </td>

                              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                                ₹{net.toFixed(2)}
                              </td>

                              <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDirectSaleMedicine(idx)}
                                  style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                                  title="Remove item"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Financial Calculation Summary Card */}
              {(() => {
                const subtotal = directSaleItems.reduce((acc, it) => acc + (it.quantity * it.mrp), 0);
                const totalDisc = directSaleItems.reduce((acc, it) => acc + (it.quantity * it.mrp * ((it.discountPercent || 0) / 100)), 0);
                const taxable = Math.max(0, subtotal - totalDisc);
                const totalGst = directSaleItems.reduce((acc, it) => {
                  const gross = it.quantity * it.mrp;
                  const d = gross * ((it.discountPercent || 0) / 100);
                  const t = gross - d;
                  return acc + (t * ((it.gstPercent || 0) / 100));
                }, 0);
                const grandTotal = Math.round((taxable + totalGst) * 100) / 100;

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginBottom: '10px' }}>
                    
                    {/* Payment Section */}
                    <div style={{ background: '#F8FAFC', padding: '16px 20px', borderRadius: '16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '10px' }}>Payment Method</div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                        {['Cash', 'UPI', 'Card'].map(mode => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setDirectSalePaymentMethod(mode)}
                            style={{
                              padding: '10px 0',
                              borderRadius: '8px',
                              border: directSalePaymentMethod === mode ? '2px solid #2563EB' : '1px solid #CBD5E1',
                              background: directSalePaymentMethod === mode ? '#EFF6FF' : 'white',
                              color: directSalePaymentMethod === mode ? '#2563EB' : '#475569',
                              fontWeight: 800,
                              fontSize: '13px',
                              cursor: 'pointer'
                            }}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Totals Summary */}
                    <div style={{ background: '#F8FAFC', padding: '16px 20px', borderRadius: '16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                          <span>Subtotal:</span>
                          <span style={{ fontWeight: 700 }}>₹{subtotal.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16A34A' }}>
                          <span>Total Discount:</span>
                          <span style={{ fontWeight: 700 }}>-₹{totalDisc.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                          <span>Taxable Amount:</span>
                          <span style={{ fontWeight: 700 }}>₹{taxable.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                          <span>Total GST:</span>
                          <span style={{ fontWeight: 700 }}>₹{totalGst.toFixed(2)}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '2px solid #CBD5E1', marginTop: '10px' }}>
                        <span style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A' }}>Grand Total:</span>
                        <span style={{ fontSize: '20px', fontWeight: 900, color: '#2563EB' }}>₹{grandTotal.toFixed(2)}</span>
                      </div>
                    </div>

                  </div>
                );
              })()}

            </div>

            {/* Modal Footer */}
            <div style={{ padding: '18px 28px', borderTop: '1px solid #F1F5F9', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setShowDirectSaleModal(false)}
                style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #CBD5E1', background: 'white', color: '#64748B', fontWeight: 700, fontSize: '13.5px', cursor: 'pointer' }}
              >
                Cancel
              </button>

              {(() => {
                const total = directSaleItems.reduce((acc, it) => {
                  const gross = it.quantity * it.mrp;
                  const disc = gross * ((it.discountPercent || 0) / 100);
                  const tax = gross - disc;
                  const gst = tax * ((it.gstPercent || 0) / 100);
                  return acc + (tax + gst);
                }, 0);

                const hasOverStock = directSaleItems.some(it => it.quantity > it.stock);
                const isFormInvalid = directSaleItems.length === 0 || hasOverStock;

                return (
                  <button
                    type="button"
                    disabled={isFormInvalid || isSubmittingDirectSale}
                    onClick={handleDirectSaleSubmit}
                    style={{
                      padding: '10px 28px',
                      borderRadius: '10px',
                      border: 'none',
                      background: isFormInvalid ? '#94A3B8' : '#10B981',
                      color: 'white',
                      fontWeight: 800,
                      fontSize: '14px',
                      cursor: isFormInvalid ? 'not-allowed' : 'pointer',
                      boxShadow: isFormInvalid ? 'none' : '0 4px 12px rgba(16, 185, 129, 0.25)',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {isSubmittingDirectSale ? 'Processing...' : ('Complete Sale — ₹' + total.toFixed(2))}
                  </button>
                );
              })()}
            </div>

          </div>
        </div>
      )}

      {/* SALE DETAIL STRUCTURED MODAL */}
      {showSaleDetailModal && selectedSaleDetail && (
        <div
          onClick={() => setShowSaleDetailModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 9300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '24px',
              width: '100%',
              maxWidth: '750px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              animation: 'fadeIn 0.2s ease-out'
            }}
          >
            {/* Detail Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: 0, fontFamily: 'monospace' }}>
                    {selectedSaleDetail.saleId}
                  </h3>
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    background: selectedSaleDetail.saleType === 'DIRECT' ? '#EEF2FF' : '#ECFDF5',
                    color: selectedSaleDetail.saleType === 'DIRECT' ? '#4F46E5' : '#059669'
                  }}>
                    {selectedSaleDetail.saleType}
                  </span>
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 800,
                    background: '#ECFDF5',
                    color: '#047857'
                  }}>
                    {selectedSaleDetail.status || 'COMPLETED'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px', fontWeight: 600 }}>
                  {(selectedSaleDetail.saleDate ? new Date(selectedSaleDetail.saleDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '')} • {selectedSaleDetail.saleTime || ''}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowSaleDetailModal(false)}
                style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '14px', fontWeight: 'bold' }}
              >✕</button>
            </div>

            {/* Detail Body */}
            <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }} data-lenis-prevent>
              
              {/* Customer & Doctor Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Customer / Patient</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{selectedSaleDetail.customerName}</div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                    {(selectedSaleDetail.patientIdentifier ? (selectedSaleDetail.patientIdentifier + ' • ') : '')}{selectedSaleDetail.customerMobile || 'No mobile provided'}
                  </div>
                </div>

                <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Prescribing Source</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                    {selectedSaleDetail.doctorName || 'Self / No Doctor'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#2563EB', fontWeight: 700, marginTop: '2px' }}>
                    {selectedSaleDetail.prescriptionCode ? ('Prescription: ' + selectedSaleDetail.prescriptionCode) : 'Direct Sale OTC'}
                  </div>
                </div>
              </div>

              {/* Medicines Breakdown Table */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Medicines Dispensed ({selectedSaleDetail.items?.length || 0})
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Medicine</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Qty</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>MRP</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Disc</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>GST</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Net Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedSaleDetail.items || []).map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: idx === (selectedSaleDetail.items.length - 1) ? 'none' : '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ fontWeight: 800, color: '#0F172A' }}>{it.medicineName}</div>
                          {it.sku && <div style={{ fontSize: '11px', color: '#64748B' }}>SKU: {it.sku}</div>}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#334155', fontWeight: 700 }}>{it.quantity} {it.unit || ''}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#475569' }}>₹{(it.mrp || 0).toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#16A34A' }}>{it.discountPercent || 0}%</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#475569' }}>{it.gstPercent || 0}%</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>₹{(it.netAmount || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial & Payment Overview */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', background: '#F8FAFC', padding: '16px 20px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '12.5px', color: '#475569' }}>
                  <div style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '11px', color: '#64748B', marginBottom: '6px' }}>Payment & Settlement</div>
                  <div>Payment Method: <strong style={{ color: '#0F172A' }}>{selectedSaleDetail.paymentMethod || 'Cash'}</strong></div>
                  <div style={{ marginTop: '3px' }}>Payment Status: <strong style={{ color: '#16A34A' }}>{selectedSaleDetail.paymentStatus || 'PAID'}</strong></div>
                  {selectedSaleDetail.transactionRef && (
                    <div style={{ marginTop: '3px' }}>Reference: <strong style={{ color: '#0F172A' }}>{selectedSaleDetail.transactionRef}</strong></div>
                  )}
                  {selectedSaleDetail.paymentMethod === 'Cash' && (
                    <div>
                      <div style={{ marginTop: '3px' }}>Amount Received: ₹{(selectedSaleDetail.amountReceived || selectedSaleDetail.grandTotal).toFixed(2)}</div>
                      <div style={{ marginTop: '3px' }}>Change Returned: ₹{(selectedSaleDetail.changeReturned || 0).toFixed(2)}</div>
                    </div>
                  )}
                  <div style={{ marginTop: '8px', fontSize: '11.5px', color: '#94A3B8' }}>
                    Pharmacist: {selectedSaleDetail.pharmacistName || 'Pharmacist'} • Location: {selectedSaleDetail.pharmacyLocation || 'Main Pharmacy'}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                    <span>Subtotal:</span>
                    <span>₹{(selectedSaleDetail.subtotal || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16A34A' }}>
                    <span>Discount:</span>
                    <span>-₹{(selectedSaleDetail.totalDiscount || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                    <span>GST:</span>
                    <span>₹{(selectedSaleDetail.totalGst || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '2px solid #CBD5E1', marginTop: '4px', fontWeight: 900, fontSize: '16px', color: '#0F172A' }}>
                    <span>Grand Total:</span>
                    <span style={{ color: '#2563EB' }}>₹{(selectedSaleDetail.grandTotal || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Detail Footer */}
            <div style={{ padding: '16px 28px', borderTop: '1px solid #F1F5F9', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setShowSaleDetailModal(false)}
                style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #CBD5E1', background: 'white', color: '#64748B', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => handlePrintSaleReceipt(selectedSaleDetail)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  background: '#2563EB',
                  color: 'white',
                  fontWeight: 800,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                Print Receipt
              </button>
            </div>

          </div>
        </div>
      )}


        </>
  );
};

export default PharmacyDashboard;
