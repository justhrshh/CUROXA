import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { printPO, printGRN } from '../utils/printDocHelper';
import curoxaSidebarLogo from '../assets/curoxa_sidebar_logo.png';
import ExportModal from '../components/export/ExportModal';
import { grnExportColumns, poExportColumns, flattenGrnForExport, flattenPoForExport } from '../utils/exportEngine';

const ProcurementDashboard = () => {
  const [activeTab, setActiveTab] = useState('vendors'); // 'dashboard', 'vendors', 'pos', 'grn', 'payments'
  const [notification, setNotification] = useState(null);
  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };
  const [vendors, setVendors] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showCreatePOModal, setShowCreatePOModal] = useState(false);
  const [showAddVendorModal, setShowAddVendorModal] = useState(false);
  const [showGRNModal, setShowGRNModal] = useState(false);
  const [showGrnExportModal, setShowGrnExportModal] = useState(false);
  const [showPoExportModal, setShowPoExportModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedVendorProfile, setSelectedVendorProfile] = useState(null);
  const [selectedVendorPriceList, setSelectedVendorPriceList] = useState(null);
  const [showAddMedicineApprovalModal, setShowAddMedicineApprovalModal] = useState(false);
  const [targetVendorForMedicine, setTargetVendorForMedicine] = useState(null);
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
  const [priceListSearch, setPriceListSearch] = useState('');
  const [selectedGrnDetails, setSelectedGrnDetails] = useState(null);
  const [catalogApprovals, setCatalogApprovals] = useState([]);
  const [collapsedMasterPOs, setCollapsedMasterPOs] = useState({});

  const toggleMasterPO = (poId) => {
    setCollapsedMasterPOs(prev => ({
      ...prev,
      [poId]: !prev[poId]
    }));
  };

  // Search & filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('All Types');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All Categories');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All Status');
  const [editingVendor, setEditingVendor] = useState(null);

  // Form states
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
    status: 'Active',
    panNumber: '',
    licenseNumber: '',
    zipCode: '',
    notes: '',
    alternatePhone: '',
    medicines: [],
    
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
    isoCertificationNo: '',
    isoValidUpto: '',
    pollutionControlBoardCertificationNo: '',
    pollutionValidUpto: '',
    bank1Name: '',
    bank1Branch: '',
    bank1AccountNumber: '',
    bank1IfscCode: '',
    bank1Address: '',
    taxes: '',
    deliveryTerms: '',
    isMsmeRegistration: 'No',
    msmeRegistrationNo: '',
    msmeRegistrationType: ''
  });
  const [poDraftItems, setPoDraftItems] = useState([{ name: '', sku: '', qty: 100, price: 50 }]);
  const [selectedVendorForPO, setSelectedVendorForPO] = useState('');
  const [poExpectedDelivery, setPoExpectedDelivery] = useState('');
  const [poInitialStatus, setPoInitialStatus] = useState('Draft');
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
  const [grnNotes, setGrnNotes] = useState('');
  const [grnIsUploading, setGrnIsUploading] = useState(false);
  const [grnUploadProgress, setGrnUploadProgress] = useState(0);
  const [editingGrn, setEditingGrn] = useState(null);

  
  // Payment states
  const [selectedPaymentVendorId, setSelectedPaymentVendorId] = useState('');
  const [paymentPOId, setPaymentPOId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Bank Transfer');

  // Create PO Screen states
  const [isCreatingPO, setIsCreatingPO] = useState(false);
  const [isAddingVendor, setIsAddingVendor] = useState(false);
  const [poScreenNumber, setPoScreenNumber] = useState('PO-2026-0143');
  const [poScreenOrderDate, setPoScreenOrderDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [poScreenExpectedDelivery, setPoScreenExpectedDelivery] = useState(() => new Date(Date.now() + 4*24*60*60*1000).toISOString().split('T')[0]);
  const [poScreenDefaultVendor, setPoScreenDefaultVendor] = useState('');
  const [poScreenItems, setPoScreenItems] = useState([
    { sku: '', qty: 100, vendorId: '', price: 0, discount: 0, tax: 12 }
  ]);
  const [poScreenNotes, setPoScreenNotes] = useState('');
  const [editingDraftPO, setEditingDraftPO] = useState(null);

  const [selectedInvoiceDetails, setSelectedInvoiceDetails] = useState(null);
  const [previewPoDetails, setPreviewPoDetails] = useState(null);

  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [readNotifIds, setReadNotifIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('read_notif_ids') || '[]');
    } catch {
      return [];
    }
  });

  const handleToggleNotif = () => {
    setShowNotifDropdown(!showNotifDropdown);
    if (!showNotifDropdown) {
      const allIds = notifications.map(n => n.id);
      setReadNotifIds(allIds);
      localStorage.setItem('read_notif_ids', JSON.stringify(allIds));
    }
  };

  const unreadCount = notifications.filter(n => !readNotifIds.includes(n.id)).length;

  // Compare Drawer state
  // Compare Drawer state
  const [compareItemIdx, setCompareItemIdx] = useState(null);
  const [activeVendorMedFocus, setActiveVendorMedFocus] = useState(null);
  const [activePoItemFocus, setActivePoItemFocus] = useState(null);
  const [poFilter, setPoFilter] = useState('all');
  const [vendorStep, setVendorStep] = useState(1);

  useEffect(() => {
    if (!isAddingVendor) return;

    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        const primarySubmitBtn = document.getElementById('vendor-primary-submit-btn');
        if (primarySubmitBtn) {
          primarySubmitBtn.click();
        }
      } else if (e.key === 'Escape') {
        const isModalOpen = !!selectedVendorProfile || !!selectedGrnDetails || !!showGRNModal || !!showPaymentModal;
        if (!isModalOpen) {
          setIsAddingVendor(false);
          setEditingVendor(null);
          resetVendorForm();
          setVendorStep(1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddingVendor, selectedVendorProfile, selectedGrnDetails, showGRNModal, showPaymentModal]);

  const [currentUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{"name":"Dr. Ramesh","role":"Pharmacy Admin","email":"ramesh@curoxa.com"}'));
  const navigate = useNavigate();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.dispatchEvent(new CustomEvent('curoxa_logout'));
    navigate('/login');
  };

  const handleExitProcurement = () => {
    try {
      window.close();
    } catch (e) {
      console.error(e);
    }
    setTimeout(() => {
      navigate('/pharmacy');
    }, 100);
  };

  // Fetch all data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [vendorRes, poRes, grnRes, medRes, approvalsRes] = await Promise.all([
        api.get('/vendors'),
        api.get('/purchase-orders'),
        api.get('/goods-receipts'),
        api.get('/medicines'),
        api.get('/approvals').catch(() => ({ data: [] }))
      ]);

      const fetchedVendors = vendorRes.data || [];
      setVendors(fetchedVendors);
      setSelectedVendorProfile(prev => {
        if (!prev?._id) return prev;
        const fresh = fetchedVendors.find(v => v._id === prev._id);
        return fresh || prev;
      });
      setSelectedVendorPriceList(prev => {
        if (!prev?._id) return prev;
        const fresh = fetchedVendors.find(v => v._id === prev._id);
        return fresh || prev;
      });
      setPurchaseOrders(poRes.data || []);
      setGoodsReceipts(grnRes.data || []);
      
      const dbMedicines = medRes.data || [];
      const vendorMedicines = [];
      const existingNames = new Set(dbMedicines.map(m => m.name.toLowerCase()));
      fetchedVendors.forEach(v => {
        if (v.medicines && Array.isArray(v.medicines)) {
          v.medicines.forEach(m => {
            if (m.name) {
              const lowerName = m.name.toLowerCase();
              if (!existingNames.has(lowerName)) {
                existingNames.add(lowerName);
                vendorMedicines.push({
                  name: m.name,
                  sku: m.sku || `vsku-${Math.random().toString(36).substring(2, 7)}`,
                  stock: 0,
                  avgMonthlyUse: 1200,
                  status: 'In Stock',
                  mrp: m.price || 0
                });
              }
            }
          });
        }
      });
      setMedicines([...dbMedicines, ...vendorMedicines]);

      const allApprovals = approvalsRes.data || [];
      const medApprovals = allApprovals.filter(a => 
        a.type === 'vendor_medicine_addition' || 
        a.type === 'vendor_onboarding' || 
        a.type === 'item_price_update'
      );
      setCatalogApprovals(medApprovals);
      const resolved = allApprovals.filter(app => app.status === 'approved' || app.status === 'denied');
      const mappedNotifs = resolved.map(app => {
        let title = '';
        let type = app.status === 'approved' ? 'success' : 'error';
        if (app.type === 'vendor_onboarding') {
          title = `Vendor Onboarding "${app.details.vendorName}" has been ${app.status === 'approved' ? 'Approved' : 'Denied'} by Admin.`;
        } else if (app.type === 'purchase_order_approval') {
          title = `Purchase Order ${app.details.poNumber || 'PO'} has been ${app.status === 'approved' ? 'Approved' : 'Rejected'} by Admin.`;
        } else {
          title = `Request "${app.type}" has been ${app.status === 'approved' ? 'Approved' : 'Denied'} by Admin.`;
        }
        return {
          id: app._id,
          title,
          type,
          time: new Date(app.resolvedAt || app.updatedAt || Date.now()).toLocaleDateString()
        };
      });
      setNotifications(mappedNotifs);

      if (fetchedVendors.length > 0 && !selectedPaymentVendorId) {
        setSelectedPaymentVendorId(fetchedVendors[0]._id);
      }
    } catch (err) {
      console.error('Error fetching procurement data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNextPoNumber = async () => {
    try {
      const res = await api.get('/purchase-orders/next-number');
      if (res.data && res.data.nextNumber) {
        setPoScreenNumber(res.data.nextNumber);
      }
    } catch (err) {
      console.error('Error fetching next PO number:', err);
    }
  };

  useEffect(() => {
    fetchData();
    // Initialize Lucide icons
    setTimeout(() => {
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }, 300);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.proc-header-actions')) {
        setShowNotifDropdown(false);
      }
      if (!e.target.closest('.proc-search-container')) {
        setShowSearchDropdown(false);
      }
    };
    if (showNotifDropdown || showSearchDropdown) {
      document.addEventListener('click', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [showNotifDropdown, showSearchDropdown]);

  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }); // Run on every render to ensure Lucide icons never disappear

  useEffect(() => {
    const handleSync = (e) => {
      const { type } = e.detail;
      console.log('[SOCKET] ProcurementDashboard received sync event for:', type);
      if (['purchase_orders', 'purchase-orders', 'vendors', 'goods_receipts', 'goods-receipts', 'medicines', 'approvals'].includes(type)) {
        fetchData();
      }
    };
    window.addEventListener('curoxa_sync', handleSync);

    const onWindowFocus = () => {
      fetchData();
    };
    window.addEventListener('focus', onWindowFocus);

    const autoSyncTimer = setInterval(() => {
      fetchData();
    }, 6000);

    return () => {
      window.removeEventListener('curoxa_sync', handleSync);
      window.removeEventListener('focus', onWindowFocus);
      clearInterval(autoSyncTimer);
    };
  }, []);

  // Dynamic lists with NO static mock fallbacks
  const getDisplayVendors = () => {
    return vendors.filter(v => v.status === 'Active');
  };

  const getDisplayPOs = () => {
    const parentAndDirect = [];
    const childMap = {};

    purchaseOrders.forEach(po => {
      if (po.parentPOId) {
        if (!childMap[po.parentPOId]) childMap[po.parentPOId] = [];
        childMap[po.parentPOId].push(po);
      } else {
        parentAndDirect.push(po);
      }
    });

    parentAndDirect.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const result = [];
    parentAndDirect.forEach(parent => {
      result.push(parent);
      if (childMap[parent.poId]) {
        childMap[parent.poId].sort((a, b) => a.poId.localeCompare(b.poId));
        result.push(...childMap[parent.poId]);
      }
    });

    Object.keys(childMap).forEach(pId => {
      if (!parentAndDirect.some(p => p.poId === pId)) {
        result.push(...childMap[pId]);
      }
    });

    return result;
  };

  const resetVendorForm = () => {
    setNewVendor({
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
      status: 'Active',
      panNumber: '',
      licenseNumber: '',
      zipCode: '',
      notes: '',
      alternatePhone: '',
      medicines: [],
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
      isoCertificationNo: '',
      isoValidUpto: '',
      pollutionControlBoardCertificationNo: '',
      pollutionValidUpto: '',
      bank1Name: '',
      bank1Branch: '',
      bank1AccountNumber: '',
      bank1IfscCode: '',
      bank1Address: '',
      taxes: '',
      deliveryTerms: '',
      isMsmeRegistration: 'No',
      msmeRegistrationNo: '',
      msmeRegistrationType: ''
    });
  };

  const handleSaveVendorSubmit = async (e) => {
    e.preventDefault();

    // Mobile number validation (checks for exactly 10 digits after removing spaces, dashes, and plus signs)
    const phoneRegex = /^[0-9]{10}$/;
    if (newVendor.phone) {
      const cleanPhone = newVendor.phone.replace(/[\s\-+]/g, '');
      if (!phoneRegex.test(cleanPhone)) {
        showToast('Please enter a valid 10-digit mobile number', 'error');
        return;
      }
    }
    if (newVendor.alternatePhone) {
      const cleanAltPhone = newVendor.alternatePhone.replace(/[\s\-+]/g, '');
      if (!phoneRegex.test(cleanAltPhone)) {
        showToast('Please enter a valid 10-digit alternate mobile number', 'error');
        return;
      }
    }

    try {
      let savedVendor;
      if (editingVendor) {
        // Edit existing
        const res = await api.put(`/vendors/${editingVendor._id}`, newVendor);
        savedVendor = res.data;
        setEditingVendor(null);
      } else {
        // Add new
        const res = await api.post('/vendors', newVendor);
        savedVendor = res.data;
      }
      setShowAddVendorModal(false);
      setIsAddingVendor(false);
      resetVendorForm();
      fetchData();

      const submitterName = e.nativeEvent.submitter?.name;
      if (submitterName === 'saveAndAddPrice' && savedVendor) {
        setSelectedVendorProfile(savedVendor);
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save vendor', 'error');
    }
  };

  const handleSubmitMedicineForApproval = async (e) => {
    e.preventDefault();
    const vendor = targetVendorForMedicine || selectedVendorPriceList || selectedVendorProfile;
    if (!vendor) return;
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
        staffId: currentUser?.staff_id || currentUser?.id || 'procurement-1',
        requesterName: currentUser?.name || 'Procurement Officer',
        requesterRole: currentUser?.role || 'procurement',
        details: {
          vendorId: vendor._id,
          vendorName: vendor.name,
          vendorCode: vendor.code,
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
        comment: newMedApprovalData.comment.trim() || `Proposed new medicine addition for ${vendor.name}`
      };

      await api.post('/approvals', payload);
      showToast("Medicine submitted for Admin approval.", "success");
      setShowAddMedicineApprovalModal(false);
      setTargetVendorForMedicine(null);
      await fetchData();
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

  const handleEditVendorClick = (vendor) => {
    setEditingVendor(vendor);
    setNewVendor({
      name: vendor.name || '',
      code: vendor.code || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      address: vendor.address || '',
      city: vendor.city || '',
      state: vendor.state || '',
      type: vendor.type || 'Medicine',
      contactPerson: vendor.contactPerson || '',
      gstNumber: vendor.gstNumber || '',
      status: vendor.status || 'Active',
      panNumber: vendor.panNumber || '',
      licenseNumber: vendor.licenseNumber || '',
      zipCode: vendor.zipCode || '',
      notes: vendor.notes || '',
      alternatePhone: vendor.alternatePhone || '',
      medicines: vendor.medicines || [],
      supplierCategory: vendor.supplierCategory || 'Medicine',
      organizationType: vendor.organizationType || 'Private Ltd',
      houseNo: vendor.houseNo || '',
      street: vendor.street || '',
      country: vendor.country || 'India',
      pinCode: vendor.pinCode || '',
      landline: vendor.landline || '',
      faxNo: vendor.faxNo || '',
      website: vendor.website || '',
      primaryContactPerson: vendor.primaryContactPerson || '',
      primaryContactPersonDesignation: vendor.primaryContactPersonDesignation || '',
      primaryContactPersonMobileNo: vendor.primaryContactPersonMobileNo || '',
      primaryContactPersonEmailId: vendor.primaryContactPersonEmailId || '',
      secondaryContactPerson: vendor.secondaryContactPerson || '',
      secondaryContactPersonDesignation: vendor.secondaryContactPersonDesignation || '',
      secondaryContactPersonMobileNo: vendor.secondaryContactPersonMobileNo || '',
      secondaryContactPersonEmailId: vendor.secondaryContactPersonEmailId || '',
      cinNo: vendor.cinNo || '',
      pfRegistrationNo: vendor.pfRegistrationNo || '',
      nameOnPanCard: vendor.nameOnPanCard || '',
      panCardNo: vendor.panCardNo || '',
      rocNo: vendor.rocNo || '',
      esiRegistrationNo: vendor.esiRegistrationNo || '',
      isoCertificationNo: vendor.isoCertificationNo || '',
      isoValidUpto: vendor.isoValidUpto || '',
      pollutionControlBoardCertificationNo: vendor.pollutionControlBoardCertificationNo || '',
      pollutionValidUpto: vendor.pollutionValidUpto || '',
      bank1Name: vendor.bank1Name || '',
      bank1Branch: vendor.bank1Branch || '',
      bank1AccountNumber: vendor.bank1AccountNumber || '',
      bank1IfscCode: vendor.bank1IfscCode || '',
      bank1Address: vendor.bank1Address || '',
      taxes: vendor.taxes || '',
      deliveryTerms: vendor.deliveryTerms || '',
      isMsmeRegistration: vendor.isMsmeRegistration || 'No',
      msmeRegistrationNo: vendor.msmeRegistrationNo || '',
      msmeRegistrationType: vendor.msmeRegistrationType || ''
    });
    setVendorStep(1);
    setIsAddingVendor(true);
  };

  const calculateMtdPurchases = () => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const activeStatuses = ['Approved', 'Sent', 'Confirmed', 'Partially Delivered', 'Completed'];
    const sum = purchaseOrders
      .filter(p => {
        const d = new Date(p.createdAt);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear && activeStatuses.includes(p.status);
      })
      .reduce((acc, p) => acc + p.totalAmount, 0);
    return sum;
  };

  const calculateOutstandingPayable = () => {
    let sum = 0;
    const activeStatuses = ['Approved', 'Sent', 'Confirmed', 'Partially Delivered', 'Completed'];
    purchaseOrders.forEach(po => {
      const total = po.totalAmount;
      const isCompleted = po.status === 'Completed';
      const isInactive = !activeStatuses.includes(po.status);
      const amountPaid = isCompleted ? total : (isInactive ? 0 : total * 0.4);
      const balance = total - amountPaid;
      if (!isInactive) {
        sum += balance;
      }
    });
    return sum;
  };

  const getGrnsThisWeek = () => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return goodsReceipts.filter(g => new Date(g.receivedDate || g.createdAt) >= oneWeekAgo).length;
  };

  const getQuantityMismatches = () => {
    return purchaseOrders.filter(p => p.status === 'Partially Delivered').length;
  };

  const getAcceptedMonthTotal = () => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const sum = goodsReceipts
      .filter(g => {
        const d = new Date(g.receivedDate || g.createdAt);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((acc, g) => {
        const totalVal = g.items ? g.items.reduce((sumVal, item) => sumVal + ((item.qtyReceived || 0) * (item.price || 0)), 0) : 0;
        return acc + totalVal;
      }, 0);
    return sum;
  };

  const formatAcceptedTotal = () => {
    const val = getAcceptedMonthTotal();
    if (val === 0) return '₹0';
    if (val >= 100000) {
      return `₹${(val / 100000).toFixed(1)}L`;
    } else if (val >= 1000) {
      return `₹${(val / 1000).toFixed(1)}K`;
    }
    return `₹${val}`;
  };

  const handleCreatePO = async (e) => {
    e.preventDefault();
    if (!selectedVendorForPO) {
      showToast('Please select a vendor!', 'error');
      return;
    }
    const vendorObj = getDisplayVendors().find(v => v._id === selectedVendorForPO);
    if (!vendorObj) return;

    try {
      const poId = `PO-2026-${Math.floor(100 + Math.random() * 900)}`;
      const totalAmount = poDraftItems.reduce((sum, item) => sum + (Number(item.qty) * Number(item.price)), 0);

      await api.post('/purchase-orders', {
        poId,
        vendorId: vendorObj._id,
        vendorName: vendorObj.name,
        items: poDraftItems.map(item => ({
          name: item.name,
          sku: item.sku || `SKU-${item.name.substring(0, 3).toUpperCase()}`,
          requiredQty: Number(item.qty),
          price: Number(item.price),
          total: Number(item.qty) * Number(item.price)
        })),
        totalAmount,
        requestedBy: currentUser.name || 'Dr. Ramesh',
        status: poInitialStatus,
        expectedDelivery: poExpectedDelivery || null
      });

      setShowCreatePOModal(false);
      setPoDraftItems([{ name: '', sku: '', qty: 100, price: 50 }]);
      setPoExpectedDelivery('');
      setPoInitialStatus('Draft');
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to submit Purchase Order', 'error');
    }
  };

  const handleGrnPOSelection = (poId) => {
    setEditingGrn(null);
    setGrnSelectedPOId(poId);
    const po = getDisplayPOs().find(x => x._id === poId || x.poId === poId);
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
    setGrnInvoiceAmount(grn.invoiceAmount !== undefined ? String(grn.invoiceAmount) : '');
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
      remainingQty: it.remainingQty !== undefined ? it.remainingQty : (it.qtyOrdered || it.orderedQty || 0),
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

    // Validation
    const hasAnyReceived = grnItems.some(it => Number(it.qtyReceived) > 0);
    if (statusParam === 'Verified/Completed' && !hasAnyReceived) {
      showToast('Please specify a received quantity (> 0) for at least one item before generating GRN.', 'error');
      return;
    }

    for (const item of grnItems) {
      const isReceiving = Number(item.qtyReceived) > 0;
      if (isReceiving) {
        if (!item.batchNumber || !item.batchNumber.trim()) {
          showToast(`Batch Number is required for received item: ${item.name}`, 'error');
          return;
        }
        if (!item.expiryDate) {
          showToast(`Expiry Date is required for received item: ${item.name}`, 'error');
          return;
        }
      }
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
        const po = getDisplayPOs().find(x => x._id === grnSelectedPOId || x.poId === grnSelectedPOId);
        if (!po) {
          showToast('Please select an approved Purchase Order!', 'error');
          return;
        }
        poId = po._id;
        poNumber = po.poId;
        poDate = po.createdAt;
        vendorId = po.vendorId || (getDisplayVendors()[0] ? getDisplayVendors()[0]._id : '');
        vendorName = po.vendorName;
      } else {
        const v = getDisplayVendors().find(x => x._id === grnDirectVendorId);
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
      fetchData();
      showToast(statusParam === 'Draft' ? 'GRN saved as Draft successfully!' : (editingGrn ? 'GRN updated successfully!' : 'GRN generated & inventory stock updated successfully!'), 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save GRN', 'error');
    }
  };

  const handleSavePayment = async (e) => {
    e.preventDefault();
    if (!paymentPOId) {
      showToast('Please select a purchase order!', 'error');
      return;
    }
    const po = getDisplayPOs().find(p => p.poId === paymentPOId || p._id === paymentPOId);
    if (!po) return;

    try {
      const addedVal = Number(paymentAmount) || 0;
      const currentPaid = po.paidAmount || 0;
      const newPaid = Math.min(po.totalAmount, currentPaid + addedVal);

      const updatePayload = {
        paidAmount: newPaid
      };
      if (newPaid >= po.totalAmount) {
        updatePayload.status = 'Completed';
      }

      await api.put(`/purchase-orders/${po._id}`, updatePayload);

      setShowPaymentModal(false);
      setPaymentAmount('');
      fetchData();
      showToast(`Payment of ₹${addedVal.toLocaleString()} recorded successfully for PO ${po.poId}!`, 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to record payment', 'error');
    }
  };

  const handleSendPurchaseOrder = async (e) => {
    if (e) e.preventDefault();

    const validItems = poScreenItems.filter(item => item.sku && Number(item.qty) > 0);
    if (validItems.length === 0) {
      showToast('Please add at least one valid item with a quantity greater than zero!', 'error');
      return;
    }

    // Auto-resolve missing vendor assignments if any
    for (let it of validItems) {
      if (!it.vendorId) {
        const itName = it.name || '';
        const itSku = it.sku || '';
        const matchingVendors = (vendors || []).filter(v => 
          (v.status === 'Active' || !v.status) && 
          v.medicines && 
          v.medicines.some(med => (itSku && med.sku && med.sku.toLowerCase() === itSku.toLowerCase()) || (itName && med.name && med.name.toLowerCase() === itName.toLowerCase()))
        );
        if (matchingVendors.length > 0) {
          const cheapest = matchingVendors.reduce((min, current) => {
            const minPrice = min.medicines.find(med => (itSku && med.sku && med.sku.toLowerCase() === itSku.toLowerCase()) || (itName && med.name && med.name.toLowerCase() === itName.toLowerCase()))?.price || Infinity;
            const currentPrice = current.medicines.find(med => (itSku && med.sku && med.sku.toLowerCase() === itSku.toLowerCase()) || (itName && med.name && med.name.toLowerCase() === itName.toLowerCase()))?.price || Infinity;
            return currentPrice < minPrice ? current : min;
          }, matchingVendors[0]);
          it.vendorId = cheapest._id;
          it.vendorName = cheapest.name;
          const medInfo = cheapest.medicines.find(med => (itSku && med.sku && med.sku.toLowerCase() === itSku.toLowerCase()) || (itName && med.name && med.name.toLowerCase() === itName.toLowerCase()));
          if (medInfo) {
            it.price = medInfo.price;
            it.tax = medInfo.gst !== undefined ? medInfo.gst : 12;
          }
        }
      }
    }

    const missingVendorItem = validItems.find(item => !item.vendorId);
    if (missingVendorItem) {
      const medName = missingVendorItem.name || medicines.find(m => m.sku === missingVendorItem.sku)?.name || 'selected item';
      showToast(`Please select a vendor for ${medName} before sending!`, 'error');
      return;
    }

    try {
      const formattedItems = validItems.map(item => {
        const medObj = (medicines || []).find(m => m.sku === item.sku);
        const vObj = (vendors || []).find(v => v._id === item.vendorId);
        const subTotal = Number(item.qty) * Number(item.price);
        const discountVal = subTotal * ((Number(item.discount) || 0) / 100);
        const taxVal = (subTotal - discountVal) * ((Number(item.tax) || 12) / 100);
        const lineTotal = subTotal - discountVal + taxVal;

        return {
          name: item.name || (medObj ? medObj.name : (item.tempName || 'Medicine')),
          sku: item.sku,
          requiredQty: Number(item.qty),
          price: Number(item.price),
          tax: Number(item.tax || 12),
          total: Math.round(lineTotal * 100) / 100,
          vendorId: item.vendorId,
          vendorName: vObj ? vObj.name : (item.vendorName || 'Supplier')
        };
      });

      if (editingDraftPO) {
        await api.put(`/purchase-orders/${editingDraftPO}`, {
          items: formattedItems,
          expectedDelivery: poScreenExpectedDelivery,
          notes: poScreenNotes,
          status: 'Pending'
        });
      } else {
        const payload = {
          items: formattedItems,
          expectedDelivery: poScreenExpectedDelivery,
          notes: poScreenNotes,
          requestedBy: currentUser?.name || 'Staff'
        };
        console.log("FINAL PO PAYLOAD SENT:", JSON.stringify(payload, null, 2));
        const res = await api.post('/purchase-orders', payload);
        showToast(`Consolidated PO submitted! Split into ${res.data?.childPOsCount || 'vendor'} order(s) for Admin approval.`, 'success');
      }

      setIsCreatingPO(false);
      setEditingDraftPO(null);
      setPoScreenItems([{ sku: '', qty: 100, vendorId: '', price: 0, discount: 0, tax: 12 }]);
      setPoScreenNotes('');
      fetchData();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || 'Failed to send purchase order', 'error');
    }
  };

  const handleSaveDraftPO = async () => {
    const validItems = poScreenItems.filter(item => item.sku && Number(item.qty) > 0);
    if (validItems.length === 0) {
      showToast('Please add at least one valid item!', 'error');
      return;
    }

    try {
      const formattedItems = validItems.map(item => {
        const medObj = medicines.find(m => m.sku === item.sku);
        const vObj = vendors.find(v => v._id === item.vendorId);
        const subTotal = item.qty * (item.price || 10);
        const discountVal = subTotal * ((item.discount || 0) / 100);
        const taxVal = (subTotal - discountVal) * ((item.tax || 12) / 100);
        const lineTotal = subTotal - discountVal + taxVal;

        return {
          name: medObj ? medObj.name : item.name || 'Unknown Product',
          sku: item.sku,
          requiredQty: Number(item.qty),
          price: Number(item.price || 10),
          tax: Number(item.tax || 12),
          total: Math.round(lineTotal * 100) / 100,
          vendorId: item.vendorId || vendors[0]?._id,
          vendorName: vObj ? vObj.name : vendors[0]?.name || 'Supplier'
        };
      });

      if (editingDraftPO) {
        await api.put(`/purchase-orders/${editingDraftPO}`, {
          items: formattedItems,
          expectedDelivery: poScreenExpectedDelivery,
          notes: poScreenNotes,
          status: 'Draft'
        });
      } else {
        await api.post('/purchase-orders', {
          items: formattedItems,
          expectedDelivery: poScreenExpectedDelivery,
          notes: poScreenNotes,
          requestedBy: currentUser?.name || 'Staff'
        });
      }

      setIsCreatingPO(false);
      setEditingDraftPO(null);
      setPoScreenItems([{ sku: '', qty: 100, vendorId: '', price: 0, discount: 0, tax: 12 }]);
      setPoScreenNotes('');
      fetchData();
      showToast('Draft purchase order(s) saved successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || 'Failed to save draft purchase order', 'error');
    }
  };

  const handleAddRow = () => {
    setPoDraftItems([...poDraftItems, { name: '', sku: '', qty: 100, price: 50 }]);
  };

  const handleRemoveRow = (idx) => {
    setPoDraftItems(poDraftItems.filter((_, i) => i !== idx));
  };

  const handleResumeDraft = (po) => {
    setEditingDraftPO(po._id);
    setPoScreenNumber(po.poId);
    setPoScreenOrderDate(new Date(po.createdAt || Date.now()).toISOString().split('T')[0]);
    setPoScreenExpectedDelivery(po.expectedDelivery ? new Date(po.expectedDelivery).toISOString().split('T')[0] : '');
    setPoScreenDefaultVendor(po.vendorId || '');
    setPoScreenItems(po.items.map(item => ({
      sku: item.sku,
      qty: item.requiredQty,
      vendorId: po.vendorId,
      price: item.price,
      discount: item.discount || 0,
      tax: item.tax || 12
    })));
    setIsCreatingPO(true);
    setActiveTab('pos');
  };

  return (
    <>
      <style>{`
        .proc-container {
          display: flex;
          min-height: 100vh;
          background-color: #F8FAFC;
          font-family: 'Urbanist', sans-serif;
          color: #0F172A;
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .proc-sidebar {
          width: 256px;
          background: #FFFFFF;
          border-right: 1px solid #E2E8F0;
          display: flex;
          flex-direction: column;
          position: fixed;
          top: 0;
          bottom: 0;
          left: 0;
          z-index: 10;
          box-shadow: 1px 0 10px rgba(15, 23, 42, 0.02);
        }

        .proc-sidebar-brand {
          padding: 22px 24px;
          border-bottom: 1px solid #F1F5F9;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .proc-brand-logo {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
        }

        .proc-brand-title {
          font-weight: 900;
          font-size: 18px;
          color: #0F172A;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .proc-brand-sub {
          font-size: 10.5px;
          color: #64748B;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .proc-sidebar-menu {
          padding: 20px 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex-grow: 1;
        }

        .proc-menu-header {
          font-size: 10.5px;
          font-weight: 800;
          text-transform: uppercase;
          color: #94A3B8;
          padding-left: 12px;
          margin-bottom: 6px;
          letter-spacing: 0.06em;
        }

        .proc-menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 12px;
          color: #475569;
          font-weight: 700;
          font-size: 13.5px;
          text-decoration: none;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
          border: none;
          background: transparent;
          text-align: left;
          width: 100%;
        }

        .proc-menu-item:hover {
          color: #0F172A;
          background: #F1F5F9;
          transform: translateX(2px);
        }

        .proc-menu-item.active {
          color: #FFFFFF !important;
          background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%) !important;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3) !important;
        }

        .proc-menu-item.active i, .proc-menu-item.active svg {
          color: #FFFFFF !important;
          stroke: #FFFFFF !important;
        }

        .proc-menu-item i {
          width: 18px;
          height: 18px;
        }

        .proc-sidebar-footer {
          padding: 16px 20px;
          border-top: 1px solid #F1F5F9;
          display: flex;
          align-items: center;
          gap: 12px;
          background: #F8FAFC;
        }

        .proc-avatar {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%);
          color: #2563EB;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 14px;
          border: 1.5px solid #BFDBFE;
        }

        .proc-user-name {
          font-weight: 800;
          font-size: 13.5px;
          color: #0F172A;
        }

        .proc-user-role {
          font-size: 11px;
          color: #64748B;
          font-weight: 600;
        }

        .proc-main {
          margin-left: 256px;
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          height: calc(100vh / 0.9) !important;
          overflow-y: auto !important;
          background: #F8FAFC;
        }

        .proc-header {
          min-height: 76px;
          background: 
            radial-gradient(circle at 10% 25%, rgba(219, 234, 254, 0.6) 0%, transparent 45%),
            radial-gradient(circle at 92% 75%, rgba(237, 233, 254, 0.45) 0%, transparent 40%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.94) 100%) !important;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1.5px solid rgba(226, 232, 240, 0.9);
          border-radius: 20px;
          margin: 14px 24px 6px 24px;
          padding: 12px 24px 14px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 14px;
          z-index: 1000;
          box-shadow: 
            0 12px 32px -4px rgba(15, 23, 42, 0.06),
            0 4px 12px -2px rgba(37, 99, 235, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }

        /* Header Plan Widget */
        .header-plan-widget {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          background: linear-gradient(135deg, #FFFFFF 0%, #F5F9FF 60%, #EBF3FE 100%);
          border: 1px solid rgba(224, 236, 255, 0.9);
          border-radius: 14px;
          padding: 7px 20px 7px 12px;
          min-width: 140px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 16px -2px rgba(147, 197, 253, 0.28), 0 1px 3px rgba(0, 0, 0, 0.02);
          user-select: none;
        }
        .header-plan-widget:hover {
          transform: translateY(-1.5px);
          box-shadow: 0 8px 22px -2px rgba(147, 197, 253, 0.45);
          border-color: rgba(191, 219, 254, 1);
        }

        /* Header Alerts Widget */
        .header-alerts-widget {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          background: linear-gradient(135deg, #FFFFFF 0%, #FFF8F8 60%, #FFEFEF 100%);
          border: 1px solid rgba(254, 226, 226, 0.9);
          border-radius: 14px;
          padding: 7px 20px 7px 12px;
          min-width: 135px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 16px -2px rgba(252, 165, 165, 0.28), 0 1px 3px rgba(0, 0, 0, 0.02);
          user-select: none;
        }
        .header-alerts-widget:hover {
          transform: translateY(-1.5px);
          box-shadow: 0 8px 22px -2px rgba(252, 165, 165, 0.45);
          border-color: rgba(253, 164, 175, 1);
        }

        /* Bottom futuristic accent strip */
        .header-bottom-accent-strip {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 24px;
          display: flex;
          align-items: flex-end;
          pointer-events: none;
          border-bottom-left-radius: 20px;
          border-bottom-right-radius: 20px;
        }
        .header-bottom-accent-line-left {
          position: absolute;
          left: 19px;
          bottom: 0;
          width: calc(44% - 19px);
          height: 2.5px;
          background: linear-gradient(90deg, #2563EB 0%, #3B82F6 100%);
        }
        .header-bottom-accent-hatch {
          position: absolute;
          left: 44%;
          bottom: -1px;
          height: 8px;
        }
        .header-bottom-accent-line-right {
          position: absolute;
          left: calc(44% + 46px);
          right: 0;
          bottom: 0;
          height: 1px;
          background: #E2E8F0;
        }

        .proc-search-container {
          position: relative;
          width: 360px;
        }

        .proc-search-container i, .proc-search-container svg {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #94A3B8;
          width: 16px;
          height: 16px;
        }

        .proc-search-input {
          width: 100%;
          padding: 10px 14px 10px 40px;
          border-radius: 12px;
          border: 1.5px solid #E2E8F0;
          background: #F8FAFC;
          font-size: 13.5px;
          font-weight: 600;
          color: #0F172A;
          outline: none;
          transition: all 0.2s ease;
        }

        .proc-search-input:focus {
          background: #FFFFFF;
          border-color: #2563EB;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }

        .proc-header-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .proc-notif-btn {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          border: 1px solid #E2E8F0;
          background: #FFFFFF;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          position: relative;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
          transition: all 0.2s ease;
          user-select: none;
        }

        .proc-notif-btn:hover {
          background: #F8FAFC;
          border-color: #CBD5E1;
          transform: translateY(-1px);
        }

        .proc-notif-badge {
          position: absolute;
          top: -2px;
          right: -2px;
          background: #EF4444;
          color: white;
          font-size: 10px;
          font-weight: 900;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
        }

        .proc-content {
          padding: 16px 24px 36px 24px;
          flex-grow: 1;
        }

        .proc-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 26px;
        }

        .proc-title {
          font-size: 26px;
          font-weight: 900;
          color: #0F172A;
          margin: 0 0 4px 0;
          letter-spacing: -0.02em;
        }

        .proc-subtitle {
          font-size: 13.5px;
          color: #64748B;
          margin: 0;
          font-weight: 600;
        }

        .proc-btn {
          padding: 10px 20px;
          border-radius: 12px;
          font-weight: 800;
          font-size: 13.5px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          align-items: center;
          gap: 8px;
          border: none;
        }

        .proc-btn-primary {
          background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
          color: #FFFFFF;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3);
        }

        .proc-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
        }

        .proc-btn-secondary {
          background: #FFFFFF;
          border: 1.5px solid #E2E8F0;
          color: #334155;
          font-weight: 700;
        }

        .proc-btn-secondary:hover {
          background: #F8FAFC;
          border-color: #CBD5E1;
        }

        /* Stats Cards Row */
        .proc-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 28px;
        }

        .proc-stat-card {
          border-radius: 20px;
          padding: 22px 24px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          overflow: hidden;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
        }

        .proc-stat-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 25px -4px rgba(15, 23, 42, 0.09);
        }

        .proc-stat-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 14px;
        }

        .proc-stat-label {
          font-size: 11.5px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 6px;
        }

        .proc-stat-val {
          font-size: 28px;
          font-weight: 900;
          color: #0F172A;
          letter-spacing: -0.03em;
          line-height: 1.1;
        }

        .proc-stat-sub {
          font-size: 12px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .proc-stat-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }

        .proc-stat-icon.blue { background: linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%); color: #2563EB; }
        .proc-stat-icon.orange { background: linear-gradient(135deg, #FFEDD5 0%, #FED7AA 100%); color: #EA580C; }
        .proc-stat-icon.green { background: linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%); color: #16A34A; }
        .proc-stat-icon.purple { background: linear-gradient(135deg, #F3E8FF 0%, #E9D5FF 100%); color: #9333EA; }

        /* Dashboard Layout Split */
        .proc-dash-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 24px;
        }

        .proc-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
        }

        .proc-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .proc-card-title {
          font-size: 17px;
          font-weight: 900;
          color: #0F172A;
          letter-spacing: -0.01em;
        }

        .proc-card-link {
          font-size: 12.5px;
          font-weight: 800;
          color: #2563EB;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .proc-card-link:hover {
          color: #1D4ED8;
          transform: translateX(2px);
        }

        /* Table */
        .proc-table {
          width: 100%;
          border-collapse: collapse;
        }

        .proc-table th {
          text-align: left;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          color: #64748B;
          padding: 12px 16px;
          border-bottom: 1.5px solid #E2E8F0;
          background: #F8FAFC;
          letter-spacing: 0.04em;
        }

        .proc-table td {
          padding: 14px 16px;
          font-size: 13.5px;
          color: #334155;
          border-bottom: 1px solid #F1F5F9;
        }

        .proc-table tr:last-child td {
          border-bottom: none;
        }

        .proc-table tbody tr {
          transition: background 0.15s ease;
        }

        .proc-table tbody tr:hover td {
          background-color: #F8FAFC;
        }

        /* Status Badges */
        .proc-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: 0.01em;
        }

        .proc-badge.sent { background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }
        .proc-badge.confirmed { background: #E0F2FE; color: #0284C7; border: 1px solid #BAE6FD; }
        .proc-badge.partially-delivered { background: #FFF7ED; color: #EA580C; border: 1px solid #FED7AA; }
        .proc-badge.completed { background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; }
        .proc-badge.draft { background: #F1F5F9; color: #64748B; border: 1px solid #E2E8F0; }
        .proc-badge.pending { background: #FFFBEB; color: #B45309; border: 1px solid #FDE68A; }
        .proc-badge.approved { background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; }
        .proc-badge.rejected { background: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA; }

        /* Action Needed Cards */
        .proc-action-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .proc-action-item {
          display: flex;
          gap: 14px;
          padding: 16px;
          border-radius: 14px;
          border: 1px solid transparent;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .proc-action-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06);
        }

        .proc-action-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 2px 6px rgba(0,0,0,0.04);
        }

        .proc-action-icon.orange { background: linear-gradient(135deg, #FFEDD5 0%, #FED7AA 100%); color: #EA580C; }
        .proc-action-icon.red { background: linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%); color: #DC2626; }
        .proc-action-icon.blue { background: linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%); color: #2563EB; }

        .proc-action-title {
          font-size: 14px;
          font-weight: 800;
          color: #0F172A;
          margin-bottom: 3px;
        }

        .proc-action-desc {
          font-size: 12px;
          color: #64748B;
          font-weight: 600;
        }

        /* Modal styling */
        .proc-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          animation: fadeIn 0.2s ease;
        }

        .proc-modal {
          background: #FFFFFF;
          border-radius: 16px;
          width: 100%;
          max-width: 600px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          overflow: hidden;
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .proc-modal-header {
          padding: 20px 24px;
          border-bottom: 1.5px solid #F1F5F9;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .proc-modal-title {
          font-size: 18px;
          font-weight: 800;
          color: #0F172A;
        }

        .proc-close-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          color: #64748B;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .proc-modal-body {
          padding: 24px;
          max-height: 70vh;
          overflow-y: auto;
        }

        .proc-form-group {
          margin-bottom: 16px;
        }

        .proc-form-label {
          display: block;
          font-size: 12.5px;
          font-weight: 700;
          color: #475569;
          margin-bottom: 6px;
        }

        .proc-input, .proc-select {
          width: 100%;
          padding: 10px 12px;
          border: 1.5px solid #E2E8F0;
          border-radius: 8px;
          font-size: 13.5px;
          font-weight: 500;
          outline: none;
          transition: all 0.2s;
          height: 40px;
          box-sizing: border-box;
        }

        .proc-input:focus, .proc-select:focus {
          border-color: #2563EB;
        }

        .proc-modal-footer {
          padding: 16px 24px;
          border-top: 1.5px solid #F1F5F9;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          background: #F8FAFC;
        }

        /* Items Creator Table */
        .proc-items-table {
          width: 100%;
          margin-top: 8px;
          margin-bottom: 16px;
        }

        .proc-items-table th {
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          color: #64748B;
          padding: 8px;
        }

        .proc-items-table td {
          padding: 6px 4px;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .proc-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .proc-form-full {
          grid-column: span 2;
        }

        .proc-filter-row {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
        }

        .proc-filter-search-wrap {
          flex-grow: 1;
          position: relative;
        }

        .proc-filter-search-wrap i, .proc-filter-search-wrap svg {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #94A3B8;
          width: 16px;
          height: 16px;
        }

        .proc-filter-search {
          width: 100%;
          padding: 10px 12px 10px 38px;
          border-radius: 8px;
          border: 1.5px solid #E2E8F0;
          font-size: 13.5px;
          font-weight: 500;
          outline: none;
          transition: all 0.2s;
        }

        .proc-filter-search:focus {
          border-color: #2563EB;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
        }

        .proc-filter-selects {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .proc-badge-type {
          display: inline-flex;
          align-items: center;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
          background: #F1F5F9;
          color: #475569;
        }

        .proc-badge-type.medicine {
          background: #EFF6FF;
          color: #1E40AF;
        }

        .proc-badge-type.surgical {
          background: #FAF5FF;
          color: #6B21A8;
        }

        .proc-badge-type.consumable {
          background: #F8FAFC;
          color: #334155;
          border: 1px solid #E2E8F0;
        }

        .proc-badge-status {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
          border: 1px solid transparent;
        }

        .proc-badge-status.active {
          background: #F0FDF4;
          color: #16A34A;
          border-color: #BBF7D0;
        }

        .proc-badge-status.inactive {
          background: #FEF2F2;
          color: #DC2626;
          border-color: #FCA5A5;
        }

        /* Drawer Backdrop Overlay */
        .proc-drawer-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(4px);
          z-index: 1000;
          display: flex;
          justify-content: flex-end;
          animation: fadeIn 0.25s ease-out;
        }

        /* Drawer container */
        .proc-drawer {
          width: 540px;
          height: 100%;
          background: #FFFFFF;
          box-shadow: -4px 0 24px rgba(15, 23, 42, 0.08);
          display: flex;
          flex-direction: column;
          animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        .proc-drawer-header {
          padding: 24px;
          border-bottom: 1.5px solid #F1F5F9;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .proc-drawer-title {
          font-size: 18px;
          font-weight: 800;
          color: #0F172A;
        }

        .proc-drawer-subtitle {
          font-size: 13px;
          color: #64748B;
          font-weight: 500;
          margin-top: 4px;
        }

        .proc-drawer-body {
          padding: 24px;
          flex-grow: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* Drawer Stats Grid */
        .proc-drawer-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          background: #F8FAFC;
          border: 1.5px solid #E2E8F0;
          border-radius: 12px;
          padding: 16px;
        }

        .proc-drawer-stat-label {
          font-size: 11px;
          font-weight: 700;
          color: #64748B;
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .proc-drawer-stat-val {
          font-size: 16px;
          font-weight: 800;
          color: #0F172A;
        }

        .proc-drawer-stat-sub {
          font-size: 12px;
          color: #64748B;
          font-weight: 500;
          margin-top: 2px;
        }

        /* Drawer Recommendation Banner */
        .proc-rec-banner {
          background: #EFF6FF;
          border: 1.5px solid #BFDBFE;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }

        .proc-rec-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: #3B82F6;
          color: #FFFFFF;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .proc-rec-title {
          font-size: 11px;
          font-weight: 700;
          color: #1D4ED8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .proc-rec-desc {
          font-size: 13.5px;
          font-weight: 800;
          color: #1E293B;
          margin-top: 4px;
        }

        .proc-rec-savings {
          font-size: 12px;
          color: #64748B;
          font-weight: 500;
          margin-top: 2px;
        }

        /* Vendor Option Card */
        .proc-vendor-opt-card {
          border: 1.5px solid #E2E8F0;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s;
          background: #FFFFFF;
        }

        .proc-vendor-opt-card.selected {
          border-color: #3B82F6;
          background: #EFF6FF;
        }

        .proc-vendor-opt-name {
          font-size: 14px;
          font-weight: 800;
          color: #0F172A;
        }

        .proc-vendor-opt-code {
          font-size: 11.5px;
          color: #64748B;
          font-weight: 600;
          margin-top: 2px;
        }

        .proc-vendor-opt-details {
          display: flex;
          gap: 16px;
          margin-top: 12px;
        }

        .proc-vendor-opt-detail-item {
          display: flex;
          flex-direction: column;
        }

        .proc-vendor-opt-detail-label {
          font-size: 10px;
          font-weight: 700;
          color: #64748B;
          text-transform: uppercase;
        }

        .proc-vendor-opt-detail-val {
          font-size: 13px;
          font-weight: 800;
          color: #1E293B;
          margin-top: 2px;
        }

        /* Create PO Fullscreen Layout */
        .proc-create-po-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .proc-create-po-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          background: #FFFFFF;
          border: 1.5px solid #E2E8F0;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 24px;
        }

        .proc-create-po-block {
          background: #FFFFFF;
          border: 1.5px solid #E2E8F0;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 24px;
        }

        .proc-create-po-title {
          font-size: 16px;
          font-weight: 800;
          color: #0F172A;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .proc-create-po-row {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px 0;
          border-bottom: 1px dashed #E2E8F0;
        }

        .proc-create-po-row:last-child {
          border-bottom: none;
        }

        .proc-po-summary-flex {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
          font-size: 14.5px;
          font-weight: 600;
          color: #475569;
        }

        .proc-po-summary-flex.total {
          border-top: 1.5px solid #E2E8F0;
          padding-top: 12px;
          font-size: 18px;
          font-weight: 800;
          color: #0F172A;
        }

        @media (max-width: 1024px) {
          .proc-stats-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 16px !important;
          }
          .proc-dash-grid {
            grid-template-columns: 1fr !important;
            gap: 20px !important;
          }
          .proc-content {
            padding: 16px !important;
          }
          .proc-header {
            padding: 0 16px !important;
          }
          .proc-title-row {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
        }
        @media (max-width: 640px) {
          .proc-stats-grid {
            grid-template-columns: 1fr !important;
          }
          .proc-po-summary-flex.total {
            font-size: 16px !important;
          }
        }

        /* ===================================================
           ADD VENDOR REDESIGN STYLES
           =================================================== */
        .vendor-form-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 1400px;
          margin: 0 auto;
          padding-bottom: 96px;
          animation: fadeIn 0.25s ease;
        }

        .vendor-header-bar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          padding-bottom: 16px;
          border-bottom: 1.5px solid #F1F5F9;
          flex-wrap: wrap;
        }

        .vendor-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #2563EB;
          font-weight: 700;
          font-size: 13.5px;
          cursor: pointer;
          margin-bottom: 8px;
          transition: color 0.15s ease;
        }
        .vendor-back-btn:hover {
          color: #1D4ED8;
          text-decoration: underline;
        }

        .vendor-title-badge-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .vendor-page-title {
          font-size: 24px;
          font-weight: 800;
          color: #0F172A;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .vendor-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.2px;
        }
        .vendor-status-pill.draft {
          background: #FEF3C7;
          color: #92400E;
          border: 1px solid #FDE68A;
        }
        .vendor-status-pill.ready {
          background: #DCFCE7;
          color: #15803D;
          border: 1px solid #BBF7D0;
        }

        .vendor-header-actions {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
        }

        .vendor-btn-group {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .vendor-kbd-hint {
          font-size: 11.5px;
          color: #64748B;
          font-weight: 500;
        }
        .vendor-kbd-hint kbd {
          background: #F1F5F9;
          border: 1px solid #CBD5E1;
          border-radius: 4px;
          padding: 1px 5px;
          font-family: monospace;
          font-size: 10.5px;
          color: #334155;
        }

        /* Horizontal Stepper */
        .vendor-stepper {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 12px 20px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
          overflow-x: auto;
          gap: 8px;
        }

        .vendor-step-node {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          user-select: none;
          transition: all 0.2s ease;
          background: transparent;
          border: none;
          padding: 6px 10px;
          border-radius: 8px;
          text-align: left;
        }
        .vendor-step-node:hover {
          background: #F8FAFC;
        }

        .vendor-step-badge {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 800;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .vendor-step-node.active .vendor-step-badge {
          background: #2563EB;
          color: #FFFFFF;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
        }
        .vendor-step-node.completed .vendor-step-badge {
          background: #EFF6FF;
          color: #2563EB;
          border: 1.5px solid #93C5FD;
        }
        .vendor-step-node.pending .vendor-step-badge {
          background: #F1F5F9;
          color: #64748B;
        }

        .vendor-step-info {
          display: flex;
          flex-direction: column;
        }
        .vendor-step-name {
          font-size: 13px;
          font-weight: 700;
          color: #334155;
          line-height: 1.2;
        }
        .vendor-step-node.active .vendor-step-name {
          color: #2563EB;
          font-weight: 800;
        }
        .vendor-step-sub {
          font-size: 11px;
          color: #94A3B8;
          font-weight: 500;
        }

        .vendor-step-line {
          flex: 1;
          height: 2px;
          background: #E2E8F0;
          min-width: 20px;
          margin: 0 4px;
        }
        .vendor-step-line.completed {
          background: #93C5FD;
        }

        /* Legend Bar */
        .vendor-legend-strip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #F0F7FF;
          border: 1px solid #DBEAFE;
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 12px;
          color: #1E40AF;
          flex-wrap: wrap;
          gap: 12px;
        }

        .vendor-legend-items {
          display: flex;
          align-items: center;
          gap: 18px;
        }
        .vendor-legend-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-weight: 600;
        }

        /* Card Styling */
        .vendor-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 22px 24px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
          scroll-margin-top: 80px;
          transition: all 0.2s ease;
        }
        .vendor-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 18px;
          padding-bottom: 14px;
          border-bottom: 1px solid #F1F5F9;
        }
        .vendor-card-title-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .vendor-card-icon-box {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .vendor-card-icon-box.blue {
          background: #EFF6FF;
          color: #2563EB;
        }
        .vendor-card-icon-box.purple {
          background: #F5F3FF;
          color: #7C3AED;
        }
        .vendor-card-icon-box.amber {
          background: #FEF3C7;
          color: #D97706;
        }
        .vendor-card-icon-box.green {
          background: #ECFDF5;
          color: #059669;
        }
        .vendor-card-icon-box.slate {
          background: #F1F5F9;
          color: #475569;
        }

        .vendor-card-title {
          font-size: 15px;
          font-weight: 800;
          color: #0F172A;
          margin: 0;
        }
        .vendor-card-subtitle {
          font-size: 12px;
          color: #64748B;
          margin: 2px 0 0 0;
          font-weight: 500;
        }

        .vendor-subsection-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
          color: #334155;
          margin: 20px 0 14px 0;
          padding-bottom: 6px;
          border-bottom: 1px dashed #E2E8F0;
        }

        /* Fields & Inputs */
        .vendor-form-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px 18px;
        }
        .vendor-form-grid-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 14px 18px;
        }
        .vendor-form-grid-4 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr;
          gap: 14px 18px;
        }

        .vendor-input-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .vendor-input-group.full-width {
          grid-column: 1 / -1;
        }

        .vendor-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          font-weight: 600;
          color: #334155;
        }
        .vendor-required-star {
          color: #EF4444;
          font-weight: 700;
          margin-left: 2px;
        }
        .vendor-optional-tag {
          font-size: 11px;
          color: #94A3B8;
          font-weight: 500;
        }
        .vendor-autogen-tag {
          font-size: 10.5px;
          color: #0284C7;
          font-weight: 700;
          background: #E0F2FE;
          padding: 1px 6px;
          border-radius: 4px;
        }

        .vendor-input-icon-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .vendor-input-prefix-icon {
          position: absolute;
          left: 10px;
          color: #94A3B8;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          font-size: 14px;
        }

        .vendor-input {
          width: 100%;
          height: 38px;
          border: 1px solid #CBD5E1;
          border-radius: 8px;
          padding: 0 12px;
          font-size: 13px;
          font-weight: 500;
          color: #0F172A;
          background: #FFFFFF;
          outline: none;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }
        .vendor-input.with-prefix {
          padding-left: 36px;
        }
        .vendor-input:focus {
          border-color: #2563EB;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }
        .vendor-input:disabled, .vendor-input.readonly {
          background: #F8FAFC;
          color: #64748B;
          border-color: #E2E8F0;
          cursor: not-allowed;
        }

        .vendor-select {
          width: 100%;
          height: 38px;
          border: 1px solid #CBD5E1;
          border-radius: 8px;
          padding: 0 12px;
          font-size: 13px;
          font-weight: 500;
          color: #0F172A;
          background: #FFFFFF;
          outline: none;
          transition: all 0.2s ease;
          cursor: pointer;
          box-sizing: border-box;
        }
        .vendor-select.with-prefix {
          padding-left: 36px;
        }
        .vendor-select:focus {
          border-color: #2563EB;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }

        .vendor-textarea {
          width: 100%;
          border: 1px solid #CBD5E1;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 500;
          color: #0F172A;
          background: #FFFFFF;
          outline: none;
          transition: all 0.2s ease;
          font-family: inherit;
          resize: vertical;
          box-sizing: border-box;
        }
        .vendor-textarea:focus {
          border-color: #2563EB;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }

        /* Callouts */
        .vendor-callout-info {
          background: #EFF6FF;
          border: 1px solid #DBEAFE;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 12.5px;
          color: #1E40AF;
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 14px;
        }
        .vendor-callout-tip {
          background: #F0FDF4;
          border: 1px solid #BBF7D0;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 12.5px;
          color: #166534;
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 14px;
        }

        /* Sticky Bottom Bar */
        .vendor-sticky-footer {
          position: fixed;
          bottom: 0;
          left: 256px;
          right: 0;
          background: rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(10px);
          border-top: 1px solid #E2E8F0;
          padding: 12px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 100;
          box-shadow: 0 -4px 16px rgba(15, 23, 42, 0.05);
          transition: left 0.2s ease;
        }
        @media (max-width: 1024px) {
          .vendor-sticky-footer {
            left: 0 !important;
          }
          .vendor-form-grid-2, .vendor-form-grid-3, .vendor-form-grid-4 {
            grid-template-columns: 1fr !important;
          }
        }

        .vendor-footer-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          font-weight: 600;
          color: #475569;
        }
        .vendor-pulse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10B981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
        }
      `}</style>

      {notification && (
        <div 
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: notification.type === 'error' ? '#EF4444' : '#10B981',
            color: '#FFFFFF',
            padding: '12px 20px',
            borderRadius: '10px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 9999,
            animation: 'fadeIn 0.25s ease'
          }}
        >
          <div style={{ 
            width: '18px', 
            height: '18px', 
            borderRadius: '50%', 
            background: '#FFFFFF',
            color: notification.type === 'error' ? '#EF4444' : '#10B981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 900
          }}>
            {notification.type === 'error' ? '✕' : '✓'}
          </div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>{notification.message}</span>
        </div>
      )}

      {/* Mobile Sidebar Backdrop Overlay */}
      {mobileSidebarOpen && (
        <div 
          className="mobile-backdrop" 
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <div className="proc-container">
        {/* SIDEBAR MATCHING CUROXA ADMIN / FRONT DESK SPEC */}
        <aside className={`proc-sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`} onClick={() => setMobileSidebarOpen(false)}>
          <div className="proc-sidebar-brand" style={{ padding: '20px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img 
              src={curoxaSidebarLogo} 
              alt="CUROXA" 
              style={{
                width: '42px',
                height: '42px',
                objectFit: 'contain',
                flexShrink: 0,
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))'
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 900, fontSize: '18px', color: '#0F172A', letterSpacing: '0.03em', lineHeight: 1.1 }}>
                CUROXA
              </span>
              <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '3px' }}>
                Procurement Suite
              </span>
            </div>
          </div>

          <nav className="proc-sidebar-menu" style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '4px', flexGrow: 1, overflowY: 'auto' }}>
            {/* GROUP 1: OVERVIEW */}
            <div style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', color: '#2563EB', padding: '8px 12px 4px', letterSpacing: '0.05em' }}>
              • OVERVIEW
            </div>
            <button 
              className={`proc-menu-item ${activeTab === 'dashboard' ? 'active' : ''}`} 
              onClick={() => setActiveTab('dashboard')}
              style={{ position: 'relative' }}
            >
              {activeTab === 'dashboard' && (
                <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#2563EB' }} />
              )}
              <i data-lucide="layout-grid"></i> Dashboard
            </button>

            {/* GROUP 2: VENDORS & PROCUREMENT */}
            <div style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', color: '#059669', padding: '14px 12px 4px', letterSpacing: '0.05em' }}>
              • VENDORS & PROCUREMENT
            </div>
            <button className={`proc-menu-item ${activeTab === 'vendors' ? 'active' : ''}`} onClick={() => setActiveTab('vendors')}>
              <i data-lucide="users"></i> Vendors & Catalogs
            </button>
            <button className={`proc-menu-item ${activeTab === 'pos' ? 'active' : ''}`} onClick={() => setActiveTab('pos')}>
              <i data-lucide="file-text"></i> Purchase Orders
            </button>
            <button className={`proc-menu-item ${activeTab === 'grn' ? 'active' : ''}`} onClick={() => setActiveTab('grn')}>
              <i data-lucide="package"></i> Goods Receipts (GRN)
            </button>
            <button className={`proc-menu-item ${activeTab === 'catalog-approvals' ? 'active' : ''}`} onClick={() => setActiveTab('catalog-approvals')}>
              <i data-lucide="check-square"></i> Catalog Approvals
              {catalogApprovals.filter(a => (a.status || '').toLowerCase() === 'pending').length > 0 && (
                <span style={{ marginLeft: 'auto', background: '#FEF3C7', color: '#B45309', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 800 }}>
                  {catalogApprovals.filter(a => (a.status || '').toLowerCase() === 'pending').length}
                </span>
              )}
            </button>

            {/* GROUP 3: FINANCIALS & SETTLEMENTS */}
            <div style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', color: '#9333EA', padding: '14px 12px 4px', letterSpacing: '0.05em' }}>
              • FINANCIALS & SETTLEMENTS
            </div>
            <button className={`proc-menu-item ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>
              <i data-lucide="credit-card"></i> Vendor Payments
            </button>

            {/* GROUP 4: SYSTEM */}
            <div style={{ margin: '14px 0 6px 0', borderTop: '1px solid #F1F5F9' }}></div>
            <button className="proc-menu-item" style={{ color: '#64748B' }} onClick={handleExitProcurement}>
              <i data-lucide="arrow-left"></i> Exit to Pharmacy
            </button>
          </nav>

          <div className="proc-sidebar-footer" style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', borderTop: '1px solid #F1F5F9', padding: '14px 18px', background: '#F8FAFC' }} onClick={() => setShowUserDropdown(!showUserDropdown)}>
            <div className="proc-avatar" style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', color: '#FFFFFF', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>
              {currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'PA'}
            </div>
            <div style={{ flexGrow: 1, overflow: 'hidden' }}>
              <div className="proc-user-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 800, fontSize: '13px', color: '#0F172A' }}>{currentUser.name}</div>
              <div className="proc-user-role" style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Pharmacy Admin</div>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showUserDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}><polyline points="18 15 12 9 6 15"/></svg>
            
            {showUserDropdown && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: '0px',
                right: '0px',
                marginBottom: '8px',
                background: 'white',
                border: '1.5px solid #E2E8F0',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -3px rgba(0,0,0,0.12)',
                padding: '6px',
                zIndex: 99
              }} onClick={e => e.stopPropagation()}>
                <button 
                  onClick={handleExitProcurement}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    border: 'none',
                    background: 'none',
                    borderRadius: '8px',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    marginBottom: '4px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <i data-lucide="arrow-left" style={{ width: '14px', height: '14px' }}></i>
                  Exit to Pharmacy
                </button>
                <div style={{ borderTop: '1px solid #F1F5F9', margin: '4px 6px' }}></div>
                <button 
                  onClick={handleLogout}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    border: 'none',
                    background: 'none',
                    borderRadius: '8px',
                    color: '#EF4444',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <i data-lucide="log-out" style={{ width: '14px', height: '14px' }}></i>
                  Logout
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* MAIN WINDOW */}
        <main className="proc-main" data-lenis-prevent>
          {/* FLAGSHIP COMMAND HEADER */}
          <header className="proc-header">
            {/* Left command pill & dynamic tab title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', position: 'relative', zIndex: 2 }}>
              <div style={{ 
                width: '44px', 
                height: '44px', 
                borderRadius: '14px', 
                background: 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 50%, #4F46E5 100%)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                color: '#FFFFFF',
                boxShadow: '0 8px 20px -3px rgba(37, 99, 235, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.4)',
                flexShrink: 0,
                border: '1px solid rgba(255, 255, 255, 0.25)'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <polyline points="9 12 11 14 15 10"/>
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18.5px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em', fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif" }}>
                    {activeTab === 'dashboard' && 'Procurement Command Center'}
                    {activeTab === 'vendors' && 'Vendors & Supplier Catalogs'}
                    {activeTab === 'pos' && (isCreatingPO ? (editingDraftPO ? 'Resume Purchase Order' : 'Create Purchase Order') : 'Purchase Orders')}
                    {activeTab === 'grn' && 'Goods Receipt Notes (GRN)'}
                    {activeTab === 'approvals' && 'Catalog Approvals & Price Lists'}
                    {activeTab === 'vendor-payments' && 'Vendor Payments & Settlements'}
                  </span>
                  <span style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '4.5px', 
                    padding: '2.5px 9px', 
                    borderRadius: '20px', 
                    fontSize: '10px', 
                    fontWeight: 850, 
                    background: '#ECFDF5', 
                    color: '#059669', 
                    border: '1px solid #A7F3D0',
                    letterSpacing: '0.04em'
                  }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 5px #10B981' }}></span>
                    SYSTEM ACTIVE
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748B', fontWeight: 600, marginTop: '3px' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                  <span>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span style={{ color: '#CBD5E1' }}>|</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <span style={{ color: '#334155', fontWeight: 750 }}>{currentUser.name || 'Pharmacy-1'}</span>
                  <span style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 600 }}>({currentUser.tenantName || 'Main Pharmacy Store'})</span>
                </div>
              </div>
            </div>

            {/* Right Quick Status, Search & Notification Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', position: 'relative', zIndex: 2 }}>
              {/* 1. Procurement Unit / Facility Status Widget */}
              <div 
                className="header-plan-widget"
                onClick={() => setActiveTab('dashboard')}
                title="Procurement Suite Active Workspace"
              >
                <div style={{ position: 'absolute', top: '7px', right: '10px', width: '6.5px', height: '6.5px', borderRadius: '50%', background: '#22C55E', border: '1.5px solid #FFFFFF', boxShadow: '0 0 6px rgba(34, 197, 94, 0.6)', zIndex: 3 }} />
                <svg 
                  viewBox="0 0 70 50" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ position: 'absolute', right: 0, bottom: 0, width: '46px', height: '34px', pointerEvents: 'none', zIndex: 1 }}
                >
                  <path d="M10 50 C24 45 36 28 46 14 C52 4 60 0 70 0 L70 50 Z" fill="url(#procPlanWaveLight)" opacity="0.65" />
                  <path d="M22 50 C36 46 44 32 54 18 C58 8 64 3 70 2 L70 50 Z" fill="url(#procPlanWaveAccent)" opacity="0.4" />
                  <defs>
                    <linearGradient id="procPlanWaveLight" x1="10" y1="0" x2="70" y2="50" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#93C5FD" stopOpacity="0.8" />
                      <stop offset="0.6" stopColor="#60A5FA" stopOpacity="0.9" />
                      <stop offset="1" stopColor="#3B82F6" />
                    </linearGradient>
                    <linearGradient id="procPlanWaveAccent" x1="22" y1="0" x2="70" y2="50" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#BFDBFE" stopOpacity="0.6" />
                      <stop offset="1" stopColor="#60A5FA" stopOpacity="0.8" />
                    </linearGradient>
                  </defs>
                </svg>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, position: 'relative', zIndex: 2 }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <polyline points="9 12 11 14 15 10"/>
                </svg>
                <div style={{ width: '1px', height: '22px', background: 'rgba(226, 232, 240, 0.95)', margin: '0 10px 0 8px', flexShrink: 0, position: 'relative', zIndex: 2 }} />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, paddingRight: '12px', position: 'relative', zIndex: 2 }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A', lineHeight: 1.15, letterSpacing: '-0.01em', fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif" }}>
                    Procurement Suite
                  </span>
                  <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#2563EB', lineHeight: 1.15, marginTop: '2px' }}>
                    Hospital Store • Live
                  </span>
                </div>
              </div>

              {/* 2. Operational Pending Queue Widget */}
              <div 
                className="header-alerts-widget" 
                onClick={() => setActiveTab('grn')}
                title="Deliveries Awaiting Inspection"
              >
                <svg 
                  viewBox="0 0 75 55" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ position: 'absolute', right: 0, bottom: 0, width: '48px', height: '36px', pointerEvents: 'none', zIndex: 1 }}
                >
                  <path d="M8 55 C22 48 34 30 46 13 C54 2 64 0 75 0 L75 55 Z" fill="url(#procAlertWaveLight)" opacity="0.65" />
                  <path d="M20 55 C34 49 44 34 54 20 C60 9 67 3 75 2 L75 55 Z" fill="url(#procAlertWaveAccent)" opacity="0.4" />
                  <defs>
                    <linearGradient id="procAlertWaveLight" x1="8" y1="0" x2="75" y2="55" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#FECDD3" stopOpacity="0.85" />
                      <stop offset="0.5" stopColor="#FDA4AF" stopOpacity="0.9" />
                      <stop offset="1" stopColor="#F87171" />
                    </linearGradient>
                    <linearGradient id="procAlertWaveAccent" x1="20" y1="0" x2="75" y2="55" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#FFE4E6" stopOpacity="0.6" />
                      <stop offset="1" stopColor="#FB7185" stopOpacity="0.8" />
                    </linearGradient>
                  </defs>
                </svg>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, position: 'relative', zIndex: 2 }}>
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div style={{ width: '1px', height: '22px', background: 'rgba(254, 205, 211, 0.95)', margin: '0 10px 0 8px', flexShrink: 0, position: 'relative', zIndex: 2 }} />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, paddingRight: '12px', position: 'relative', zIndex: 2 }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A', lineHeight: 1.15, letterSpacing: '-0.01em', fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif" }}>
                    {getDisplayPOs().filter(p => !p.isParent && p.vendorName !== 'Consolidated Multiple Suppliers' && !(p.vendorOrders && p.vendorOrders.length > 0) && ['Approved', 'Sent', 'Confirmed', 'Partially Delivered'].includes(p.status)).length} Pending
                  </span>
                  <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#EF4444', lineHeight: 1.15, marginTop: '2px' }}>
                    Deliveries Queue
                  </span>
                </div>
              </div>

              {/* Search Container with Instant Dropdown */}
              <div className="proc-search-container" style={{ width: '280px', position: 'relative' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input 
                  type="text" 
                  className="proc-search-input" 
                  placeholder="Search vendors, POs, items..." 
                  value={searchQuery}
                  onFocus={() => setShowSearchDropdown(true)}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setShowSearchDropdown(true);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      setShowSearchDropdown(false);
                    }
                  }}
                  style={{ 
                    padding: '8px 30px 8px 36px', 
                    fontSize: '12.5px',
                    background: '#FFFFFF',
                    border: searchQuery ? '1.5px solid #2563EB' : '1.5px solid rgba(226, 232, 240, 0.9)',
                    boxShadow: searchQuery ? '0 0 0 3px rgba(37, 99, 235, 0.12)' : '0 2px 6px rgba(15, 23, 42, 0.02)',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                />
                {searchQuery && (
                  <button 
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setShowSearchDropdown(false);
                    }}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      background: '#F1F5F9',
                      color: '#64748B',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 800,
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0
                    }}
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}

                {/* Instant Universal Search Dropdown Flyout */}
                {showSearchDropdown && searchQuery.trim().length > 0 && !selectedVendorProfile && !selectedGrnDetails && !showGRNModal && !showPaymentModal && !previewPoDetails && (() => {
                  const q = searchQuery.trim().toLowerCase();
                  const matchedPOs = (purchaseOrders || []).filter(po => 
                    (po.poId && po.poId.toLowerCase().includes(q)) ||
                    (po.vendorName && po.vendorName.toLowerCase().includes(q)) ||
                    (po.status && po.status.toLowerCase().includes(q)) ||
                    (po.items && po.items.some(i => (i.name && i.name.toLowerCase().includes(q)) || (i.sku && i.sku.toLowerCase().includes(q))))
                  ).slice(0, 4);

                  const matchedVendors = (vendors || []).filter(v =>
                    (v.name && v.name.toLowerCase().includes(q)) ||
                    (v.code && v.code.toLowerCase().includes(q)) ||
                    (v.supplierCategory && v.supplierCategory.toLowerCase().includes(q)) ||
                    (v.city && v.city.toLowerCase().includes(q))
                  ).slice(0, 3);

                  const catMap = new Map();
                  (medicines || []).forEach(m => {
                    if (m && m.name) catMap.set(m.name.trim().toLowerCase(), { name: m.name, sku: m.sku || '', stock: m.stock || 0 });
                  });
                  (vendors || []).forEach(v => {
                    (v.medicines || []).forEach(vm => {
                      if (vm && vm.name) {
                        const k = vm.name.trim().toLowerCase();
                        if (!catMap.has(k)) catMap.set(k, { name: vm.name, sku: vm.sku || '', stock: 0 });
                      }
                    });
                  });
                  const allCatalog = Array.from(catMap.values());
                  const matchedMeds = allCatalog.filter(m => 
                    (m.name && m.name.toLowerCase().includes(q)) || 
                    (m.sku && m.sku.toLowerCase().includes(q))
                  ).slice(0, 3);

                  const totalMatches = matchedPOs.length + matchedVendors.length + matchedMeds.length;

                  return (
                    <div 
                      data-lenis-prevent
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        width: '380px',
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1.5px solid #CBD5E1',
                        boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.25), 0 8px 16px -4px rgba(15, 23, 42, 0.1)',
                        zIndex: 999999,
                        padding: '10px',
                        maxHeight: '450px',
                        overflowY: 'auto',
                        animation: 'fadeIn 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px 10px', borderBottom: '1px solid #F1F5F9' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quick Search Results</span>
                        <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '1px 6px', borderRadius: '4px' }}>{totalMatches} Found</span>
                      </div>

                      {totalMatches === 0 ? (
                        <div style={{ padding: '24px 12px', textAlign: 'center', color: '#94A3B8', fontSize: '12.5px', fontStyle: 'italic' }}>
                          No matching POs, suppliers, or catalog medicines for "{searchQuery}".
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px' }}>
                          {/* PO Matches */}
                          {matchedPOs.length > 0 && (
                            <div>
                              <div style={{ fontSize: '10px', fontWeight: 850, color: '#94A3B8', textTransform: 'uppercase', padding: '2px 8px 4px', letterSpacing: '0.05em' }}>Purchase Orders</div>
                              {matchedPOs.map(po => (
                                <div 
                                  key={po._id} 
                                  onClick={() => {
                                    setSearchQuery('');
                                    setShowSearchDropdown(false);
                                    setActiveTab('pos');
                                    setIsCreatingPO(false);
                                  }}
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'background 0.15s ease'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1D4ED8', fontSize: '12.5px' }}>{po.poId}</span>
                                      <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', background: '#EFF6FF', color: '#1E40AF' }}>{po.status}</span>
                                    </div>
                                    <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>{po.vendorName}</div>
                                  </div>
                                  <span style={{ fontSize: '12.5px', fontWeight: 850, color: '#0F172A' }}>₹{Math.round(po.totalAmount || 0).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Vendor Matches */}
                          {matchedVendors.length > 0 && (
                            <div>
                              <div style={{ fontSize: '10px', fontWeight: 850, color: '#94A3B8', textTransform: 'uppercase', padding: '6px 8px 4px', letterSpacing: '0.05em', borderTop: '1px dashed #F1F5F9' }}>Suppliers / Vendors</div>
                              {matchedVendors.map(v => (
                                <div 
                                  key={v._id} 
                                  onClick={() => {
                                    setSearchQuery('');
                                    setShowSearchDropdown(false);
                                    setActiveTab('vendors');
                                    setIsCreatingPO(false);
                                    setSelectedVendorProfile(v);
                                  }}
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'background 0.15s ease'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                  <div>
                                    <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '13px' }}>{v.name}</div>
                                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Code: {v.code} · {v.type || 'Manufacturer'}</div>
                                  </div>
                                  <span style={{ fontSize: '10.5px', fontWeight: 750, color: '#2563EB', background: '#EFF6FF', padding: '2px 7px', borderRadius: '6px' }}>
                                    View Profile →
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Medicine Matches */}
                          {matchedMeds.length > 0 && (
                            <div>
                              <div style={{ fontSize: '10px', fontWeight: 850, color: '#94A3B8', textTransform: 'uppercase', padding: '6px 8px 4px', letterSpacing: '0.05em', borderTop: '1px dashed #F1F5F9' }}>Catalog Medicines</div>
                              {matchedMeds.map((m, mIdx) => (
                                <div 
                                  key={mIdx}
                                  onClick={() => {
                                    setSearchQuery('');
                                    setShowSearchDropdown(false);
                                    if (isCreatingPO) {
                                      setPoScreenItems(prev => {
                                        const updated = [...prev];
                                        const lastIdx = updated.length - 1;
                                        if (lastIdx >= 0 && !updated[lastIdx].sku) {
                                          updated[lastIdx] = { ...updated[lastIdx], name: m.name, sku: m.sku };
                                        } else {
                                          updated.push({ name: m.name, sku: m.sku, qty: 100, price: 0, discount: 0, tax: 12 });
                                        }
                                        return updated;
                                      });
                                    }
                                  }}
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: '8px',
                                    cursor: isCreatingPO ? 'pointer' : 'default',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'background 0.15s ease'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                  <div>
                                    <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '12.5px' }}>{m.name}</div>
                                    <div style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>SKU: {m.sku}</div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '10.5px', color: '#16A34A', background: '#F0FDF4', padding: '2px 6px', borderRadius: '4px', fontWeight: 750 }}>Stock: {m.stock}</span>
                                    {isCreatingPO && (
                                      <span style={{ fontSize: '10.5px', color: '#2563EB', fontWeight: 800 }}>+ Add</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Flagship Bell Widget */}
              <div 
                className="proc-notif-btn" 
                onClick={handleToggleNotif} 
                style={{ 
                  width: '42px', 
                  height: '42px', 
                  borderRadius: '12px', 
                  border: '1px solid #E2E8F0', 
                  background: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative', 
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                  transition: 'all 0.2s ease'
                }}
                title="Notifications"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
                </svg>
                {unreadCount > 0 && <span className="proc-notif-badge">{unreadCount}</span>}
              </div>

              {showNotifDropdown && (
                <div className="proc-notif-dropdown" style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '10px',
                  width: '340px',
                  background: '#ffffff',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '16px',
                  boxShadow: '0 15px 35px rgba(15, 23, 42, 0.15)',
                  zIndex: 2000,
                  maxHeight: '380px',
                  overflowY: 'auto',
                  padding: '12px'
                }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px', marginBottom: '10px' }}>
                    <span style={{ fontWeight: 900, fontSize: '13.5px', color: '#0F172A' }}>Procurement Notifications</span>
                    <span style={{ fontSize: '11px', color: '#2563EB', cursor: 'pointer', fontWeight: 800 }} onClick={() => {
                      const allIds = notifications.map(n => n.id);
                      setReadNotifIds(allIds);
                      localStorage.setItem('read_notif_ids', JSON.stringify(allIds));
                    }}>Mark all read</span>
                  </div>
                  {notifications.filter(n => !readNotifIds.includes(n.id)).length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '12.5px', fontWeight: 600 }}>
                      No unread notifications
                    </div>
                  ) : (
                    notifications.filter(n => !readNotifIds.includes(n.id)).map(notif => (
                      <div key={notif.id} style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        marginBottom: '6px',
                        background: notif.type === 'success' ? '#F0FDF4' : '#FEF2F2',
                        borderLeft: notif.type === 'success' ? '4px solid #16A34A' : '4px solid #EF4444',
                        fontSize: '12px',
                        textAlign: 'left'
                      }}>
                        <div style={{ fontWeight: 800, color: '#1E293B', lineHeight: '1.4' }}>{notif.title}</div>
                        <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '4px', fontWeight: 600 }}>{notif.time}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Bottom futuristic accent strip */}
            <div className="header-bottom-accent-strip">
              <div className="header-bottom-accent-line-left" />
              <div className="header-bottom-accent-hatch">
                <svg width="46" height="8" viewBox="0 0 46 8" fill="none">
                  <line x1="1" y1="8" x2="7" y2="0" stroke="#2563EB" strokeWidth="1.5" />
                  <line x1="9" y1="8" x2="15" y2="0" stroke="#2563EB" strokeWidth="1.5" />
                  <line x1="17" y1="8" x2="23" y2="0" stroke="#2563EB" strokeWidth="1.5" />
                  <line x1="25" y1="8" x2="31" y2="0" stroke="#3B82F6" strokeWidth="1.5" />
                  <line x1="33" y1="8" x2="39" y2="0" stroke="#93C5FD" strokeWidth="1.5" />
                </svg>
              </div>
              <div className="header-bottom-accent-line-right" />
            </div>
          </header>

          {/* DYNAMIC CONTENT VIEW */}
          <div className="proc-content">
            {/* VIEW 1: DASHBOARD */}
            {activeTab === 'dashboard' && (
              <div>
                {/* WELCOME HERO BANNER MATCHING RECEPTIONIST / ADMIN HERO */}
                <div style={{ 
                  background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)', 
                  border: '1px solid #E2E8F0', 
                  borderRadius: '20px', 
                  padding: '24px 28px', 
                  marginBottom: '26px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '16px',
                  boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.04)'
                }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.06em' }}>
                      WELCOME BACK,
                    </div>
                    <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '2px 0 4px 0', letterSpacing: '-0.02em' }}>
                      {currentUser.name}
                    </h1>
                    <p style={{ fontSize: '13px', color: '#64748B', margin: 0, fontWeight: 600 }}>
                      Here's what's happening across your hospital procurement & vendor supply chain today.
                    </p>
                  </div>

                  {/* Top Action CTAs */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button 
                      className="proc-btn" 
                      style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', color: '#FFFFFF', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)' }}
                      onClick={() => {
                        fetchNextPoNumber();
                        setPoScreenOrderDate(new Date().toISOString().split('T')[0]);
                        setPoScreenExpectedDelivery(new Date(Date.now() + 4*24*60*60*1000).toISOString().split('T')[0]);
                        setPoScreenDefaultVendor('');
                        const initialItems = [{ sku: '', qty: 100, vendorId: '', price: 0, discount: 0, tax: 12 }];
                        setPoScreenItems(initialItems);
                        setPoScreenNotes('');
                        setEditingDraftPO(null);
                        setIsCreatingPO(true);
                        setActiveTab('pos');
                      }}
                    >
                      <i data-lucide="plus"></i> New Purchase Order
                    </button>

                    <button 
                      className="proc-btn" 
                      style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)', color: '#FFFFFF', boxShadow: '0 4px 14px rgba(124, 58, 237, 0.3)' }}
                      onClick={() => setActiveTab('grn')}
                    >
                      <i data-lucide="package-check"></i> Goods Receipts
                    </button>
                  </div>
                </div>

                {/* 4 HERO KPI STAT CARDS (MATCHING ADMIN PORTAL DESIGN LANGUAGE) */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '16px',
                  width: '100%',
                  marginBottom: '26px',
                  boxSizing: 'border-box'
                }}>
                  {/* CARD 1: ACTIVE VENDORS (Electric Blue Theme) */}
                  <div 
                    style={{
                      padding: '18px 20px',
                      borderRadius: '16px',
                      border: '1px solid rgba(191, 219, 254, 0.95)',
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
                    onClick={() => setActiveTab('vendors')}
                    title="View vendor directory"
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
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      </div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        ACTIVE VENDORS
                      </span>
                    </div>

                    <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                          {getDisplayVendors().length}
                        </div>
                        <div style={{ fontSize: '12px', color: '#1D4ED8', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                          ● {getDisplayVendors().filter(v => v.status === 'Active').length} Active Partners
                        </div>
                      </div>

                      {/* Blue Mini Sparkline */}
                      <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="dashBlueGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#dashBlueGrad)" />
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

                  {/* CARD 2: OPEN PURCHASE ORDERS (Warm Amber / Orange Theme) */}
                  <div 
                    style={{
                      padding: '18px 20px',
                      borderRadius: '16px',
                      border: '1px solid rgba(254, 215, 170, 0.95)',
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
                    onClick={() => { setPoFilter('awaiting'); setActiveTab('pos'); }}
                    title="View open purchase orders"
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
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                      </div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#78350F', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        OPEN PURCHASE ORDERS
                      </span>
                    </div>

                    <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                          {getDisplayPOs().filter(p => ['Approved', 'Sent', 'Confirmed', 'Partially Delivered'].includes(p.status)).length}
                        </div>
                        <div style={{ fontSize: '12px', color: '#D97706', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                          ● Awaiting Delivery
                        </div>
                      </div>

                      {/* Amber Mini Sparkline */}
                      <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="dashAmberGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22 L 64 32 L 0 32 Z" fill="url(#dashAmberGrad)" />
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

                  {/* CARD 3: TOTAL PURCHASES (MTD) (Emerald / Mint Green Theme) */}
                  <div 
                    style={{
                      padding: '18px 20px',
                      borderRadius: '16px',
                      border: '1px solid rgba(167, 243, 208, 0.95)',
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
                    onClick={() => setActiveTab('settlements')}
                    title="View monthly procurement spending"
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
                        <span style={{ fontSize: '16px', fontWeight: 900, lineHeight: 1 }}>₹</span>
                      </div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#064E3B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        TOTAL PURCHASES (MTD)
                      </span>
                    </div>

                    <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                          {calculateMtdPurchases() >= 1000 ? `₹${(calculateMtdPurchases() / 1000).toFixed(1)}K` : `₹${calculateMtdPurchases().toLocaleString('en-IN')}`}
                        </div>
                        <div style={{ fontSize: '12px', color: '#059669', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                          ↑ {new Date().toLocaleString('default', { month: 'short', year: 'numeric' })} Total
                        </div>
                      </div>

                      {/* Green Mini Sparkline */}
                      <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="dashGreenGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10B981" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#10B981" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10 L 64 32 L 0 32 Z" fill="url(#dashGreenGrad)" />
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

                  {/* CARD 4: OUTSTANDING PAYABLE (Purple / Violet Theme) */}
                  <div 
                    style={{
                      padding: '18px 20px',
                      borderRadius: '16px',
                      border: '1px solid rgba(233, 213, 255, 0.95)',
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
                    onClick={() => setActiveTab('settlements')}
                    title="View outstanding invoices"
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
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
                      </div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#581C87', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        OUTSTANDING PAYABLE
                      </span>
                    </div>

                    <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                          {calculateOutstandingPayable() >= 1000 ? `₹${(calculateOutstandingPayable() / 1000).toFixed(1)}K` : `₹${calculateOutstandingPayable().toLocaleString('en-IN')}`}
                        </div>
                        <div style={{ fontSize: '12px', color: '#7C3AED', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                          ● {getDisplayPOs().filter(p => p.status !== 'Draft' && p.status !== 'Completed').length} Pending Invoices
                        </div>
                      </div>

                      {/* Purple Mini Sparkline */}
                      <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="dashPurpleGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#dashPurpleGrad)" />
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
                </div>

                {/* DOUBLE COLUMN SPLIT */}
                <div className="proc-dash-grid">
                  {/* LEFT: Recent POs */}
                  <div className="proc-card">
                    <div className="proc-card-header">
                      <div>
                        <span className="proc-card-title">Recent Purchase Orders</span>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', fontWeight: 500 }}>Latest procurement transactions and order statuses</div>
                      </div>
                      <span className="proc-card-link" onClick={() => setActiveTab('pos')}>View all orders &rarr;</span>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table className="proc-table">
                        <thead>
                          <tr>
                            <th>PO Number</th>
                            <th>Vendor</th>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getDisplayPOs().length > 0 ? (
                            getDisplayPOs().map(po => {
                              const isMaster = po.isParent || po.vendorName === 'Consolidated Multiple Suppliers' || (po.vendorOrders && po.vendorOrders.length > 0);
                              const isChild = Boolean(po.parentPOId);

                              // If child PO and its parent is collapsed, hide this row
                              if (isChild && collapsedMasterPOs[po.parentPOId]) {
                                return null;
                              }

                              const isCollapsed = isMaster && collapsedMasterPOs[po.poId];

                              return (
                                <tr 
                                  key={po._id} 
                                  onClick={isMaster ? () => toggleMasterPO(po.poId) : undefined}
                                  style={{ 
                                    background: isMaster 
                                      ? (isCollapsed ? 'linear-gradient(90deg, #EFF6FF 0%, #F8FAFC 100%)' : 'linear-gradient(90deg, #EFF6FF 0%, #F1F5F9 55%, #F8FAFC 100%)') 
                                      : (isChild ? '#FFFFFF' : undefined),
                                    borderLeft: isMaster ? '4px solid #2563EB' : '4px solid transparent',
                                    borderTop: isMaster ? '1.5px solid #DBEAFE' : undefined,
                                    borderBottom: isMaster ? (isCollapsed ? '1.5px solid #DBEAFE' : '1px solid #DBEAFE') : (isChild ? '1px solid #F1F5F9' : undefined),
                                    cursor: isMaster ? 'pointer' : 'default',
                                    transition: 'background-color 0.15s ease'
                                  }}
                                  title={isMaster ? (isCollapsed ? 'Click to expand vendor sub-orders' : 'Click to collapse vendor sub-orders') : undefined}
                                >
                                  <td style={{ whiteSpace: 'nowrap' }}>
                                    {isMaster ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                                        <button 
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleMasterPO(po.poId);
                                          }}
                                          style={{
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '6px',
                                            background: '#DBEAFE',
                                            border: '1px solid #BFDBFE',
                                            color: '#1D4ED8',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            padding: 0,
                                            transition: 'transform 0.2s ease',
                                            transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
                                          }}
                                          title={isCollapsed ? 'Expand sub-orders' : 'Collapse sub-orders'}
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                                        </button>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 900, color: '#1E40AF', fontSize: '13px', background: '#DBEAFE', padding: '4px 9px', borderRadius: '7px', border: '1.5px solid #93C5FD', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                                          {po.poId}
                                        </span>
                                        <span style={{ fontSize: '10px', fontWeight: 850, background: '#2563EB', color: '#FFFFFF', padding: '2px 7px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)', whiteSpace: 'nowrap' }}>
                                          Master PO
                                        </span>
                                      </div>
                                    ) : isChild ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '22px', whiteSpace: 'nowrap' }}>
                                        <span style={{ color: '#94A3B8', fontWeight: 900, fontSize: '14px', fontFamily: 'monospace', lineHeight: 1 }}>
                                          ↳
                                        </span>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1E293B', fontSize: '12.5px', background: '#F8FAFC', padding: '3px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', whiteSpace: 'nowrap' }}>
                                          {po.poId}
                                        </span>
                                        <span style={{ fontSize: '9.5px', fontWeight: 800, background: '#F1F5F9', color: '#475569', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>
                                          Sub-PO
                                        </span>
                                      </div>
                                    ) : (
                                      <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#2563EB', fontSize: '12.5px', background: '#EFF6FF', padding: '3px 7px', borderRadius: '6px', border: '1px solid #DBEAFE', whiteSpace: 'nowrap' }}>
                                        {po.poId}
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    {isMaster ? (
                                      <div>
                                        <div style={{ fontWeight: 850, color: '#1E3A8A', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2563EB' }}></span>
                                          Consolidated Multiple Suppliers
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
                                          Split into {po.totalVendors || (po.vendorOrders ? po.vendorOrders.length : 2)} vendor orders
                                        </div>
                                      </div>
                                    ) : isChild ? (
                                      <div>
                                        <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>
                                          {po.vendorName}
                                        </div>
                                        <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                                          <span>Generated from</span>
                                          <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#2563EB' }}>{po.parentPOId}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>{po.vendorName}</div>
                                    )}
                                  </td>
                                  <td style={{ color: '#64748B', fontSize: '12.5px', fontWeight: 600 }}>
                                    {new Date(po.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </td>
                                  <td style={{ fontWeight: 900, color: isMaster ? '#1E3A8A' : '#0F172A', fontSize: '14px' }}>
                                    ₹{Number(po.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td>
                                    {isMaster ? (
                                      <span style={{
                                        background: '#EEF2FF',
                                        color: '#3730A3',
                                        border: '1.5px solid #C7D2FE',
                                        padding: '4px 11px',
                                        borderRadius: '20px',
                                        fontSize: '11px',
                                        fontWeight: 850,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        boxShadow: '0 1px 3px rgba(79, 70, 229, 0.1)'
                                      }}>
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4F46E5' }}></span>
                                        Consolidated ({po.totalVendors || (po.vendorOrders ? po.vendorOrders.length : 2)} POs)
                                      </span>
                                    ) : (
                                      <span className={`proc-badge ${(po.status || 'draft').toLowerCase().replace(/\s+/g, '-')}`}>
                                        {po.status}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan="5" style={{ textAlign: 'center', padding: '32px', color: '#64748B' }}>
                                No purchase orders raised yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* RIGHT: Action Required */}
                  {(() => {
                    const pendingGrnPOs = purchaseOrders.filter(po => !po.isParent && po.vendorName !== 'Consolidated Multiple Suppliers' && !(po.vendorOrders && po.vendorOrders.length > 0) && ['Approved', 'Sent', 'Confirmed', 'Partially Delivered'].includes(po.status));
                    
                    const overdueInvoices = purchaseOrders.filter(po => {
                      if (po.status === 'Draft' || po.status === 'Cancelled' || po.status === 'Rejected') return false;
                      const outstanding = po.totalAmount - (po.paidAmount || 0);
                      if (outstanding <= 0) return false;
                      const ageInDays = (Date.now() - new Date(po.createdAt).getTime()) / (1000 * 60 * 60 * 24);
                      return ageInDays > 30;
                    });

                    const priceChangesCount = (() => {
                      let count = 0;
                      vendors.forEach(v => {
                        (v.medicines || []).forEach(vm => {
                          const baseMed = medicines.find(m => m.sku === vm.sku);
                          if (baseMed && baseMed.mrp !== vm.price) {
                            count++;
                          }
                        });
                      });
                      return count;
                    })();

                    return (
                      <div className="proc-card">
                        <div className="proc-card-header">
                          <div>
                            <span className="proc-card-title">Action Required</span>
                            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', fontWeight: 500 }}>Critical operational items</div>
                          </div>
                        </div>

                        <div className="proc-action-list">
                          {/* Item 1 */}
                          <div 
                            className="proc-action-item" 
                            style={{ 
                              background: 'linear-gradient(135deg, #FFFDF5 0%, #FEF3C7 100%)', 
                              border: '1.5px solid #FDE68A',
                              cursor: pendingGrnPOs.length > 0 ? 'pointer' : 'default'
                            }}
                            onClick={() => pendingGrnPOs.length > 0 && setActiveTab('grn')}
                          >
                            <div className="proc-action-icon orange">
                              <i data-lucide="package"></i>
                            </div>
                            <div style={{ flexGrow: 1 }}>
                              <div className="proc-action-title">
                                {pendingGrnPOs.length === 1 ? '1 delivery pending GRN' : `${pendingGrnPOs.length} deliveries pending GRN`}
                              </div>
                              <div className="proc-action-desc" style={{ color: '#92400E' }}>
                                {pendingGrnPOs.length > 0 ? 'Verify cartons received today →' : 'All deliveries have GRN completed'}
                              </div>
                            </div>
                          </div>

                          {/* Item 2 */}
                          <div 
                            className="proc-action-item" 
                            style={{ 
                              background: 'linear-gradient(135deg, #FFF5F5 0%, #FEE2E2 100%)', 
                              border: '1.5px solid #FECACA',
                              cursor: overdueInvoices.length > 0 ? 'pointer' : 'default'
                            }}
                            onClick={() => overdueInvoices.length > 0 && setActiveTab('payments')}
                          >
                            <div className="proc-action-icon red">
                              <i data-lucide="alert-triangle"></i>
                            </div>
                            <div style={{ flexGrow: 1 }}>
                              <div className="proc-action-title">
                                {overdueInvoices.length === 1 ? '1 invoice overdue' : `${overdueInvoices.length} invoices overdue`}
                              </div>
                              <div className="proc-action-desc" style={{ color: '#991B1B' }}>
                                {overdueInvoices.length > 0 ? 'Credit window exceeded by 30+ days →' : 'No overdue invoices outstanding'}
                              </div>
                            </div>
                          </div>

                          {/* Item 3 */}
                          <div 
                            className="proc-action-item" 
                            style={{ 
                              background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)', 
                              border: '1.5px solid #BFDBFE',
                              cursor: 'pointer' 
                            }} 
                            onClick={() => setActiveTab('vendors')}
                          >
                            <div className="proc-action-icon blue">
                              <i data-lucide="trending-up"></i>
                            </div>
                            <div style={{ flexGrow: 1 }}>
                              <div className="proc-action-title">
                                Price changes on {priceChangesCount} {priceChangesCount === 1 ? 'medicine' : 'medicines'}
                              </div>
                              <div className="proc-action-desc" style={{ color: '#1E40AF' }}>Review vendor catalog price updates →</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}



            {/* VIEW 2: VENDORS */}
            {activeTab === 'vendors' && (
              !isAddingVendor ? (
                <div>
                  <div className="proc-title-row">
                    <div>
                      <h1 className="proc-title">Vendors</h1>
                      <p className="proc-subtitle">Manage suppliers, contracts and price lists.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button className="proc-btn proc-btn-secondary" onClick={() => {
                        const headers = ['Code', 'Name', 'Type', 'Contact', 'Phone', 'City', 'State', 'GST', 'Status'];
                        const rows = getDisplayVendors().map(v => [
                          v.code || '',
                          v.name || '',
                          v.type || '',
                          v.contactPerson || '',
                          v.phone || '',
                          v.city || '',
                          v.state || '',
                          v.gstNumber || '',
                          v.status || ''
                        ]);
                        const csvContent = "data:text/csv;charset=utf-8," 
                          + [headers.join(','), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');
                        const encodedUri = encodeURI(csvContent);
                        const link = document.createElement("a");
                        link.setAttribute("href", encodedUri);
                        link.setAttribute("download", `vendors_export_${new Date().toISOString().split('T')[0]}.csv`);
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}>
                        <i data-lucide="download"></i> Export
                      </button>
                      <button className="proc-btn proc-btn-primary" onClick={() => {
                        setEditingVendor(null);
                        resetVendorForm();
                        setNewVendor(prev => ({
                          ...prev,
                          code: `VND-0${getDisplayVendors().length + 1}`
                        }));
                        setVendorStep(1);
                        setIsAddingVendor(true);
                      }}>
                        <i data-lucide="plus"></i> Add Vendor
                      </button>
                    </div>
                  </div>

                  {/* KPI CARDS ROW (MATCHING ADMIN PORTAL DESIGN LANGUAGE) */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '14px',
                    width: '100%',
                    marginBottom: '24px',
                    boxSizing: 'border-box'
                  }}>
                    {/* Card 1: TOTAL VENDORS (Electric Blue Theme) */}
                    <div 
                      style={{
                        padding: '16px 18px',
                        borderRadius: '16px',
                        border: '1px solid rgba(191, 219, 254, 0.95)',
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
                      onClick={() => setFilterStatus('all')}
                      title="Filter by all vendors"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '9px',
                          background: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)'
                        }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          TOTAL VENDORS
                        </span>
                      </div>

                      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                            {getDisplayVendors().length}
                          </div>
                          <div style={{ fontSize: '11px', color: '#1D4ED8', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap' }}>
                            Registered suppliers
                          </div>
                        </div>

                        {/* Blue Mini Sparkline */}
                        <div style={{ width: '56px', height: '28px', position: 'relative', flexShrink: 0 }}>
                          <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                            <defs>
                              <linearGradient id="vndBlueGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.45"/>
                                <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05"/>
                              </linearGradient>
                            </defs>
                            <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#vndBlueGrad)" />
                            <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12" fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" />
                          </svg>
                        </div>
                      </div>

                      {/* Accent Line */}
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

                    {/* Card 2: ACTIVE VENDORS (Emerald / Mint Green Theme) */}
                    <div 
                      style={{
                        padding: '16px 18px',
                        borderRadius: '16px',
                        border: '1px solid rgba(167, 243, 208, 0.95)',
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
                      onClick={() => setFilterStatus('Active')}
                      title="Filter active vendors"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '9px',
                          background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          boxShadow: '0 4px 10px rgba(16, 185, 129, 0.25)'
                        }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#064E3B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          ACTIVE VENDORS
                        </span>
                      </div>

                      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                            {getDisplayVendors().filter(v => v.status === 'Active').length}
                          </div>
                          <div style={{ fontSize: '11px', color: '#059669', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap' }}>
                            Verified & approved
                          </div>
                        </div>

                        {/* Green Mini Sparkline */}
                        <div style={{ width: '56px', height: '28px', position: 'relative', flexShrink: 0 }}>
                          <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                            <defs>
                              <linearGradient id="vndGreenGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10B981" stopOpacity="0.45"/>
                                <stop offset="100%" stopColor="#10B981" stopOpacity="0.05"/>
                              </linearGradient>
                            </defs>
                            <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10 L 64 32 L 0 32 Z" fill="url(#vndGreenGrad)" />
                            <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10" fill="none" stroke="#10B981" strokeWidth="2.4" strokeLinecap="round" />
                          </svg>
                        </div>
                      </div>

                      {/* Accent Line */}
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

                    {/* Card 3: UNDER PROCESS (Warm Amber / Orange Theme) */}
                    <div 
                      style={{
                        padding: '16px 18px',
                        borderRadius: '16px',
                        border: '1px solid rgba(254, 215, 170, 0.95)',
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
                      onClick={() => setFilterStatus('Proposed')}
                      title="Filter proposed / pending vendors"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '9px',
                          background: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          boxShadow: '0 4px 10px rgba(245, 158, 11, 0.25)'
                        }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#78350F', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          UNDER PROCESS
                        </span>
                      </div>

                      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                            {vendors.filter(v => v.status === 'Proposed').length}
                          </div>
                          <div style={{ fontSize: '11px', color: '#D97706', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap' }}>
                            Pending onboarding
                          </div>
                        </div>

                        {/* Amber Mini Sparkline */}
                        <div style={{ width: '56px', height: '28px', position: 'relative', flexShrink: 0 }}>
                          <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                            <defs>
                              <linearGradient id="vndAmberGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.45"/>
                                <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.05"/>
                              </linearGradient>
                            </defs>
                            <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22 L 64 32 L 0 32 Z" fill="url(#vndAmberGrad)" />
                            <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22" fill="none" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
                          </svg>
                        </div>
                      </div>

                      {/* Accent Line */}
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

                    {/* Card 4: MEDICINE VENDORS (Purple / Violet Theme) */}
                    <div 
                      style={{
                        padding: '16px 18px',
                        borderRadius: '16px',
                        border: '1px solid rgba(233, 213, 255, 0.95)',
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
                      onClick={() => setFilterCategory('Medicine')}
                      title="Filter medicine suppliers"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '9px',
                          background: 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 100%)',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          boxShadow: '0 4px 10px rgba(139, 92, 246, 0.25)'
                        }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#581C87', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          MEDICINE VENDORS
                        </span>
                      </div>

                      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                            {getDisplayVendors().filter(v => (v.supplierCategory === 'Medicine' || v.type === 'Medicine')).length}
                          </div>
                          <div style={{ fontSize: '11px', color: '#7C3AED', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap' }}>
                            Pharma & drug lines
                          </div>
                        </div>

                        {/* Purple Mini Sparkline */}
                        <div style={{ width: '56px', height: '28px', position: 'relative', flexShrink: 0 }}>
                          <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                            <defs>
                              <linearGradient id="vndPurpleGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.45"/>
                                <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.05"/>
                              </linearGradient>
                            </defs>
                            <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#vndPurpleGrad)" />
                            <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12" fill="none" stroke="#8B5CF6" strokeWidth="2.4" strokeLinecap="round" />
                          </svg>
                        </div>
                      </div>

                      {/* Accent Line */}
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

                    {/* Card 5: CONSUMABLE / EQUIPMENT (Teal / Cyan Theme) */}
                    <div 
                      style={{
                        padding: '16px 18px',
                        borderRadius: '16px',
                        border: '1px solid rgba(165, 243, 252, 0.95)',
                        boxShadow: '0 12px 28px rgba(6, 182, 212, 0.08)',
                        background: 'radial-gradient(circle at 100% 100%, rgba(6, 182, 212, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #ECFEFF 50%, #CFFAFE 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'all 0.2s ease',
                        cursor: 'pointer'
                      }}
                      onClick={() => setFilterCategory('Consumable')}
                      title="Filter consumables & equipment"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '9px',
                          background: 'linear-gradient(135deg, #0891B2 0%, #06B6D4 100%)',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          boxShadow: '0 4px 10px rgba(6, 182, 212, 0.25)'
                        }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#164E63', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          CONSUMABLES
                        </span>
                      </div>

                      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                            {getDisplayVendors().filter(v => (v.supplierCategory && v.supplierCategory !== 'Medicine') || v.type === 'Consumable').length}
                          </div>
                          <div style={{ fontSize: '11px', color: '#0891B2', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap' }}>
                            Hospital supplies
                          </div>
                        </div>

                        {/* Cyan Mini Sparkline */}
                        <div style={{ width: '56px', height: '28px', position: 'relative', flexShrink: 0 }}>
                          <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                            <defs>
                              <linearGradient id="vndCyanGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.45"/>
                                <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.05"/>
                              </linearGradient>
                            </defs>
                            <path d="M 0 22 Q 14 26, 24 18 T 38 12 T 52 20 T 64 10 L 64 32 L 0 32 Z" fill="url(#vndCyanGrad)" />
                            <path d="M 0 22 Q 14 26, 24 18 T 38 12 T 52 20 T 64 10" fill="none" stroke="#06B6D4" strokeWidth="2.4" strokeLinecap="round" />
                          </svg>
                        </div>
                      </div>

                      {/* Accent Line */}
                      <div style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        height: '4px',
                        width: '60%',
                        borderBottomRightRadius: '16px',
                        background: 'linear-gradient(90deg, transparent 0%, #06B6D4 100%)',
                        pointerEvents: 'none'
                      }} />
                    </div>
                  </div>

                  {/* SEARCH & FILTERS ROW */}
                  <div className="proc-filter-row">
                    <div className="proc-filter-search-wrap">
                      <i data-lucide="search"></i>
                      <input 
                        type="text" 
                        className="proc-filter-search" 
                        placeholder="Search by vendor name, code or GST number" 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="proc-filter-selects" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B' }}>
                        <i data-lucide="filter" style={{ width: '16px', height: '16px' }}></i>
                      </div>
                      
                      {/* Supplier Type Filter */}
                      <select 
                        className="proc-select" 
                        style={{ width: '140px', padding: '8px 12px' }}
                        value={selectedTypeFilter}
                        onChange={e => setSelectedTypeFilter(e.target.value)}
                        title="Filter by Supplier Type"
                      >
                        <option value="All Types">All Types</option>
                        <option value="Manufacturer">Manufacturer</option>
                        <option value="Dealer">Dealer</option>
                        <option value="Distributor">Distributor</option>
                      </select>

                      {/* Supplier Category Filter */}
                      <select 
                        className="proc-select" 
                        style={{ width: '150px', padding: '8px 12px' }}
                        value={selectedCategoryFilter}
                        onChange={e => setSelectedCategoryFilter(e.target.value)}
                        title="Filter by Supplier Category"
                      >
                        <option value="All Categories">All Categories</option>
                        <option value="Medicine">Medicine</option>
                        <option value="Medical Equipment">Medical Equipment</option>
                        <option value="Reagent">Reagent</option>
                        <option value="Biomedical Equipment">Biomedical Equipment</option>
                        <option value="Surgical">Surgical</option>
                        <option value="Consumable">Consumable</option>
                      </select>

                      {/* Status Filter */}
                      <select 
                        className="proc-select" 
                        style={{ width: '130px', padding: '8px 12px' }}
                        value={selectedStatusFilter}
                        onChange={e => setSelectedStatusFilter(e.target.value)}
                        title="Filter by Status"
                      >
                        <option value="All Status">All Status</option>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="Proposed">Proposed</option>
                      </select>
                    </div>
                  </div>

                  <div className="proc-card" style={{ padding: '0 0 12px 0', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="proc-table">
                        <thead>
                          <tr>
                            <th>Vendor</th>
                            <th>Code</th>
                            <th>Supplier Type</th>
                            <th>Category</th>
                            <th>Contact</th>
                            <th>Mobile</th>
                            <th>Products</th>
                            <th>Last Purchase</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right', paddingRight: '24px' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getDisplayVendors().filter(v => {
                            const matchesSearch = !searchQuery || 
                              (v.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                              (v.code || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                              (v.gstNumber || '').toLowerCase().includes(searchQuery.toLowerCase());
                            
                            const matchesType = selectedTypeFilter === 'All Types' || v.type === selectedTypeFilter;
                            const matchesCategory = selectedCategoryFilter === 'All Categories' || v.supplierCategory === selectedCategoryFilter;
                            const matchesStatus = selectedStatusFilter === 'All Status' || v.status === selectedStatusFilter;

                            return matchesSearch && matchesType && matchesCategory && matchesStatus;
                          }).map(v => {
                            const productsCount = v.medicines?.length || 0;
                            let lastPurchaseDate = '2026-06-18';
                            if (v.purchaseHistory && v.purchaseHistory.length > 0) {
                              const sortedHistory = [...v.purchaseHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
                              lastPurchaseDate = new Date(sortedHistory[0].date).toISOString().split('T')[0];
                            } else {
                              lastPurchaseDate = v.createdAt ? new Date(v.createdAt).toISOString().split('T')[0] : '2026-06-18';
                            }

                            return (
                              <tr key={v._id}>
                                <td style={{ padding: '16px' }}>
                                  <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '14.5px' }}>{v.name}</div>
                                  <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 500, marginTop: '2px' }}>
                                    {v.city ? `${v.city}, ${v.state || ''}` : 'Mumbai, Maharashtra'}
                                  </div>
                                </td>
                                <td style={{ fontWeight: 700, color: '#475569' }}>{v.code}</td>
                                <td>
                                  <span className={`proc-badge-type ${(v.type || 'Manufacturer').toLowerCase()}`} style={{ fontSize: '11.5px', fontWeight: 750 }}>
                                    {v.type || 'Manufacturer'}
                                  </span>
                                </td>
                                <td>
                                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B', background: '#F1F5F9', border: '1px solid #E2E8F0', padding: '3px 9px', borderRadius: '6px', display: 'inline-block' }}>
                                    {v.supplierCategory || 'Medicine'}
                                  </span>
                                </td>
                                <td style={{ fontWeight: 500 }}>{v.contactPerson || v.primaryContactPerson || 'Rajesh Kumar'}</td>
                                <td style={{ fontWeight: 500, color: '#475569' }}>{v.phone || v.primaryContactPersonMobileNo || '+91 98765 43210'}</td>
                                <td style={{ fontWeight: 700, color: '#0F172A' }}>{productsCount || 0}</td>
                                <td style={{ fontWeight: 500 }}>{lastPurchaseDate}</td>
                                <td>
                                  <span className={`proc-badge-status ${(v.status || 'Active').toLowerCase()}`}>
                                    {v.status || 'Active'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                    <button 
                                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px' }}
                                      onClick={() => setSelectedVendorProfile(v)}
                                      title="View Profile"
                                    >
                                      <i data-lucide="eye" style={{ width: '16px', height: '16px', color: '#64748B' }}></i>
                                    </button>
                                    <button 
                                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px' }}
                                      onClick={() => handleEditVendorClick(v)}
                                      title="Edit Vendor"
                                    >
                                      <i data-lucide="edit" style={{ width: '16px', height: '16px', color: '#64748B' }}></i>
                                    </button>
                                    <button 
                                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px' }}
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
                                      title="Delete Vendor"
                                    >
                                      <i data-lucide="trash-2" style={{ width: '16px', height: '16px', color: '#EF4444' }}></i>
                                    </button>
                                    <button 
                                      className="proc-btn proc-btn-secondary" 
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', fontSize: '12px' }}
                                      onClick={() => {
                                        setSelectedVendorPriceList(v);
                                        setPriceListSearch('');
                                      }}
                                    >
                                      <i data-lucide="list" style={{ width: '14px', height: '14px' }}></i> Prices
                                    </button>
                                    <button 
                                      type="button"
                                      className="proc-btn proc-btn-primary" 
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', fontSize: '12px' }}
                                      onClick={() => {
                                        setTargetVendorForMedicine(v);
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
                                      <i data-lucide="plus" style={{ width: '14px', height: '14px' }}></i> Add Med
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <form 
                  onSubmit={handleSaveVendorSubmit} 
                  className="vendor-form-container"
                >
                  {/* 1. PAGE HEADER */}
                  <div className="vendor-header-bar">
                    <div>
                      <div 
                        className="vendor-back-btn"
                        onClick={() => {
                          setIsAddingVendor(false);
                          setEditingVendor(null);
                          resetVendorForm();
                        }}
                      >
                        <i data-lucide="arrow-left" style={{ width: '16px', height: '16px' }}></i> Back to Vendors
                      </div>
                      <div className="vendor-title-badge-row">
                        <h1 className="vendor-page-title">
                          {editingVendor ? 'Edit Vendor' : 'Add New Vendor'}
                          <i data-lucide="shield-check" style={{ width: '22px', height: '22px', color: '#2563EB' }}></i>
                        </h1>
                        <span className={`vendor-status-pill ${newVendor.name ? 'ready' : 'draft'}`}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: newVendor.name ? '#15803D' : '#D97706' }}></span>
                          {editingVendor ? (newVendor.status === 'Active' ? 'Active Profile' : 'Inactive Profile') : (newVendor.name ? 'Ready to Submit' : 'Draft')}
                        </span>
                      </div>
                      <p className="proc-subtitle" style={{ margin: '4px 0 0 0' }}>
                        {editingVendor ? 'Modify existing supplier profile and contract terms.' : 'Register a supplier and submit their commercial details for admin approval.'}
                      </p>
                    </div>

                    <div className="vendor-header-actions">
                      <div className="vendor-btn-group">
                        <button 
                          type="button" 
                          className="proc-btn proc-btn-secondary" 
                          onClick={() => {
                            setIsAddingVendor(false);
                            setEditingVendor(null);
                            resetVendorForm();
                          }}
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit" 
                          name="saveVendor" 
                          className="proc-btn proc-btn-secondary"
                          style={{ backgroundColor: '#F8FAFC', color: '#1E293B', border: '1px solid #CBD5E1', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <i data-lucide="bookmark" style={{ width: '14px', height: '14px', color: '#2563EB' }}></i> Save as Draft
                        </button>
                        <button 
                          type="submit" 
                          name="saveAndAddPrice" 
                          className="proc-btn proc-btn-primary"
                          id="vendor-primary-submit-btn"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          {editingVendor ? 'Save Changes' : 'Register Vendor'}
                          <i data-lucide="arrow-right" style={{ width: '15px', height: '15px' }}></i>
                        </button>
                      </div>
                      <div className="vendor-kbd-hint">
                        Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to submit
                      </div>
                    </div>
                  </div>

                  {/* 2. STEP / PROGRESS NAVIGATION */}
                  {(() => {
                    const step1Complete = Boolean(newVendor.name && newVendor.type && newVendor.supplierCategory);
                    const step2Complete = Boolean(newVendor.city && newVendor.state && (newVendor.contactPerson || newVendor.primaryContactPerson) && (newVendor.phone || newVendor.primaryContactPersonMobileNo));
                    const step3Complete = Boolean(newVendor.gstNumber && (newVendor.panNumber || newVendor.panCardNo) && newVendor.licenseNumber);
                    const step4Complete = Boolean(newVendor.medicines && newVendor.medicines.length > 0 && newVendor.medicines.some(m => m.name && m.price > 0));

                    return (
                      <div className="vendor-stepper">
                        <button
                          type="button"
                          className={`vendor-step-node ${vendorStep === 1 ? 'active' : (step1Complete ? 'completed' : 'pending')}`}
                          onClick={() => setVendorStep(1)}
                        >
                          <div className="vendor-step-badge">
                            {step1Complete && vendorStep !== 1 ? <i data-lucide="check" style={{ width: '14px', height: '14px' }}></i> : '1'}
                          </div>
                          <div className="vendor-step-info">
                            <span className="vendor-step-name">Vendor Details</span>
                            <span className="vendor-step-sub">Basic information</span>
                          </div>
                        </button>

                        <div className={`vendor-step-line ${step1Complete ? 'completed' : ''}`}></div>

                        <button
                          type="button"
                          className={`vendor-step-node ${vendorStep === 2 ? 'active' : (step2Complete ? 'completed' : 'pending')}`}
                          onClick={() => setVendorStep(2)}
                        >
                          <div className="vendor-step-badge">
                            {step2Complete && vendorStep !== 2 ? <i data-lucide="check" style={{ width: '14px', height: '14px' }}></i> : '2'}
                          </div>
                          <div className="vendor-step-info">
                            <span className="vendor-step-name">Contact & Address</span>
                            <span className="vendor-step-sub">Location & contacts</span>
                          </div>
                        </button>

                        <div className={`vendor-step-line ${step2Complete ? 'completed' : ''}`}></div>

                        <button
                          type="button"
                          className={`vendor-step-node ${vendorStep === 3 ? 'active' : (step3Complete ? 'completed' : 'pending')}`}
                          onClick={() => setVendorStep(3)}
                        >
                          <div className="vendor-step-badge">
                            {step3Complete && vendorStep !== 3 ? <i data-lucide="check" style={{ width: '14px', height: '14px' }}></i> : '3'}
                          </div>
                          <div className="vendor-step-info">
                            <span className="vendor-step-name">Compliance & Commercial</span>
                            <span className="vendor-step-sub">Legal & banking</span>
                          </div>
                        </button>

                        <div className={`vendor-step-line ${step3Complete ? 'completed' : ''}`}></div>

                        <button
                          type="button"
                          className={`vendor-step-node ${vendorStep === 4 ? 'active' : (step4Complete ? 'completed' : 'pending')}`}
                          onClick={() => setVendorStep(4)}
                        >
                          <div className="vendor-step-badge">
                            {step4Complete && vendorStep !== 4 ? <i data-lucide="check" style={{ width: '14px', height: '14px' }}></i> : '4'}
                          </div>
                          <div className="vendor-step-info">
                            <span className="vendor-step-name">Rate List</span>
                            <span className="vendor-step-sub">Medicine & pricing</span>
                          </div>
                        </button>

                        <div className={`vendor-step-line ${step4Complete ? 'completed' : ''}`}></div>

                        <button
                          type="button"
                          className={`vendor-step-node ${vendorStep === 5 ? 'active' : 'pending'}`}
                          onClick={() => setVendorStep(5)}
                        >
                          <div className="vendor-step-badge">5</div>
                          <div className="vendor-step-info">
                            <span className="vendor-step-name">Review & Submit</span>
                            <span className="vendor-step-sub">Internal remarks</span>
                          </div>
                        </button>
                      </div>
                    );
                  })()}

                  {/* 3. REQUIRED VS OPTIONAL LEGEND */}
                  <div className="vendor-legend-strip">
                    <div className="vendor-legend-items">
                      <span className="vendor-legend-tag">
                        <span style={{ color: '#EF4444', fontSize: '15px', lineHeight: 1 }}>●</span> Required
                      </span>
                      <span className="vendor-legend-tag">
                        <span style={{ color: '#94A3B8', fontSize: '15px', lineHeight: 1 }}>○</span> Optional
                      </span>
                      <span className="vendor-legend-tag">
                        <span style={{ color: '#0284C7', fontWeight: 800 }}>✓</span> Auto-generated
                      </span>
                    </div>
                    <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: 500 }}>
                      Step {vendorStep} of 5 — Fields marked <span style={{ color: '#EF4444', fontWeight: 700 }}>*</span> are mandatory before submission.
                    </span>
                  </div>

                  {/* STEP 1: VENDOR DETAILS */}
                  {vendorStep === 1 && (
                    <div id="sec-vendor" className="vendor-card" style={{ animation: 'fadeIn 0.2s ease' }}>
                      <div className="vendor-card-header">
                        <div className="vendor-card-title-group">
                          <div className="vendor-card-icon-box blue">
                            <i data-lucide="building-2" style={{ width: '20px', height: '20px' }}></i>
                          </div>
                          <div>
                            <h3 className="vendor-card-title">Basic & Organization Information</h3>
                            <p className="vendor-card-subtitle">Provide primary vendor identification and organization details.</p>
                          </div>
                        </div>
                        <span className="vendor-autogen-tag">Step 1 of 5</span>
                      </div>

                      <div className="vendor-form-grid-2">
                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Vendor Name (Supplier Name) <span className="vendor-required-star">*</span></span>
                          </label>
                          <div className="vendor-input-icon-wrap">
                            <span className="vendor-input-prefix-icon">
                              <i data-lucide="store" style={{ width: '16px', height: '16px' }}></i>
                            </span>
                            <input 
                              type="text" 
                              required 
                              className="vendor-input with-prefix" 
                              style={{ fontWeight: 600 }}
                              placeholder="e.g. KARTIK MEDICINE SOLUTIONS"
                              value={newVendor.name} 
                              onChange={e => setNewVendor({...newVendor, name: e.target.value})} 
                            />
                          </div>
                        </div>

                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Vendor Code (Supplier Code)</span>
                            <span className="vendor-autogen-tag">Auto-generated</span>
                          </label>
                          <div className="vendor-input-icon-wrap">
                            <span className="vendor-input-prefix-icon">
                              <i data-lucide="tag" style={{ width: '16px', height: '16px' }}></i>
                            </span>
                            <input 
                              type="text" 
                              readOnly
                              className="vendor-input with-prefix readonly" 
                              placeholder="e.g. VND-02"
                              value={newVendor.code || `VND-0${getDisplayVendors().length + 1}`} 
                            />
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Assigned automatically on vendor creation</div>
                        </div>

                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Supplier Type <span className="vendor-required-star">*</span></span>
                          </label>
                          <div className="vendor-input-icon-wrap">
                            <span className="vendor-input-prefix-icon">
                              <i data-lucide="truck" style={{ width: '16px', height: '16px' }}></i>
                            </span>
                            <select 
                              required 
                              className="vendor-select with-prefix" 
                              value={newVendor.type} 
                              onChange={e => setNewVendor({...newVendor, type: e.target.value})}
                            >
                              <option value="Manufacturer">Manufacturer</option>
                              <option value="Dealer">Dealer</option>
                              <option value="Distributor">Distributor</option>
                            </select>
                          </div>
                        </div>

                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Supplier Category <span className="vendor-required-star">*</span></span>
                          </label>
                          <div className="vendor-input-icon-wrap">
                            <span className="vendor-input-prefix-icon">
                              <i data-lucide="flask-conical" style={{ width: '16px', height: '16px' }}></i>
                            </span>
                            <select 
                              required 
                              className="vendor-select with-prefix" 
                              value={newVendor.supplierCategory} 
                              onChange={e => setNewVendor({...newVendor, supplierCategory: e.target.value})}
                            >
                              <option value="Medicine">Medicine</option>
                              <option value="Medical Equipment">Medical Equipment</option>
                              <option value="Reagent">Reagent</option>
                              <option value="Biomedical Equipment">Biomedical Equipment</option>
                            </select>
                          </div>
                        </div>

                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Organization Type <span className="vendor-required-star">*</span></span>
                          </label>
                          <div className="vendor-input-icon-wrap">
                            <span className="vendor-input-prefix-icon">
                              <i data-lucide="briefcase" style={{ width: '16px', height: '16px' }}></i>
                            </span>
                            <select 
                              required 
                              className="vendor-select with-prefix" 
                              value={newVendor.organizationType} 
                              onChange={e => setNewVendor({...newVendor, organizationType: e.target.value})}
                            >
                              <option value="Private Ltd">Private Ltd</option>
                              <option value="Partnership LLP">Partnership LLP</option>
                              <option value="Public Ltd">Public Ltd</option>
                              <option value="Proprieter">Proprieter</option>
                            </select>
                          </div>
                        </div>

                        <div className="vendor-input-group" style={{ justifyContent: 'center' }}>
                          <label className="vendor-label">
                            <span>Status <span className="vendor-required-star">*</span></span>
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '38px', background: '#F8FAFC', padding: '0 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                            <input 
                              type="checkbox" 
                              id="vendor-status-checkbox"
                              checked={newVendor.status === 'Active'} 
                              onChange={e => setNewVendor({...newVendor, status: e.target.checked ? 'Active' : 'Inactive'})}
                              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2563EB' }}
                            />
                            <label htmlFor="vendor-status-checkbox" style={{ fontSize: '13px', fontWeight: 700, color: newVendor.status === 'Active' ? '#15803D' : '#64748B', cursor: 'pointer', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {newVendor.status === 'Active' ? (
                                <>
                                  <i data-lucide="check-circle" style={{ width: '16px', height: '16px', color: '#16A34A' }}></i> Active Supplier
                                </>
                              ) : (
                                <>
                                  <i data-lucide="x-circle" style={{ width: '16px', height: '16px', color: '#94A3B8' }}></i> Inactive Supplier
                                </>
                              )}
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="vendor-callout-info">
                        <i data-lucide="info" style={{ width: '16px', height: '16px', flexShrink: 0 }}></i>
                        <span>Vendor registration remains pending until Admin approval.</span>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: CONTACT & ADDRESS */}
                  {vendorStep === 2 && (
                    <div id="sec-contact" className="vendor-card" style={{ animation: 'fadeIn 0.2s ease' }}>
                      <div className="vendor-card-header">
                        <div className="vendor-card-title-group">
                          <div className="vendor-card-icon-box purple">
                            <i data-lucide="map-pin" style={{ width: '20px', height: '20px' }}></i>
                          </div>
                          <div>
                            <h3 className="vendor-card-title">Contact & Address Details</h3>
                            <p className="vendor-card-subtitle">Registered business address, communication channels, and primary contact person.</p>
                          </div>
                        </div>
                        <span className="vendor-autogen-tag">Step 2 of 5</span>
                      </div>

                      {/* Subsection A: Business Address */}
                      <div className="vendor-subsection-title">
                        <i data-lucide="map" style={{ width: '16px', height: '16px', color: '#7C3AED' }}></i>
                        <span>A. Business Address</span>
                      </div>

                      <div className="vendor-form-grid-2">
                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>House No / Unit</span>
                            <span className="vendor-optional-tag">Optional</span>
                          </label>
                          <input 
                            type="text" 
                            className="vendor-input" 
                            placeholder="e.g. 106, Shivam Ind Estate"
                            value={newVendor.houseNo || ''} 
                            onChange={e => setNewVendor({...newVendor, houseNo: e.target.value})} 
                          />
                        </div>

                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Street</span>
                            <span className="vendor-optional-tag">Optional</span>
                          </label>
                          <input 
                            type="text" 
                            className="vendor-input" 
                            placeholder="e.g. Deonar Road, Govandi"
                            value={newVendor.street || ''} 
                            onChange={e => setNewVendor({...newVendor, street: e.target.value})} 
                          />
                        </div>

                        <div className="vendor-input-group full-width">
                          <label className="vendor-label">
                            <span>Complete Address</span>
                            <span className="vendor-optional-tag">Optional</span>
                          </label>
                          <textarea 
                            className="vendor-textarea" 
                            style={{ minHeight: '56px' }}
                            placeholder="Complete registered business address..."
                            value={newVendor.address} 
                            onChange={e => setNewVendor({...newVendor, address: e.target.value})} 
                          />
                        </div>

                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>City <span className="vendor-required-star">*</span></span>
                          </label>
                          <input 
                            type="text" 
                            required
                            className="vendor-input" 
                            placeholder="e.g. Mumbai"
                            value={newVendor.city} 
                            onChange={e => setNewVendor({...newVendor, city: e.target.value})} 
                          />
                        </div>

                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>State <span className="vendor-required-star">*</span></span>
                          </label>
                          <input 
                            type="text" 
                            required
                            className="vendor-input" 
                            placeholder="e.g. Maharashtra"
                            value={newVendor.state} 
                            onChange={e => setNewVendor({...newVendor, state: e.target.value})} 
                          />
                        </div>

                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Pincode <span className="vendor-required-star">*</span></span>
                          </label>
                          <input 
                            type="text" 
                            required
                            className="vendor-input" 
                            placeholder="e.g. 400088"
                            value={newVendor.zipCode || newVendor.pinCode || ''} 
                            onChange={e => setNewVendor({...newVendor, zipCode: e.target.value, pinCode: e.target.value})} 
                          />
                        </div>

                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Country <span className="vendor-required-star">*</span></span>
                          </label>
                          <input 
                            type="text" 
                            required
                            className="vendor-input" 
                            placeholder="e.g. India"
                            value={newVendor.country || 'India'} 
                            onChange={e => setNewVendor({...newVendor, country: e.target.value})} 
                          />
                        </div>
                      </div>

                      {/* Subsection B: Communication */}
                      <div className="vendor-subsection-title" style={{ marginTop: '24px' }}>
                        <i data-lucide="phone-call" style={{ width: '16px', height: '16px', color: '#2563EB' }}></i>
                        <span>B. Communication Information</span>
                      </div>

                      <div className="vendor-form-grid-2">
                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Landline Number</span>
                            <span className="vendor-optional-tag">Optional</span>
                          </label>
                          <div className="vendor-input-icon-wrap">
                            <span className="vendor-input-prefix-icon">
                              <i data-lucide="phone" style={{ width: '15px', height: '15px' }}></i>
                            </span>
                            <input 
                              type="text" 
                              className="vendor-input with-prefix" 
                              placeholder="e.g. 022-67703125"
                              value={newVendor.landline || ''} 
                              onChange={e => setNewVendor({...newVendor, landline: e.target.value})} 
                            />
                          </div>
                        </div>

                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Fax Number</span>
                            <span className="vendor-optional-tag">Optional</span>
                          </label>
                          <div className="vendor-input-icon-wrap">
                            <span className="vendor-input-prefix-icon">
                              <i data-lucide="printer" style={{ width: '15px', height: '15px' }}></i>
                            </span>
                            <input 
                              type="text" 
                              className="vendor-input with-prefix" 
                              placeholder="e.g. 022-67703126"
                              value={newVendor.faxNo || ''} 
                              onChange={e => setNewVendor({...newVendor, faxNo: e.target.value})} 
                            />
                          </div>
                        </div>

                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Official Email Address</span>
                            <span className="vendor-optional-tag">Optional</span>
                          </label>
                          <div className="vendor-input-icon-wrap">
                            <span className="vendor-input-prefix-icon">
                              <i data-lucide="mail" style={{ width: '15px', height: '15px' }}></i>
                            </span>
                            <input 
                              type="email" 
                              className="vendor-input with-prefix" 
                              placeholder="e.g. vendor@corp.com"
                              value={newVendor.email} 
                              onChange={e => setNewVendor({...newVendor, email: e.target.value})} 
                            />
                          </div>
                        </div>

                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Official Website</span>
                            <span className="vendor-optional-tag">Optional</span>
                          </label>
                          <div className="vendor-input-icon-wrap">
                            <span className="vendor-input-prefix-icon">
                              <i data-lucide="globe" style={{ width: '15px', height: '15px' }}></i>
                            </span>
                            <input 
                              type="text" 
                              className="vendor-input with-prefix" 
                              placeholder="e.g. www.corp.com"
                              value={newVendor.website || ''} 
                              onChange={e => setNewVendor({...newVendor, website: e.target.value})} 
                            />
                          </div>
                        </div>
                      </div>

                      {/* Subsection C: Primary Contact */}
                      <div className="vendor-subsection-title" style={{ marginTop: '24px' }}>
                        <i data-lucide="user-check" style={{ width: '16px', height: '16px', color: '#EA580C' }}></i>
                        <span>C. Primary Contact Person</span>
                      </div>

                      <div className="vendor-form-grid-2">
                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Contact Person Name <span className="vendor-required-star">*</span></span>
                          </label>
                          <div className="vendor-input-icon-wrap">
                            <span className="vendor-input-prefix-icon">
                              <i data-lucide="user" style={{ width: '15px', height: '15px' }}></i>
                            </span>
                            <input 
                              type="text" 
                              required 
                              className="vendor-input with-prefix" 
                              placeholder="e.g. Rahul Sharma"
                              value={newVendor.contactPerson || newVendor.primaryContactPerson} 
                              onChange={e => setNewVendor({...newVendor, contactPerson: e.target.value, primaryContactPerson: e.target.value})} 
                            />
                          </div>
                        </div>

                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Designation</span>
                            <span className="vendor-optional-tag">Optional</span>
                          </label>
                          <div className="vendor-input-icon-wrap">
                            <span className="vendor-input-prefix-icon">
                              <i data-lucide="briefcase" style={{ width: '15px', height: '15px' }}></i>
                            </span>
                            <input 
                              type="text" 
                              className="vendor-input with-prefix" 
                              placeholder="e.g. Account Manager"
                              value={newVendor.primaryContactPersonDesignation || ''} 
                              onChange={e => setNewVendor({...newVendor, primaryContactPersonDesignation: e.target.value})} 
                            />
                          </div>
                        </div>

                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Mobile Number (10 Digits) <span className="vendor-required-star">*</span></span>
                          </label>
                          <div className="vendor-input-icon-wrap">
                            <span className="vendor-input-prefix-icon">
                              <i data-lucide="phone" style={{ width: '15px', height: '15px' }}></i>
                            </span>
                            <input 
                              type="text" 
                              required 
                              className="vendor-input with-prefix" 
                              placeholder="e.g. 9824343354"
                              maxLength={10}
                              value={newVendor.phone || newVendor.primaryContactPersonMobileNo} 
                              onChange={e => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                setNewVendor({...newVendor, phone: val, primaryContactPersonMobileNo: val});
                              }} 
                            />
                          </div>
                        </div>

                        <div className="vendor-input-group">
                          <label className="vendor-label">
                            <span>Email ID</span>
                            <span className="vendor-optional-tag">Optional</span>
                          </label>
                          <div className="vendor-input-icon-wrap">
                            <span className="vendor-input-prefix-icon">
                              <i data-lucide="mail" style={{ width: '15px', height: '15px' }}></i>
                            </span>
                            <input 
                              type="email" 
                              className="vendor-input with-prefix" 
                              placeholder="e.g. primary@corp.com"
                              value={newVendor.primaryContactPersonEmailId || ''} 
                              onChange={e => setNewVendor({...newVendor, primaryContactPersonEmailId: e.target.value})} 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 3: COMPLIANCE & COMMERCIAL */}
                  {vendorStep === 3 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeIn 0.2s ease' }}>
                      <div id="sec-compliance" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        {/* Left: Secondary Contact */}
                        <div className="vendor-card" style={{ height: 'fit-content' }}>
                          <div className="vendor-card-header">
                            <div className="vendor-card-title-group">
                              <div className="vendor-card-icon-box amber">
                                <i data-lucide="users" style={{ width: '20px', height: '20px' }}></i>
                              </div>
                              <div>
                                <h3 className="vendor-card-title">Secondary Contact</h3>
                                <p className="vendor-card-subtitle">Backup point of contact (Optional).</p>
                              </div>
                            </div>
                            <span className="vendor-optional-tag">Optional</span>
                          </div>

                          <div className="vendor-form-grid-2">
                            <div className="vendor-input-group full-width">
                              <label className="vendor-label">
                                <span>Contact Person Name</span>
                                <span className="vendor-optional-tag">Optional</span>
                              </label>
                              <div className="vendor-input-icon-wrap">
                                <span className="vendor-input-prefix-icon">
                                  <i data-lucide="user" style={{ width: '15px', height: '15px' }}></i>
                                </span>
                                <input 
                                  type="text" 
                                  className="vendor-input with-prefix" 
                                  placeholder="Backup Contact Name"
                                  value={newVendor.secondaryContactPerson || ''} 
                                  onChange={e => setNewVendor({...newVendor, secondaryContactPerson: e.target.value})} 
                                />
                              </div>
                            </div>

                            <div className="vendor-input-group full-width">
                              <label className="vendor-label">
                                <span>Designation</span>
                                <span className="vendor-optional-tag">Optional</span>
                              </label>
                              <div className="vendor-input-icon-wrap">
                                <span className="vendor-input-prefix-icon">
                                  <i data-lucide="briefcase" style={{ width: '15px', height: '15px' }}></i>
                                </span>
                                <input 
                                  type="text" 
                                  className="vendor-input with-prefix" 
                                  placeholder="e.g. Sales Coordinator"
                                  value={newVendor.secondaryContactPersonDesignation || ''} 
                                  onChange={e => setNewVendor({...newVendor, secondaryContactPersonDesignation: e.target.value})} 
                                />
                              </div>
                            </div>

                            <div className="vendor-input-group full-width">
                              <label className="vendor-label">
                                <span>Mobile Number</span>
                                <span className="vendor-optional-tag">Optional</span>
                              </label>
                              <div className="vendor-input-icon-wrap">
                                <span className="vendor-input-prefix-icon">
                                  <i data-lucide="phone" style={{ width: '15px', height: '15px' }}></i>
                                </span>
                                <input 
                                  type="text" 
                                  className="vendor-input with-prefix" 
                                  placeholder="10-digit mobile number"
                                  maxLength={10}
                                  value={newVendor.secondaryContactPersonMobileNo || ''} 
                                  onChange={e => {
                                    const val = e.target.value.replace(/[^0-9]/g, '');
                                    setNewVendor({...newVendor, secondaryContactPersonMobileNo: val});
                                  }} 
                                />
                              </div>
                            </div>

                            <div className="vendor-input-group full-width">
                              <label className="vendor-label">
                                <span>Email ID</span>
                                <span className="vendor-optional-tag">Optional</span>
                              </label>
                              <div className="vendor-input-icon-wrap">
                                <span className="vendor-input-prefix-icon">
                                  <i data-lucide="mail" style={{ width: '15px', height: '15px' }}></i>
                                </span>
                                <input 
                                  type="email" 
                                  className="vendor-input with-prefix" 
                                  placeholder="e.g. secondary@corp.com"
                                  value={newVendor.secondaryContactPersonEmailId || ''} 
                                  onChange={e => setNewVendor({...newVendor, secondaryContactPersonEmailId: e.target.value})} 
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right: Compliance & Business Registration */}
                        <div className="vendor-card">
                          <div className="vendor-card-header">
                            <div className="vendor-card-title-group">
                              <div className="vendor-card-icon-box blue">
                                <i data-lucide="shield" style={{ width: '20px', height: '20px' }}></i>
                              </div>
                              <div>
                                <h3 className="vendor-card-title">Compliance & Registration</h3>
                                <p className="vendor-card-subtitle">Tax registration and regulatory compliance.</p>
                              </div>
                            </div>
                            <span className="vendor-autogen-tag">Step 3 of 5</span>
                          </div>

                          <div className="vendor-form-grid-2">
                            <div className="vendor-input-group">
                              <label className="vendor-label">
                                <span>GST Number <span className="vendor-required-star">*</span></span>
                              </label>
                              <input 
                                type="text" 
                                required
                                className="vendor-input" 
                                style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
                                placeholder="22AAAAA0000A1Z5"
                                value={newVendor.gstNumber} 
                                onChange={e => setNewVendor({...newVendor, gstNumber: e.target.value.toUpperCase()})} 
                              />
                            </div>

                            <div className="vendor-input-group">
                              <label className="vendor-label">
                                <span>PAN Card Number <span className="vendor-required-star">*</span></span>
                              </label>
                              <input 
                                type="text" 
                                required
                                className="vendor-input" 
                                style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
                                placeholder="ABCDE1234F"
                                value={newVendor.panNumber || newVendor.panCardNo || ''} 
                                onChange={e => {
                                  const val = e.target.value.toUpperCase();
                                  setNewVendor({...newVendor, panNumber: val, panCardNo: val});
                                }} 
                              />
                            </div>

                            <div className="vendor-input-group">
                              <label className="vendor-label">
                                <span>Name on PAN Card</span>
                                <span className="vendor-optional-tag">Optional</span>
                              </label>
                              <input 
                                type="text" 
                                className="vendor-input" 
                                placeholder="Name as per PAN"
                                value={newVendor.nameOnPanCard || ''} 
                                onChange={e => setNewVendor({...newVendor, nameOnPanCard: e.target.value})} 
                              />
                            </div>

                            <div className="vendor-input-group">
                              <label className="vendor-label">
                                <span>Drug License Number <span className="vendor-required-star">*</span></span>
                              </label>
                              <input 
                                type="text" 
                                required
                                className="vendor-input" 
                                placeholder="e.g. DL-12345/2026"
                                value={newVendor.licenseNumber || ''} 
                                onChange={e => setNewVendor({...newVendor, licenseNumber: e.target.value})} 
                              />
                            </div>

                            <div className="vendor-input-group">
                              <label className="vendor-label">
                                <span>CIN Number</span>
                                <span className="vendor-optional-tag">Optional</span>
                              </label>
                              <input 
                                type="text" 
                                className="vendor-input" 
                                placeholder="CIN Number"
                                value={newVendor.cinNo || ''} 
                                onChange={e => setNewVendor({...newVendor, cinNo: e.target.value})} 
                              />
                            </div>

                            <div className="vendor-input-group">
                              <label className="vendor-label">
                                <span>PF Registration No</span>
                                <span className="vendor-optional-tag">Optional</span>
                              </label>
                              <input 
                                type="text" 
                                className="vendor-input" 
                                placeholder="PF Reg No"
                                value={newVendor.pfRegistrationNo || ''} 
                                onChange={e => setNewVendor({...newVendor, pfRegistrationNo: e.target.value})} 
                              />
                            </div>

                            <div className="vendor-input-group">
                              <label className="vendor-label">
                                <span>ROC Number</span>
                                <span className="vendor-optional-tag">Optional</span>
                              </label>
                              <input 
                                type="text" 
                                className="vendor-input" 
                                placeholder="ROC Number"
                                value={newVendor.rocNo || ''} 
                                onChange={e => setNewVendor({...newVendor, rocNo: e.target.value})} 
                              />
                            </div>

                            <div className="vendor-input-group">
                              <label className="vendor-label">
                                <span>ESI Registration No</span>
                                <span className="vendor-optional-tag">Optional</span>
                              </label>
                              <input 
                                type="text" 
                                className="vendor-input" 
                                placeholder="ESI Reg No"
                                value={newVendor.esiRegistrationNo || ''} 
                                onChange={e => setNewVendor({...newVendor, esiRegistrationNo: e.target.value})} 
                              />
                            </div>

                            <div className="vendor-input-group">
                              <label className="vendor-label">
                                <span>ISO Certification No</span>
                                <span className="vendor-optional-tag">Optional</span>
                              </label>
                              <input 
                                type="text" 
                                className="vendor-input" 
                                placeholder="ISO Cert No"
                                value={newVendor.isoCertificationNo || ''} 
                                onChange={e => setNewVendor({...newVendor, isoCertificationNo: e.target.value})} 
                              />
                            </div>

                            <div className="vendor-input-group">
                              <label className="vendor-label">
                                <span>ISO Valid Upto</span>
                                <span className="vendor-optional-tag">Optional</span>
                              </label>
                              <input 
                                type="date" 
                                className="vendor-input" 
                                value={newVendor.isoValidUpto || ''} 
                                onChange={e => setNewVendor({...newVendor, isoValidUpto: e.target.value})} 
                              />
                            </div>

                            <div className="vendor-input-group">
                              <label className="vendor-label">
                                <span>Pollution Board Cert No</span>
                                <span className="vendor-optional-tag">Optional</span>
                              </label>
                              <input 
                                type="text" 
                                className="vendor-input" 
                                placeholder="PCB Cert No"
                                value={newVendor.pollutionControlBoardCertificationNo || ''} 
                                onChange={e => setNewVendor({...newVendor, pollutionControlBoardCertificationNo: e.target.value})} 
                              />
                            </div>

                            <div className="vendor-input-group">
                              <label className="vendor-label">
                                <span>Pollution Valid Upto</span>
                                <span className="vendor-optional-tag">Optional</span>
                              </label>
                              <input 
                                type="date" 
                                className="vendor-input" 
                                value={newVendor.pollutionValidUpto || ''} 
                                onChange={e => setNewVendor({...newVendor, pollutionValidUpto: e.target.value})} 
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Commercial Terms & MSME Details */}
                      <div id="sec-commercial" className="vendor-card">
                        <div className="vendor-card-header">
                          <div className="vendor-card-title-group">
                            <div className="vendor-card-icon-box amber">
                              <i data-lucide="credit-card" style={{ width: '20px', height: '20px' }}></i>
                            </div>
                            <div>
                              <h3 className="vendor-card-title">Commercial & Payment Details</h3>
                              <p className="vendor-card-subtitle">Bank routing details, MSME compliance, credit parameters and payment terms.</p>
                            </div>
                          </div>
                          <span className="vendor-optional-tag">Banking & Commercial</span>
                        </div>

                        {/* Subsection A: Bank Account Details */}
                        <div className="vendor-subsection-title">
                          <i data-lucide="landmark" style={{ width: '16px', height: '16px', color: '#D97706' }}></i>
                          <span>A. Bank Account Details (NEFT / RTGS)</span>
                        </div>

                        <div className="vendor-form-grid-2">
                          <div className="vendor-input-group">
                            <label className="vendor-label">
                              <span>Bank Name</span>
                              <span className="vendor-optional-tag">Optional</span>
                            </label>
                            <div className="vendor-input-icon-wrap">
                              <span className="vendor-input-prefix-icon">
                                <i data-lucide="landmark" style={{ width: '15px', height: '15px' }}></i>
                              </span>
                              <input 
                                type="text" 
                                className="vendor-input with-prefix" 
                                placeholder="e.g. HDFC Bank"
                                value={newVendor.bankName || newVendor.bank1Name || ''} 
                                onChange={e => setNewVendor({...newVendor, bankName: e.target.value, bank1Name: e.target.value})} 
                              />
                            </div>
                          </div>

                          <div className="vendor-input-group">
                            <label className="vendor-label">
                              <span>Branch</span>
                              <span className="vendor-optional-tag">Optional</span>
                            </label>
                            <input 
                              type="text" 
                              className="vendor-input" 
                              placeholder="e.g. Fort Branch, Mumbai"
                              value={newVendor.bank1Branch || ''} 
                              onChange={e => setNewVendor({...newVendor, bank1Branch: e.target.value})} 
                            />
                          </div>

                          <div className="vendor-input-group">
                            <label className="vendor-label">
                              <span>Account Number</span>
                              <span className="vendor-optional-tag">Optional</span>
                            </label>
                            <div className="vendor-input-icon-wrap">
                              <span className="vendor-input-prefix-icon">
                                <i data-lucide="hash" style={{ width: '15px', height: '15px' }}></i>
                              </span>
                              <input 
                                type="text" 
                                className="vendor-input with-prefix" 
                                style={{ fontFamily: 'monospace' }}
                                placeholder="Account Number"
                                value={newVendor.accountNumber || newVendor.bank1AccountNumber || ''} 
                                onChange={e => setNewVendor({...newVendor, accountNumber: e.target.value, bank1AccountNumber: e.target.value})} 
                              />
                            </div>
                          </div>

                          <div className="vendor-input-group">
                            <label className="vendor-label">
                              <span>IFSC Code</span>
                              <span className="vendor-optional-tag">Optional</span>
                            </label>
                            <input 
                              type="text" 
                              className="vendor-input" 
                              style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
                              placeholder="e.g. HDFC0000123"
                              value={newVendor.ifscCode || newVendor.bank1IfscCode || ''} 
                              onChange={e => {
                                const val = e.target.value.toUpperCase();
                                setNewVendor({...newVendor, ifscCode: val, bank1IfscCode: val});
                              }} 
                            />
                          </div>

                          <div className="vendor-input-group full-width">
                            <label className="vendor-label">
                              <span>Bank Address</span>
                              <span className="vendor-optional-tag">Optional</span>
                            </label>
                            <input 
                              type="text" 
                              className="vendor-input" 
                              placeholder="Bank branch location / address"
                              value={newVendor.bank1Address || ''} 
                              onChange={e => setNewVendor({...newVendor, bank1Address: e.target.value})} 
                            />
                          </div>
                        </div>

                        {/* Subsection B: Commercial Terms & MSME */}
                        <div className="vendor-subsection-title" style={{ marginTop: '24px' }}>
                          <i data-lucide="wallet" style={{ width: '16px', height: '16px', color: '#059669' }}></i>
                          <span>B. Commercial Terms & MSME Details</span>
                        </div>

                        <div className="vendor-form-grid-3">
                          <div className="vendor-input-group">
                            <label className="vendor-label">
                              <span>Is MSME Registered?</span>
                            </label>
                            <select 
                              className="vendor-select" 
                              value={newVendor.isMsmeRegistration || 'No'} 
                              onChange={e => setNewVendor({...newVendor, isMsmeRegistration: e.target.value})}
                            >
                              <option value="No">No</option>
                              <option value="Yes">Yes</option>
                            </select>
                          </div>

                          <div className="vendor-input-group">
                            <label className="vendor-label">
                              <span>MSME Registration No</span>
                              {newVendor.isMsmeRegistration !== 'Yes' && <span className="vendor-optional-tag">Disabled</span>}
                            </label>
                            <input 
                              type="text" 
                              className="vendor-input" 
                              placeholder="UDYAM-XX-00-0000000"
                              disabled={newVendor.isMsmeRegistration !== 'Yes'}
                              value={newVendor.msmeRegistrationNo || ''} 
                              onChange={e => setNewVendor({...newVendor, msmeRegistrationNo: e.target.value})} 
                            />
                          </div>

                          <div className="vendor-input-group">
                            <label className="vendor-label">
                              <span>MSME Type / Category</span>
                              {newVendor.isMsmeRegistration !== 'Yes' && <span className="vendor-optional-tag">Disabled</span>}
                            </label>
                            <input 
                              type="text" 
                              className="vendor-input" 
                              placeholder="Micro / Small / Medium"
                              disabled={newVendor.isMsmeRegistration !== 'Yes'}
                              value={newVendor.msmeRegistrationType || ''} 
                              onChange={e => setNewVendor({...newVendor, msmeRegistrationType: e.target.value})} 
                            />
                          </div>
                        </div>

                        <div className="vendor-form-grid-4" style={{ marginTop: '14px' }}>
                          <div className="vendor-input-group">
                            <label className="vendor-label">
                              <span>Payment Terms</span>
                              <span className="vendor-optional-tag">Optional</span>
                            </label>
                            <input 
                              type="text" 
                              className="vendor-input" 
                              placeholder="e.g. Net 30"
                              value={newVendor.paymentTerms || ''} 
                              onChange={e => setNewVendor({...newVendor, paymentTerms: e.target.value})} 
                            />
                          </div>

                          <div className="vendor-input-group">
                            <label className="vendor-label">
                              <span>Payment Method</span>
                            </label>
                            <select 
                              className="vendor-select" 
                              value={newVendor.paymentMethod || 'NEFT'} 
                              onChange={e => setNewVendor({...newVendor, paymentMethod: e.target.value})}
                            >
                              <option value="NEFT">NEFT</option>
                              <option value="RTGS">RTGS</option>
                              <option value="IMPS">IMPS</option>
                              <option value="Cheque">Cheque</option>
                              <option value="Cash">Cash</option>
                            </select>
                          </div>

                          <div className="vendor-input-group">
                            <label className="vendor-label">
                              <span>Credit Limit (₹)</span>
                              <span className="vendor-optional-tag">Optional</span>
                            </label>
                            <input 
                              type="number" 
                              className="vendor-input" 
                              placeholder="500000"
                              value={newVendor.creditLimit || ''} 
                              onChange={e => setNewVendor({...newVendor, creditLimit: Number(e.target.value) || 0})} 
                            />
                          </div>

                          <div className="vendor-input-group">
                            <label className="vendor-label">
                              <span>Credit Days</span>
                              <span className="vendor-optional-tag">Optional</span>
                            </label>
                            <input 
                              type="number" 
                              className="vendor-input" 
                              placeholder="30"
                              value={newVendor.creditDays || ''} 
                              onChange={e => setNewVendor({...newVendor, creditDays: Number(e.target.value) || 0})} 
                            />
                          </div>
                        </div>

                        <div className="vendor-form-grid-2" style={{ marginTop: '14px' }}>
                          <div className="vendor-input-group">
                            <label className="vendor-label">
                              <span>Taxes / GST Config</span>
                              <span className="vendor-optional-tag">Optional</span>
                            </label>
                            <input 
                              type="text" 
                              className="vendor-input" 
                              placeholder="e.g. SGST+CGST 12%"
                              value={newVendor.taxes || ''} 
                              onChange={e => setNewVendor({...newVendor, taxes: e.target.value})} 
                            />
                          </div>

                          <div className="vendor-input-group">
                            <label className="vendor-label">
                              <span>Delivery Terms</span>
                              <span className="vendor-optional-tag">Optional</span>
                            </label>
                            <input 
                              type="text" 
                              className="vendor-input" 
                              placeholder="e.g. FOB Destination, Free Shipping"
                              value={newVendor.deliveryTerms || ''} 
                              onChange={e => setNewVendor({...newVendor, deliveryTerms: e.target.value})} 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 4: RATE LIST */}
                  {vendorStep === 4 && (
                    <div id="sec-ratelist" className="vendor-card" style={{ animation: 'fadeIn 0.2s ease' }}>
                      <div className="vendor-card-header">
                        <div className="vendor-card-title-group">
                          <div className="vendor-card-icon-box green">
                            <i data-lucide="package" style={{ width: '20px', height: '20px' }}></i>
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <h3 className="vendor-card-title">Medicine / Rate List</h3>
                              <span style={{ background: '#DCFCE7', color: '#166534', fontWeight: 800, fontSize: '11px', padding: '2px 8px', borderRadius: '12px' }}>
                                {(newVendor.medicines || []).length} { (newVendor.medicines || []).length === 1 ? 'Item' : 'Items' }
                              </span>
                            </div>
                            <p className="vendor-card-subtitle">Add medicines supplied by this vendor and their wholesale purchase prices.</p>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '12px', color: '#D97706', background: '#FEF3C7', padding: '4px 10px', borderRadius: '6px', fontWeight: 700 }}>
                            At least 1 item required
                          </span>
                          <button
                            type="button"
                            className="proc-btn proc-btn-primary"
                            style={{ padding: '7px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                            onClick={() => {
                              const updatedMeds = [...(newVendor.medicines || []), { name: '', sku: '', price: 0, gst: 12, available: true }];
                              setNewVendor({ ...newVendor, medicines: updatedMeds });
                            }}
                          >
                            <i data-lucide="plus" style={{ width: '15px', height: '15px' }}></i> Add New Item
                          </button>
                        </div>
                      </div>

                      {(!newVendor.medicines || newVendor.medicines.length === 0) ? (
                        <div style={{ padding: '36px', textAlign: 'center', background: '#F8FAFC', borderRadius: '10px', border: '1.5px dashed #CBD5E1', color: '#64748B' }}>
                          <i data-lucide="pill" style={{ width: '36px', height: '36px', color: '#94A3B8', margin: '0 auto 10px auto', display: 'block' }}></i>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: '#1E293B', marginBottom: '4px' }}>No catalog items added yet</div>
                          <div style={{ fontSize: '12.5px', marginBottom: '16px' }}>Specify vendor wholesale prices for items supplied by this vendor.</div>
                          <button
                            type="button"
                            className="proc-btn proc-btn-secondary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            onClick={() => {
                              const updatedMeds = [{ name: '', sku: '', price: 0, gst: 12, available: true }];
                              setNewVendor({ ...newVendor, medicines: updatedMeds });
                            }}
                          >
                            <i data-lucide="plus" style={{ width: '14px', height: '14px' }}></i> Add First Medicine
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {/* Table Header */}
                          <div style={{ display: 'grid', gridTemplateColumns: '40px 3.5fr 2fr 1.8fr 1.2fr 90px 48px', gap: '12px', padding: '10px 14px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px', alignItems: 'center' }}>
                            <div style={{ textAlign: 'center' }}>#</div>
                            <div>Medicine Name <span style={{ color: '#EF4444' }}>*</span></div>
                            <div>SKU <span style={{ color: '#EF4444' }}>*</span></div>
                            <div>Purchase Price (₹) <span style={{ color: '#EF4444' }}>*</span></div>
                            <div>GST (%) <span style={{ color: '#EF4444' }}>*</span></div>
                            <div style={{ textAlign: 'center' }}>Available</div>
                            <div style={{ textAlign: 'center' }}>Action</div>
                          </div>

                          {/* Table Rows */}
                          {newVendor.medicines.map((medRow, idx) => (
                            <div 
                              key={idx} 
                              style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '40px 3.5fr 2fr 1.8fr 1.2fr 90px 48px', 
                                gap: '12px', 
                                alignItems: 'center', 
                                padding: '8px 14px',
                                background: '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                position: 'relative', 
                                zIndex: activeVendorMedFocus === idx ? 99 : 1,
                                transition: 'box-shadow 0.2s ease, border-color 0.2s ease'
                              }}
                            >
                              <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '12px', color: '#64748B' }}>
                                {idx + 1}
                              </div>

                              {/* Medicine Name (Add / Type any medicine name) */}
                              <div style={{ position: 'relative' }}>
                                <input
                                  type="text"
                                  required
                                  className="vendor-input"
                                  placeholder="e.g. Dolo 650, Paracetamol 500mg..."
                                  value={medRow.name}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setNewVendor(prev => {
                                      const updatedMeds = [...prev.medicines];
                                      const oldSku = updatedMeds[idx]?.sku || '';
                                      // If SKU is empty or was auto-generated, suggest a clean SKU
                                      const suggestedSku = (!oldSku || oldSku.startsWith('MED-'))
                                        ? `MED-${val.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8) || (idx + 1)}`
                                        : oldSku;

                                      updatedMeds[idx] = { 
                                        ...updatedMeds[idx], 
                                        name: val,
                                        sku: oldSku || suggestedSku
                                      };
                                      const match = medicines.find(m => m.name.toLowerCase() === val.trim().toLowerCase());
                                      if (match) {
                                        updatedMeds[idx].sku = match.sku;
                                      }
                                      return { ...prev, medicines: updatedMeds };
                                    });
                                  }}
                                  onFocus={() => setActiveVendorMedFocus(idx)}
                                  onBlur={() => setTimeout(() => setActiveVendorMedFocus(null), 300)}
                                />
                                {activeVendorMedFocus === idx && (() => {
                                  const query = (medRow.name || '').trim().toLowerCase();
                                  if (query.length < 2) return null;
                                  const filtered = medicines.filter(m => m.name.toLowerCase().includes(query)).slice(0, 5);
                                  if (filtered.length === 0) return null;
                                  return (
                                    <div
                                      data-lenis-prevent
                                      onMouseDown={(e) => e.preventDefault()}
                                      style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        right: 0,
                                        backgroundColor: '#ffffff',
                                        border: '1px solid #CBD5E1',
                                        borderRadius: '8px',
                                        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.12)',
                                        zIndex: 1000,
                                        maxHeight: '180px',
                                        overflowY: 'auto',
                                        marginTop: '4px'
                                      }}
                                    >
                                      <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 800, color: '#64748B', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase' }}>
                                        Existing Hospital Catalog Matches
                                      </div>
                                      {filtered.map(m => (
                                        <div
                                          key={m._id || m.sku || m.name}
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();

                                            setNewVendor(prev => {
                                              const updatedMeds = [...prev.medicines];
                                              updatedMeds[idx] = { ...updatedMeds[idx], name: m.name, sku: m.sku };
                                              return { ...prev, medicines: updatedMeds };
                                            });
                                            setTimeout(() => {
                                              setActiveVendorMedFocus(null);
                                            }, 50);
                                          }}
                                          style={{
                                            padding: '8px 12px',
                                            fontSize: '13px',
                                            fontWeight: 700,
                                            color: '#1E293B',
                                            cursor: 'pointer',
                                            borderBottom: '1px solid #F1F5F9',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                          }}
                                          onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                                          onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                                        >
                                          <span style={{ pointerEvents: 'none' }}>{m.name}</span>
                                          <span style={{ fontSize: '11px', color: '#2563EB', fontFamily: 'monospace', fontWeight: 700, pointerEvents: 'none' }}>{m.sku}</span>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* SKU */}
                              <div>
                                <input
                                  type="text"
                                  className="vendor-input"
                                  style={{ fontFamily: 'monospace' }}
                                  placeholder="SKU Code"
                                  value={medRow.sku || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    const updatedMeds = [...newVendor.medicines];
                                    updatedMeds[idx] = { ...updatedMeds[idx], sku: val };
                                    setNewVendor({ ...newVendor, medicines: updatedMeds });
                                  }}
                                />
                              </div>

                              {/* Purchase Price */}
                              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <span style={{ position: 'absolute', left: '10px', color: '#64748B', fontWeight: 700, fontSize: '13px', pointerEvents: 'none' }}>₹</span>
                                <input
                                  type="number"
                                  required
                                  className="vendor-input"
                                  style={{ paddingLeft: '24px', fontWeight: 700 }}
                                  placeholder="0.00"
                                  min="0"
                                  step="0.01"
                                  value={medRow.price || ''}
                                  onChange={e => {
                                    const val = Number(e.target.value) || 0;
                                    const updatedMeds = [...newVendor.medicines];
                                    updatedMeds[idx] = { ...updatedMeds[idx], price: val };
                                    setNewVendor({ ...newVendor, medicines: updatedMeds });
                                  }}
                                />
                              </div>

                              {/* GST */}
                              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <input
                                  type="number"
                                  required
                                  className="vendor-input"
                                  style={{ paddingRight: '22px' }}
                                  placeholder="12"
                                  min="0"
                                  max="100"
                                  value={medRow.gst !== undefined ? medRow.gst : 12}
                                  onChange={e => {
                                    const val = Number(e.target.value) || 0;
                                    const updatedMeds = [...newVendor.medicines];
                                    updatedMeds[idx] = { ...updatedMeds[idx], gst: val };
                                    setNewVendor({ ...newVendor, medicines: updatedMeds });
                                  }}
                                />
                                <span style={{ position: 'absolute', right: '10px', color: '#94A3B8', fontSize: '12px', pointerEvents: 'none' }}>%</span>
                              </div>

                              {/* Available Toggle */}
                              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                <label style={{ position: 'relative', display: 'inline-block', width: '38px', height: '20px', margin: 0, cursor: 'pointer' }}>
                                  <input 
                                    type="checkbox" 
                                    checked={medRow.available !== false}
                                    onChange={e => {
                                      const updatedMeds = [...newVendor.medicines];
                                      updatedMeds[idx] = { ...updatedMeds[idx], available: e.target.checked };
                                      setNewVendor({ ...newVendor, medicines: updatedMeds });
                                    }}
                                    style={{ opacity: 0, width: 0, height: 0 }}
                                  />
                                  <span style={{
                                    position: 'absolute',
                                    cursor: 'pointer',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    backgroundColor: medRow.available !== false ? '#10B981' : '#CBD5E1',
                                    transition: '0.2s',
                                    borderRadius: '20px'
                                  }}>
                                    <span style={{
                                      position: 'absolute',
                                      content: '""',
                                      height: '14px',
                                      width: '14px',
                                      left: medRow.available !== false ? '20px' : '3px',
                                      bottom: '3px',
                                      backgroundColor: 'white',
                                      transition: '0.2s',
                                      borderRadius: '50%'
                                    }}></span>
                                  </span>
                                </label>
                              </div>

                              {/* Action (Delete) */}
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <button
                                  type="button"
                                  style={{ background: '#FEE2E2', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#EF4444', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease' }}
                                  title="Remove Item"
                                  onClick={() => {
                                    const updatedMeds = newVendor.medicines.filter((_, i) => i !== idx);
                                    setNewVendor({ ...newVendor, medicines: updatedMeds });
                                  }}
                                >
                                  <i data-lucide="trash-2" style={{ width: '15px', height: '15px' }}></i>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="vendor-callout-tip">
                        <i data-lucide="lightbulb" style={{ width: '16px', height: '16px', flexShrink: 0, color: '#16A34A' }}></i>
                        <span>Tip: Enter the vendor's wholesale purchase price. Hospital selling price (MRP) is set by Admin during approval.</span>
                      </div>
                    </div>
                  )}

                  {/* STEP 5: REVIEW & SUBMIT */}
                  {vendorStep === 5 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeIn 0.2s ease' }}>
                      {/* Review Overview Card */}
                      <div className="vendor-card">
                        <div className="vendor-card-header">
                          <div className="vendor-card-title-group">
                            <div className="vendor-card-icon-box blue">
                              <i data-lucide="check-circle-2" style={{ width: '20px', height: '20px' }}></i>
                            </div>
                            <div>
                              <h3 className="vendor-card-title">Registration Summary & Review</h3>
                              <p className="vendor-card-subtitle">Verify supplier information and commercial details before submission for admin approval.</p>
                            </div>
                          </div>
                          <span className="vendor-autogen-tag">Final Step</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          {/* Block 1: Vendor Identity */}
                          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i data-lucide="building-2" style={{ width: '14px', height: '14px', color: '#2563EB' }}></i> Vendor Identity
                              </span>
                              <button type="button" onClick={() => setVendorStep(1)} style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px' }}>
                              <div><span style={{ color: '#64748B' }}>Name:</span> <strong style={{ color: '#0F172A' }}>{newVendor.name || '—'}</strong></div>
                              <div><span style={{ color: '#64748B' }}>Code:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{newVendor.code || `VND-0${getDisplayVendors().length + 1}`}</span></div>
                              <div><span style={{ color: '#64748B' }}>Type:</span> {newVendor.type} • {newVendor.supplierCategory}</div>
                              <div><span style={{ color: '#64748B' }}>Status:</span> <span style={{ color: newVendor.status === 'Active' ? '#15803D' : '#64748B', fontWeight: 700 }}>{newVendor.status}</span></div>
                            </div>
                          </div>

                          {/* Block 2: Primary Contact & Address */}
                          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i data-lucide="map-pin" style={{ width: '14px', height: '14px', color: '#7C3AED' }}></i> Location & Contact
                              </span>
                              <button type="button" onClick={() => setVendorStep(2)} style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px' }}>
                              <div><span style={{ color: '#64748B' }}>Primary Contact:</span> <strong style={{ color: '#0F172A' }}>{newVendor.contactPerson || newVendor.primaryContactPerson || '—'}</strong></div>
                              <div><span style={{ color: '#64748B' }}>Mobile:</span> {newVendor.phone || newVendor.primaryContactPersonMobileNo || '—'}</div>
                              <div><span style={{ color: '#64748B' }}>City / State:</span> {newVendor.city || '—'}, {newVendor.state || '—'} ({newVendor.zipCode || newVendor.pinCode || '—'})</div>
                              <div><span style={{ color: '#64748B' }}>Email:</span> {newVendor.email || newVendor.primaryContactPersonEmailId || '—'}</div>
                            </div>
                          </div>

                          {/* Block 3: Compliance & Commercial */}
                          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i data-lucide="shield" style={{ width: '14px', height: '14px', color: '#D97706' }}></i> Compliance & Terms
                              </span>
                              <button type="button" onClick={() => setVendorStep(3)} style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px' }}>
                              <div><span style={{ color: '#64748B' }}>GSTIN:</span> <strong style={{ fontFamily: 'monospace' }}>{newVendor.gstNumber || '—'}</strong></div>
                              <div><span style={{ color: '#64748B' }}>PAN / DL:</span> {newVendor.panNumber || newVendor.panCardNo || '—'} / {newVendor.licenseNumber || '—'}</div>
                              <div><span style={{ color: '#64748B' }}>Bank:</span> {newVendor.bankName || newVendor.bank1Name || '—'} ({newVendor.accountNumber || newVendor.bank1AccountNumber || '—'})</div>
                              <div><span style={{ color: '#64748B' }}>Payment Terms:</span> {newVendor.paymentTerms || 'Net 30'} • {newVendor.paymentMethod || 'NEFT'}</div>
                            </div>
                          </div>

                          {/* Block 4: Medicines Catalog */}
                          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i data-lucide="package" style={{ width: '14px', height: '14px', color: '#059669' }}></i> Catalog Items
                              </span>
                              <button type="button" onClick={() => setVendorStep(4)} style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px' }}>
                              <div><span style={{ color: '#64748B' }}>Total Medicines:</span> <strong style={{ color: '#0F172A' }}>{(newVendor.medicines || []).length} items listed</strong></div>
                              <div style={{ maxHeight: '60px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                {(newVendor.medicines || []).map((m, i) => (
                                  <span key={i} style={{ background: '#E2E8F0', color: '#334155', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                    {m.name || 'Item'} (₹{m.price || 0})
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Internal Remarks Card */}
                      <div id="sec-remarks" className="vendor-card">
                        <div className="vendor-card-header">
                          <div className="vendor-card-title-group">
                            <div className="vendor-card-icon-box slate">
                              <i data-lucide="message-square" style={{ width: '20px', height: '20px' }}></i>
                            </div>
                            <div>
                              <h3 className="vendor-card-title">Internal Remarks</h3>
                              <p className="vendor-card-subtitle">Optional notes, delivery preferences, or credit terms regarding this supplier.</p>
                            </div>
                          </div>
                          <span className="vendor-optional-tag">Optional</span>
                        </div>

                        <div className="vendor-input-group full-width">
                          <textarea 
                            className="vendor-textarea" 
                            style={{ minHeight: '80px' }} 
                            placeholder="Add internal notes about this vendor (e.g. Authorized distributor for northern region, offers 5% volume discount)..."
                            value={newVendor.notes || ''} 
                            onChange={e => setNewVendor({...newVendor, notes: e.target.value})} 
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 10. FIXED BOTTOM ACTION BAR */}
                  <div className="vendor-sticky-footer">
                    <div className="vendor-footer-status">
                      <span className="vendor-pulse-dot"></span>
                      <span>Draft saved automatically</span>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <button 
                        type="button" 
                        className="proc-btn proc-btn-secondary" 
                        onClick={() => {
                          setIsAddingVendor(false);
                          setEditingVendor(null);
                          resetVendorForm();
                          setVendorStep(1);
                        }}
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        name="saveVendor" 
                        className="proc-btn proc-btn-secondary" 
                        style={{ backgroundColor: '#F8FAFC', color: '#0F172A', border: '1px solid #CBD5E1', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <i data-lucide="bookmark" style={{ width: '14px', height: '14px', color: '#2563EB' }}></i> Save as Draft
                      </button>

                      {vendorStep > 1 && (
                        <button
                          type="button"
                          className="proc-btn proc-btn-secondary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                          onClick={() => setVendorStep(prev => prev - 1)}
                        >
                          <i data-lucide="arrow-left" style={{ width: '14px', height: '14px' }}></i> Previous
                        </button>
                      )}

                      {vendorStep < 5 ? (
                        <button
                          type="button"
                          className="proc-btn proc-btn-primary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 800 }}
                          onClick={() => setVendorStep(prev => prev + 1)}
                        >
                          Save & Next
                          <i data-lucide="arrow-right" style={{ width: '15px', height: '15px' }}></i>
                        </button>
                      ) : (
                        <button 
                          type="submit" 
                          name="saveAndAddPrice" 
                          className="proc-btn proc-btn-primary"
                          id="vendor-primary-submit-btn"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 800, background: '#16A34A', borderColor: '#15803D' }}
                        >
                          {editingVendor ? 'Save Changes' : 'Register Vendor'}
                          <i data-lucide="check" style={{ width: '15px', height: '15px' }}></i>
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              )
            )}

            {/* VIEW 3: PURCHASE ORDERS */}
            {activeTab === 'pos' && (
              !isCreatingPO ? (
                <div>
                  <div className="proc-title-row">
                    <div>
                      <h1 className="proc-title">Purchase Orders</h1>
                      <p className="proc-subtitle">Create POs, compare vendor prices and track delivery status.</p>
                    </div>
                    <button className="proc-btn proc-btn-primary" onClick={() => {
                      fetchNextPoNumber();
                      setPoScreenOrderDate(new Date().toISOString().split('T')[0]);
                      setPoScreenExpectedDelivery(new Date(Date.now() + 4*24*60*60*1000).toISOString().split('T')[0]);
                      setPoScreenDefaultVendor('');
                      
                      const initialItems = [{ sku: '', qty: 100, vendorId: '', price: 0, discount: 0, tax: 12 }];
                      setPoScreenItems(initialItems);
                      setPoScreenNotes('');
                      setEditingDraftPO(null);
                      setIsCreatingPO(true);
                    }}>
                      <i data-lucide="plus"></i> Create Purchase Order
                    </button>
                  </div>

                  {/* KPI CARDS ROW (MATCHING ADMIN PORTAL DESIGN LANGUAGE) */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '16px',
                    width: '100%',
                    marginBottom: '24px',
                    boxSizing: 'border-box'
                  }}>
                    {/* Card 1: TOTAL POS (Electric Blue Theme) */}
                    <div 
                      style={{
                        padding: '18px 20px',
                        borderRadius: '16px',
                        border: '1px solid rgba(191, 219, 254, 0.95)',
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
                      onClick={() => setPoFilter('all')}
                      title="Filter by all POs"
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
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                        </div>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          TOTAL POS
                        </span>
                      </div>

                      <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                            {getDisplayPOs().length}
                          </div>
                          <div style={{ fontSize: '12px', color: '#1D4ED8', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                            {getDisplayPOs().length > 0 ? `${getDisplayPOs().filter(p => !p.parentPOId).length} master / standalone POs` : 'No purchase orders'}
                          </div>
                        </div>

                        {/* Blue Mini Sparkline */}
                        <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                          <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                            <defs>
                              <linearGradient id="poBlueGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.45"/>
                                <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05"/>
                              </linearGradient>
                            </defs>
                            <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#poBlueGrad)" />
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

                    {/* Card 2: OPEN ORDERS (Purple / Violet Theme) */}
                    <div 
                      style={{
                        padding: '18px 20px',
                        borderRadius: '16px',
                        border: '1px solid rgba(233, 213, 255, 0.95)',
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
                      onClick={() => setPoFilter('awaiting')}
                      title="Filter by open / awaiting delivery"
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
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                        </div>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#581C87', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          OPEN ORDERS
                        </span>
                      </div>

                      <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                            {getDisplayPOs().filter(p => ['Approved', 'Sent', 'Confirmed', 'Partially Delivered'].includes(p.status)).length}
                          </div>
                          <div style={{ fontSize: '12px', color: '#7C3AED', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                            Awaiting supplier delivery
                          </div>
                        </div>

                        {/* Purple Mini Sparkline */}
                        <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                          <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                            <defs>
                              <linearGradient id="poPurpleGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.45"/>
                                <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.05"/>
                              </linearGradient>
                            </defs>
                            <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#poPurpleGrad)" />
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

                    {/* Card 3: PARTIALLY DELIVERED (Warm Amber / Orange Theme) */}
                    <div 
                      style={{
                        padding: '18px 20px',
                        borderRadius: '16px',
                        border: '1px solid rgba(254, 215, 170, 0.95)',
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
                      onClick={() => setPoFilter('awaiting')}
                      title="Filter by partially delivered"
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
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="13" x="1" y="3" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                        </div>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#78350F', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          PARTIALLY DELIVERED
                        </span>
                      </div>

                      <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                            {getDisplayPOs().filter(p => p.status === 'Partially Delivered').length}
                          </div>
                          <div style={{ fontSize: '12px', color: '#D97706', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                            {getDisplayPOs().filter(p => p.status === 'Partially Delivered').length > 0 ? 'Partial intake in progress' : '0 split deliveries pending'}
                          </div>
                        </div>

                        {/* Amber Mini Sparkline */}
                        <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                          <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                            <defs>
                              <linearGradient id="poAmberGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.45"/>
                                <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.05"/>
                              </linearGradient>
                            </defs>
                            <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22 L 64 32 L 0 32 Z" fill="url(#poAmberGrad)" />
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

                    {/* Card 4: COMPLETED (Emerald / Mint Green Theme) */}
                    <div 
                      style={{
                        padding: '18px 20px',
                        borderRadius: '16px',
                        border: '1px solid rgba(167, 243, 208, 0.95)',
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
                      onClick={() => setPoFilter('delivered')}
                      title="Filter by completed / delivered POs"
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
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        </div>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#064E3B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          COMPLETED
                        </span>
                      </div>

                      <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                            {getDisplayPOs().filter(p => p.status === 'Completed').length}
                          </div>
                          <div style={{ fontSize: '12px', color: '#059669', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                            100% fulfilled & verified
                          </div>
                        </div>

                        {/* Green Mini Sparkline */}
                        <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                          <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                            <defs>
                              <linearGradient id="poGreenGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10B981" stopOpacity="0.45"/>
                                <stop offset="100%" stopColor="#10B981" stopOpacity="0.05"/>
                              </linearGradient>
                            </defs>
                            <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10 L 64 32 L 0 32 Z" fill="url(#poGreenGrad)" />
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
                  </div>

                  <div className="proc-card" style={{ padding: '24px', overflow: 'hidden' }}>
                    <div style={{ paddingBottom: '16px', borderBottom: '1.5px solid #F1F5F9', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>All Purchase Orders</span>
                      <button 
                        type="button"
                        className="proc-btn proc-btn-secondary" 
                        style={{ padding: '6px 14px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#2563EB', borderColor: '#BFDBFE', background: '#EFF6FF', fontWeight: 700, cursor: 'pointer' }}
                        onClick={() => setShowPoExportModal(true)}
                        title="Export filtered Purchase Orders as Excel or PDF"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Export
                      </button>
                    </div>

                    {/* Tab Filter Segment Bar */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: '#F8FAFC', padding: '4px', borderRadius: '8px', width: 'fit-content', border: '1px solid #E2E8F0' }}>
                      {[
                        { key: 'all', label: `All POs (${getDisplayPOs().length})` },
                        { key: 'awaiting', label: `Awaiting Delivery (${getDisplayPOs().filter(p => ['Approved', 'Sent', 'Confirmed', 'Partially Delivered'].includes(p.status)).length})` },
                        { key: 'pending', label: `Sent for Approval (${getDisplayPOs().filter(p => p.status === 'Pending').length})` },
                        { key: 'delivered', label: `Delivered POs (${getDisplayPOs().filter(p => p.status === 'Completed').length})` },
                        { key: 'drafts', label: `Drafts / Rejected (${getDisplayPOs().filter(p => p.status === 'Draft' || p.status === 'Rejected').length})` }
                      ].map(tab => (
                        <button
                          key={tab.key}
                          onClick={() => setPoFilter(tab.key)}
                          style={{
                            padding: '6px 14px',
                             borderRadius: '6px',
                             fontSize: '12.5px',
                             fontWeight: 700,
                             border: 'none',
                             cursor: 'pointer',
                             background: poFilter === tab.key ? '#FFFFFF' : 'transparent',
                             color: poFilter === tab.key ? '#2563EB' : '#475569',
                             boxShadow: poFilter === tab.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                             transition: 'all 0.15s ease'
                          }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table className="proc-table">
                        <thead>
                          <tr>
                            <th>PO Number</th>
                            <th>Order Date</th>
                            <th>Vendor</th>
                            <th>Expected Delivery</th>
                            <th>Items</th>
                            <th>Total</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right', paddingRight: '24px' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            let pos = getDisplayPOs();
                            if (poFilter === 'awaiting') {
                              pos = pos.filter(p => ['Approved', 'Sent', 'Confirmed', 'Partially Delivered'].includes(p.status));
                            } else if (poFilter === 'pending') {
                              pos = pos.filter(p => p.status === 'Pending' || p.status === 'Pending Approval');
                            } else if (poFilter === 'delivered') {
                              pos = pos.filter(p => p.status === 'Completed');
                            } else if (poFilter === 'drafts') {
                              pos = pos.filter(p => p.status === 'Draft' || p.status === 'Rejected');
                            }

                            if (searchQuery && searchQuery.trim()) {
                              const q = searchQuery.trim().toLowerCase();
                              pos = pos.filter(p => {
                                const matchId = p.poId && p.poId.toLowerCase().includes(q);
                                const matchVendor = p.vendorName && p.vendorName.toLowerCase().includes(q);
                                const matchStatus = p.status && p.status.toLowerCase().includes(q);
                                const matchItems = p.items && p.items.some(it => 
                                  (it.name && it.name.toLowerCase().includes(q)) || 
                                  (it.sku && it.sku.toLowerCase().includes(q))
                                );
                                return matchId || matchVendor || matchStatus || matchItems;
                              });
                            }

                            if (pos.length === 0) {
                              return (
                                <tr>
                                  <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: '#64748B' }}>
                                    <div style={{ fontWeight: 800, fontSize: '14.5px', color: '#0F172A', marginBottom: '6px' }}>
                                      {searchQuery ? `No purchase orders found matching "${searchQuery}"` : 'No purchase orders found'}
                                    </div>
                                    <div style={{ fontSize: '12.5px', color: '#94A3B8' }}>
                                      {searchQuery ? 'Check your search term or clear the search input.' : 'Try creating a new purchase order or switching filters.'}
                                    </div>
                                  </td>
                                </tr>
                              );
                            }

                            return pos.map(po => {
                            const isMaster = po.isParent || po.vendorName === 'Consolidated Multiple Suppliers' || (po.vendorOrders && po.vendorOrders.length > 0);
                            const isChild = Boolean(po.parentPOId);

                            // If child PO and its parent is collapsed, hide this row
                            if (isChild && collapsedMasterPOs[po.parentPOId]) {
                              return null;
                            }

                            const isCollapsed = isMaster && collapsedMasterPOs[po.poId];
                            const orderDate = new Date(po.createdAt || Date.now()).toISOString().split('T')[0];
                            const expectedDelivery = po.expectedDelivery 
                              ? new Date(po.expectedDelivery).toISOString().split('T')[0] 
                              : new Date(new Date(po.createdAt || Date.now()).getTime() + 3*24*60*60*1000).toISOString().split('T')[0];
                            
                            const itemsCount = po.items ? po.items.reduce((sum, item) => sum + (item.requiredQty || item.qty || 0), 0) : 0;

                            return (
                              <tr 
                                key={po._id} 
                                onClick={isMaster ? () => toggleMasterPO(po.poId) : undefined}
                                style={{ 
                                  background: isMaster 
                                    ? (isCollapsed ? 'linear-gradient(90deg, #EFF6FF 0%, #F8FAFC 100%)' : 'linear-gradient(90deg, #EFF6FF 0%, #F1F5F9 55%, #F8FAFC 100%)') 
                                    : (isChild ? '#FFFFFF' : undefined),
                                  borderLeft: isMaster ? '4px solid #2563EB' : '4px solid transparent',
                                  borderTop: isMaster ? '1.5px solid #DBEAFE' : undefined,
                                  borderBottom: isMaster ? (isCollapsed ? '1.5px solid #DBEAFE' : '1px solid #DBEAFE') : (isChild ? '1px solid #F1F5F9' : undefined),
                                  cursor: isMaster ? 'pointer' : 'default',
                                  transition: 'background-color 0.15s ease'
                                }}
                                title={isMaster ? (isCollapsed ? 'Click to expand vendor sub-orders' : 'Click to collapse vendor sub-orders') : undefined}
                              >
                                <td style={{ whiteSpace: 'nowrap' }}>
                                  {isMaster ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                                      <button 
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleMasterPO(po.poId);
                                        }}
                                        style={{
                                          width: '24px',
                                          height: '24px',
                                          borderRadius: '6px',
                                          background: '#DBEAFE',
                                          border: '1px solid #BFDBFE',
                                          color: '#1D4ED8',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          cursor: 'pointer',
                                          padding: 0,
                                          transition: 'transform 0.2s ease',
                                          transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
                                        }}
                                        title={isCollapsed ? 'Expand sub-orders' : 'Collapse sub-orders'}
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                                      </button>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 900, color: '#1E40AF', fontSize: '13px', background: '#DBEAFE', padding: '4px 9px', borderRadius: '7px', border: '1.5px solid #93C5FD', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                                        {po.poId}
                                      </span>
                                      <span style={{ fontSize: '10px', fontWeight: 850, background: '#2563EB', color: '#FFFFFF', padding: '2px 7px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)', whiteSpace: 'nowrap' }}>
                                        Master PO
                                      </span>
                                    </div>
                                  ) : isChild ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '22px', whiteSpace: 'nowrap' }}>
                                      <span style={{ color: '#94A3B8', fontWeight: 900, fontSize: '14px', fontFamily: 'monospace', lineHeight: 1 }}>
                                        ↳
                                      </span>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1E293B', fontSize: '12.5px', background: '#F8FAFC', padding: '3px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', whiteSpace: 'nowrap' }}>
                                        {po.poId}
                                      </span>
                                      <span style={{ fontSize: '9.5px', fontWeight: 800, background: '#F1F5F9', color: '#475569', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>
                                        Sub-PO
                                      </span>
                                    </div>
                                  ) : (
                                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0F172A', fontSize: '13px', whiteSpace: 'nowrap' }}>{po.poId}</span>
                                  )}
                                </td>
                                <td style={{ fontWeight: 500 }}>{orderDate}</td>
                                <td>
                                  {isMaster ? (
                                    <div>
                                      <div style={{ fontWeight: 850, color: '#1E3A8A', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2563EB' }}></span>
                                        Consolidated Multiple Suppliers
                                      </div>
                                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
                                        Split into {po.totalVendors || (po.vendorOrders ? po.vendorOrders.length : 2)} vendor orders
                                      </div>
                                    </div>
                                  ) : isChild ? (
                                    <div>
                                      <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>
                                        {po.vendorName}
                                      </div>
                                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                                        <span>Generated from</span>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#2563EB' }}>{po.parentPOId}</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <span style={{ fontWeight: 700, color: '#475569' }}>{po.vendorName}</span>
                                  )}
                                </td>
                                <td style={{ fontWeight: 500 }}>{expectedDelivery}</td>
                                <td style={{ fontWeight: 700 }}>{itemsCount}</td>
                                <td style={{ fontWeight: 900, color: isMaster ? '#1E3A8A' : '#0F172A' }}>₹{Number(po.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td>
                                  {isMaster ? (
                                    <span style={{
                                      background: '#EEF2FF',
                                      color: '#3730A3',
                                      border: '1.5px solid #C7D2FE',
                                      padding: '4px 11px',
                                      borderRadius: '20px',
                                      fontSize: '11px',
                                      fontWeight: 850,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                      boxShadow: '0 1px 3px rgba(79, 70, 229, 0.1)'
                                    }}>
                                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4F46E5' }}></span>
                                      Consolidated ({po.totalVendors || (po.vendorOrders ? po.vendorOrders.length : 2)} POs)
                                    </span>
                                  ) : (
                                    <span className={`proc-badge ${(po.status || 'draft').toLowerCase().replace(/ /g, '-')}`} style={{ 
                                      background: (po.status === 'Pending' || po.status === 'Pending Approval') ? '#FFF7ED' : undefined,
                                      color: (po.status === 'Pending' || po.status === 'Pending Approval') ? '#C2410C' : undefined
                                    }}>
                                      {po.status === 'Pending' ? 'Sent for Approval' : po.status}
                                    </span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button 
                                      type="button"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '5px',
                                        height: '32px',
                                        width: '68px',
                                        minWidth: '68px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        background: '#EFF6FF',
                                        color: '#1D4ED8',
                                        border: '1.5px solid #BFDBFE',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        whiteSpace: 'nowrap'
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        printPO(po, localStorage.getItem('tenantName') || 'CUROXA HEALTHCARE');
                                      }}
                                      title="Download / Print PO PDF"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                                      <span>PDF</span>
                                    </button>

                                    {po.status === 'Draft' || po.status === 'Rejected' ? (
                                      <button 
                                        type="button"
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: '5px',
                                          height: '32px',
                                          width: '142px',
                                          minWidth: '142px',
                                          padding: '0 8px',
                                          fontSize: '12px',
                                          fontWeight: 700,
                                          background: '#2563EB',
                                          color: '#FFFFFF',
                                          border: '1px solid #1D4ED8',
                                          borderRadius: '6px',
                                          cursor: 'pointer',
                                          boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)',
                                          whiteSpace: 'nowrap'
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleResumeDraft(po);
                                        }}
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        <span>Resume</span>
                                      </button>
                                    ) : (
                                      <>
                                        {(po.status === 'Pending' || po.status === 'Pending Approval') && (
                                          <button 
                                            type="button"
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              gap: '5px',
                                              height: '32px',
                                              width: '142px',
                                              minWidth: '142px',
                                              padding: '0 8px',
                                              fontSize: '12px',
                                              fontWeight: 700,
                                              background: '#FFF7ED',
                                              color: '#C2410C',
                                              border: '1px solid #FFEDD5',
                                              borderRadius: '6px',
                                              cursor: 'pointer',
                                              whiteSpace: 'nowrap'
                                            }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setPreviewPoDetails(po);
                                            }}
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                                            <span>PO Copy</span>
                                          </button>
                                        )}
                                        {['Approved', 'Sent', 'Confirmed', 'Partially Delivered', 'Partially Received'].includes(po.status) && !isMaster ? (
                                          <button 
                                            type="button"
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              gap: '5px',
                                              height: '32px',
                                              width: '142px',
                                              minWidth: '142px',
                                              padding: '0 8px',
                                              fontSize: '12px',
                                              fontWeight: 700,
                                              background: '#ECFDF5',
                                              color: '#047857',
                                              border: '1px solid #A7F3D0',
                                              borderRadius: '6px',
                                              cursor: 'pointer',
                                              whiteSpace: 'nowrap'
                                            }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingGrn(null);
                                              handleGrnPOSelection(po._id);
                                              setGrnFlowType('po');
                                              setActiveTab('grn');
                                              setShowGRNModal(true);
                                            }}
                                            title={po.status === 'Partially Received' || po.status === 'Partially Delivered' ? 'Receive Remaining Items against PO' : 'Receive PO Delivery'}
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                                            <span>{po.status === 'Partially Received' || po.status === 'Partially Delivered' ? 'Receive Remaining' : 'Receive'}</span>
                                          </button>
                                        ) : (
                                          (!['Pending', 'Pending Approval', 'Draft', 'Rejected'].includes(po.status)) && (
                                            <button 
                                              type="button"
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '5px',
                                                height: '32px',
                                                width: '142px',
                                                minWidth: '142px',
                                                padding: '0 8px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                background: '#FFFFFF',
                                                color: '#334155',
                                                border: '1.5px solid #CBD5E1',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                                whiteSpace: 'nowrap'
                                              }}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (isMaster) {
                                                  toggleMasterPO(po.poId);
                                                } else {
                                                  handleGrnPOSelection(po._id);
                                                  setGrnFlowType('po');
                                                  setActiveTab('grn');
                                                  setShowGRNModal(true);
                                                }
                                              }}
                                            >
                                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                              <span>View Details</span>
                                            </button>
                                          )
                                        )}
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          });
                        })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (() => {
                const activeScreenItems = poScreenItems.filter(item => item.sku);
                const totalSubtotal = activeScreenItems.reduce((acc, item) => acc + ((item.qty || 0) * (item.price || 0)), 0);
                const totalDiscount = activeScreenItems.reduce((acc, item) => {
                  const sub = (item.qty || 0) * (item.price || 0);
                  return acc + (sub * ((item.discount || 0) / 100));
                }, 0);
                const totalTax = activeScreenItems.reduce((acc, item) => {
                  const sub = (item.qty || 0) * (item.price || 0);
                  const discAmt = sub * ((item.discount || 0) / 100);
                  return acc + ((sub - discAmt) * ((item.tax || 12) / 100));
                }, 0);
                const totalOverallAmount = totalSubtotal - totalDiscount + totalTax;
                const uniqueVendorsCount = new Set(activeScreenItems.map(item => item.vendorId).filter(Boolean)).size;

                const vendorBreakdown = {};
                activeScreenItems.forEach(item => {
                  const vId = item.vendorId || 'unassigned';
                  const vName = vendors.find(v => v._id === vId)?.name || 'Unassigned Vendor';
                  const sub = (item.qty || 0) * (item.price || 0);
                  const disc = sub * ((item.discount || 0) / 100);
                  const tax = (sub - disc) * ((item.tax || 12) / 100);
                  const total = sub - disc + tax;

                  if (!vendorBreakdown[vId]) {
                    vendorBreakdown[vId] = {
                      name: vName,
                      subtotal: 0,
                      discount: 0,
                      tax: 0,
                      total: 0
                    };
                  }
                  vendorBreakdown[vId].subtotal += sub;
                  vendorBreakdown[vId].discount += disc;
                  vendorBreakdown[vId].tax += tax;
                  vendorBreakdown[vId].total += total;
                });

                return (
                  <div style={{ animation: 'fadeIn 0.25s ease' }}>
                    {/* Header with Breadcrumb & Action */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      marginBottom: '24px',
                      background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                      padding: '20px 24px',
                      borderRadius: '18px',
                      border: '1.5px solid #E2E8F0',
                      boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.03)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '14px',
                          background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 6px 18px rgba(37, 99, 235, 0.3)',
                          flexShrink: 0
                        }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                            <polyline points="10 9 9 9 8 9"/>
                          </svg>
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: 0, letterSpacing: '-0.02em', fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif" }}>
                              {editingDraftPO ? 'Resume Purchase Order' : 'Create Purchase Order'}
                            </h1>
                            <span style={{ 
                              fontSize: '10.5px', 
                              fontWeight: 800, 
                              background: '#EFF6FF', 
                              color: '#2563EB', 
                              border: '1px solid #BFDBFE', 
                              padding: '2px 8px', 
                              borderRadius: '12px',
                              letterSpacing: '0.04em'
                            }}>
                              PO ENGINE
                            </span>
                          </div>
                          <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0', fontWeight: 600 }}>
                            Compare vendor catalog rates side-by-side, automate multi-supplier line splitting, and lock in approved purchase orders.
                          </p>
                        </div>
                      </div>

                      <button 
                        className="proc-btn proc-btn-secondary" 
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '12px', fontWeight: 750 }}
                        onClick={() => {
                          setIsCreatingPO(false);
                          setEditingDraftPO(null);
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="19" y1="12" x2="5" y2="12"/>
                          <polyline points="12 19 5 12 12 5"/>
                        </svg>
                        <span>Return to Orders</span>
                      </button>
                    </div>

                    {/* Metadata Row Grid Card */}
                    <div style={{ 
                      background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 50%, #EFF6FF 100%)',
                      border: '1.5px solid #DBEAFE',
                      borderRadius: '18px',
                      padding: '20px 24px',
                      marginBottom: '24px',
                      boxShadow: '0 8px 24px -4px rgba(37, 99, 235, 0.04)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#DBEAFE', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          </div>
                          <span style={{ fontSize: '13.5px', fontWeight: 850, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>General Order Configuration</span>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563EB', background: '#FFFFFF', padding: '3px 10px', borderRadius: '20px', border: '1px solid #BFDBFE' }}>
                          Drafting Phase
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px' }}>
                        {/* 1. PO Number */}
                        <div>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                            <span>PO Number</span>
                            <span style={{ fontSize: '9.5px', color: '#2563EB', background: '#EFF6FF', padding: '1px 5px', borderRadius: '4px', border: '1px solid #BFDBFE', fontWeight: 800 }}>AUTO</span>
                          </label>
                          <div style={{ position: 'relative' }}>
                            <input 
                              type="text" 
                              className="proc-input" 
                              style={{ 
                                background: '#F1F5F9', 
                                color: '#1E293B', 
                                fontWeight: 800, 
                                fontFamily: 'monospace', 
                                letterSpacing: '0.02em', 
                                border: '1.5px solid #CBD5E1', 
                                borderRadius: '10px',
                                padding: '10px 14px',
                                fontSize: '13.5px'
                              }} 
                              value={poScreenNumber} 
                              readOnly 
                            />
                          </div>
                        </div>

                        {/* 2. Order Date */}
                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                            Order Date
                          </label>
                          <input 
                            type="date" 
                            className="proc-input" 
                            style={{ 
                              background: '#FFFFFF', 
                              border: '1.5px solid #CBD5E1', 
                              borderRadius: '10px',
                              padding: '9px 12px',
                              fontSize: '13px',
                              fontWeight: 700,
                              color: '#0F172A'
                            }} 
                            value={poScreenOrderDate} 
                            onChange={e => setPoScreenOrderDate(e.target.value)} 
                          />
                        </div>

                        {/* 3. Expected Delivery */}
                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                            Expected Delivery
                          </label>
                          <input 
                            type="date" 
                            className="proc-input" 
                            style={{ 
                              background: '#FFFFFF', 
                              border: '1.5px solid #CBD5E1', 
                              borderRadius: '10px',
                              padding: '9px 12px',
                              fontSize: '13px',
                              fontWeight: 700,
                              color: '#0F172A'
                            }} 
                            value={poScreenExpectedDelivery} 
                            onChange={e => setPoScreenExpectedDelivery(e.target.value)} 
                          />
                        </div>

                        {/* 4. Default Vendor */}
                        <div>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                            <span>Default Vendor</span>
                            <span style={{ fontSize: '9.5px', color: '#64748B', fontWeight: 600 }}>OPTIONAL</span>
                          </label>
                          <select 
                            className="proc-select" 
                            style={{ 
                              background: '#FFFFFF', 
                              border: '1.5px solid #CBD5E1', 
                              borderRadius: '10px',
                              padding: '9px 12px',
                              fontSize: '13px',
                              fontWeight: 700,
                              color: '#0F172A',
                              width: '100%'
                            }} 
                            value={poScreenDefaultVendor} 
                            onChange={e => {
                              const val = e.target.value;
                              setPoScreenDefaultVendor(val);
                              if (val) {
                                const updated = poScreenItems.map(item => {
                                  const vObj = vendors.find(v => v._id === val);
                                  const medInVendor = vObj?.medicines?.find(m => m.sku === item.sku);
                                  return {
                                    ...item,
                                    vendorId: val,
                                    price: item.sku ? (medInVendor ? medInVendor.price : (item.price || 40)) : 0,
                                    tax: item.sku ? (medInVendor && medInVendor.gst !== undefined ? medInVendor.gst : 12) : 12
                                  };
                                });
                                setPoScreenItems(updated);
                              }
                            }}
                          >
                            <option value="">— Choose per line —</option>
                            {getDisplayVendors().map(v => (
                              <option key={v._id} value={v._id}>{v.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Order Items Table Card */}
                    <div style={{ 
                      background: '#FFFFFF', 
                      borderRadius: '18px', 
                      border: '1.5px solid #E2E8F0',
                      boxShadow: '0 8px 24px -4px rgba(15, 23, 42, 0.04)',
                      overflow: 'visible',
                      marginBottom: '24px'
                    }}>
                      {/* Section Top Bar */}
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '18px 24px', 
                        borderBottom: '1.5px solid #F1F5F9',
                        borderTopLeftRadius: '18px',
                        borderTopRightRadius: '18px',
                        background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)'
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif" }}>Order Items Matrix</span>
                            <span style={{ fontSize: '11px', fontWeight: 800, background: '#EFF6FF', color: '#1D4ED8', padding: '3px 9px', borderRadius: '12px', border: '1px solid #DBEAFE' }}>
                              {poScreenItems.filter(i => i.sku).length} Active Lines
                            </span>
                          </div>
                          <p style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, margin: '2px 0 0 0' }}>
                            Select medicines, assign best-rate suppliers, and customize quantities.
                          </p>
                        </div>

                        <button 
                          className="proc-btn proc-btn-primary" 
                          style={{ 
                            padding: '9px 18px', 
                            fontSize: '13px', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '7px', 
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.28)'
                          }} 
                          onClick={() => {
                            setPoScreenItems([...poScreenItems, { sku: '', qty: 100, vendorId: '', price: 0, discount: 0, tax: 12 }]);
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          <span>Add Item</span>
                        </button>
                      </div>

                      {/* Informational Callout Bar */}
                      <div style={{ 
                        background: '#EFF6FF', 
                        borderBottom: '1px solid #DBEAFE', 
                        padding: '10px 24px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        fontSize: '12px', 
                        color: '#1E40AF', 
                        fontWeight: 600 
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        <span><strong>Multi-Supplier Auto-Split:</strong> If medicines are ordered from different vendors, Curoxa will automatically bundle them into separate vendor sub-orders upon dispatch.</span>
                      </div>

                      {/* Modern Styled Slate/Blue Table Header */}
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '2.5fr 1fr 2fr 1fr 1fr 1fr 1.2fr 45px', 
                        gap: '12px', 
                        padding: '12px 24px', 
                        background: 'linear-gradient(135deg, #F1F5F9 0%, #EFF6FF 100%)', 
                        borderBottom: '1.5px solid #CBD5E1',
                        fontSize: '11px', 
                        fontWeight: 850, 
                        color: '#334155', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.05em'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>
                          <span>Product / Medicine</span>
                        </div>
                        <div>Qty</div>
                        <div>Vendor Mapping</div>
                        <div>Unit ₹</div>
                        <div>Disc %</div>
                        <div>Tax %</div>
                        <div style={{ textAlign: 'right' }}>Line Total</div>
                        <div></div>
                      </div>

                      {/* Rows Container */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 20px', background: '#F8FAFC', borderRadius: '0 0 18px 18px', overflow: 'visible' }}>
                        {poScreenItems.map((item, idx) => {
                          const selectedMed = medicines.find(m => m.sku === item.sku);
                          const selectedVendorObj = vendors.find(v => v._id === item.vendorId);
                          
                          const hasSku = !!item.sku;
                          const sub = hasSku ? (item.qty || 0) * (item.price || 0) : 0;
                          const discAmt = sub * ((item.discount || 0) / 100);
                          const taxAmt = (sub - discAmt) * ((item.tax || 12) / 100);
                          const lineTotal = sub - discAmt + taxAmt;

                          return (
                            <div 
                              key={idx} 
                              style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '2.5fr 1fr 2fr 1fr 1fr 1fr 1.2fr 45px', 
                                gap: '12px', 
                                alignItems: 'flex-start', 
                                padding: '14px 18px', 
                                background: '#FFFFFF', 
                                border: activePoItemFocus === idx ? '1.5px solid #2563EB' : '1.5px solid #E2E8F0',
                                borderRadius: '14px',
                                boxShadow: activePoItemFocus === idx ? '0 6px 18px rgba(37, 99, 235, 0.12)' : '0 2px 6px rgba(15, 23, 42, 0.02)',
                                position: 'relative', 
                                zIndex: activePoItemFocus === idx ? 99999 : 1,
                                overflow: 'visible',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {/* 1. Medicine Autocomplete Search */}
                              <div style={{ position: 'relative' }}>
                                {(() => {
                                  const catMap = new Map();
                                  (medicines || []).forEach(m => {
                                    if (m && m.name) catMap.set(m.name.trim().toLowerCase(), { name: m.name, sku: m.sku || '', stock: m.stock || 0, avgMonthlyUse: m.avgMonthlyUse || 1200 });
                                  });
                                  (vendors || []).filter(v => v.status === 'Active' || !v.status).forEach(v => {
                                    (v.medicines || []).forEach(vm => {
                                      if (vm && vm.name) {
                                        const k = vm.name.trim().toLowerCase();
                                        if (!catMap.has(k)) {
                                          catMap.set(k, { name: vm.name, sku: vm.sku || '', stock: 0, avgMonthlyUse: 1200 });
                                        }
                                      }
                                    });
                                  });
                                  const allCatalog = Array.from(catMap.values());

                                  const selectMedItem = (m) => {
                                    const matchingVendors = vendors.filter(v => (v.status === 'Active' || !v.status) && v.medicines && v.medicines.some(med => (med.sku && med.sku === m.sku) || (med.name && med.name.toLowerCase() === m.name.toLowerCase())));
                                    let vId = '';
                                    let pr = 0;
                                    let tx = 12;
                                    let matchedSku = m.sku;
                                    if (matchingVendors.length > 0) {
                                      const cheapest = matchingVendors.reduce((min, current) => {
                                        const minPrice = min.medicines.find(med => (med.sku && med.sku === m.sku) || (med.name && med.name.toLowerCase() === m.name.toLowerCase()))?.price || Infinity;
                                        const currentPrice = current.medicines.find(med => (med.sku && med.sku === m.sku) || (med.name && med.name.toLowerCase() === m.name.toLowerCase()))?.price || Infinity;
                                        return currentPrice < minPrice ? current : min;
                                      }, matchingVendors[0]);
                                      vId = cheapest._id;
                                      const medInfo = cheapest.medicines.find(med => (med.sku && med.sku === m.sku) || (med.name && med.name.toLowerCase() === m.name.toLowerCase()));
                                      pr = medInfo ? medInfo.price : 0;
                                      tx = medInfo && medInfo.gst !== undefined ? medInfo.gst : 12;
                                      matchedSku = medInfo?.sku || m.sku;
                                    }
                                    const updated = [...poScreenItems];
                                    updated[idx] = { ...updated[idx], name: m.name, sku: matchedSku, price: pr, tax: tx, vendorId: vId, tempName: undefined };
                                    setPoScreenItems(updated);
                                    setActivePoItemFocus(null);
                                  };

                                  const query = item.tempName !== undefined ? item.tempName.trim().toLowerCase() : '';
                                  const filteredMeds = query
                                    ? allCatalog.filter(m => (m.name && m.name.toLowerCase().includes(query)) || (m.sku && m.sku.toLowerCase().includes(query))).slice(0, 10)
                                    : allCatalog.slice(0, 10);

                                  return (
                                    <>
                                      <div style={{ position: 'relative' }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                                          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                        </svg>
                                        <input
                                          type="text"
                                          className="proc-input"
                                          style={{ 
                                            height: '40px', 
                                            borderRadius: '10px', 
                                            border: activePoItemFocus === idx ? '1.5px solid #2563EB' : '1.5px solid #CBD5E1', 
                                            fontWeight: 700, 
                                            fontSize: '13px', 
                                            width: '100%', 
                                            paddingLeft: '32px',
                                            outline: 'none',
                                            background: '#FFFFFF'
                                          }}
                                          placeholder="Search medicine catalog..."
                                          value={item.tempName !== undefined ? item.tempName : (selectedMed ? selectedMed.name : '')}
                                          onChange={e => {
                                            const val = e.target.value;
                                            setActivePoItemFocus(idx);
                                            const updated = [...poScreenItems];
                                            updated[idx] = { ...updated[idx], tempName: val };
                                            if (!val.trim()) {
                                              updated[idx] = { ...updated[idx], sku: '', price: 0, tax: 12, vendorId: '', tempName: '' };
                                            }
                                            setPoScreenItems(updated);
                                          }}
                                          onClick={() => setActivePoItemFocus(idx)}
                                          onFocus={e => {
                                            setActivePoItemFocus(idx);
                                            e.target.select();
                                          }}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              if (filteredMeds.length > 0) {
                                                selectMedItem(filteredMeds[0]);
                                              }
                                            } else if (e.key === 'Escape') {
                                              setActivePoItemFocus(null);
                                            }
                                          }}
                                          onBlur={() => {
                                            setTimeout(() => {
                                              setActivePoItemFocus(null);
                                              setPoScreenItems(prev => {
                                                const updated = [...prev];
                                                if (updated[idx] && updated[idx].sku) {
                                                  updated[idx].tempName = undefined;
                                                }
                                                return updated;
                                              });
                                            }, 250);
                                          }}
                                        />
                                      </div>

                                      {activePoItemFocus === idx && (
                                        <div
                                          data-lenis-prevent
                                          onMouseDown={(e) => e.preventDefault()}
                                          style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 4px)',
                                            left: 0,
                                            right: 0,
                                            backgroundColor: '#ffffff',
                                            border: '1.5px solid #2563EB',
                                            borderRadius: '12px',
                                            boxShadow: '0 15px 35px -5px rgba(15, 23, 42, 0.25)',
                                            zIndex: 999999,
                                            maxHeight: '230px',
                                            overflowY: 'auto',
                                            padding: '6px'
                                          }}
                                        >
                                          {filteredMeds.length > 0 ? (
                                            filteredMeds.map(m => (
                                              <div
                                                key={m.sku || m.name}
                                                onMouseDown={(e) => {
                                                  e.preventDefault();
                                                  selectMedItem(m);
                                                }}
                                                style={{
                                                  padding: '9px 12px',
                                                  fontSize: '12.5px',
                                                  fontWeight: 750,
                                                  color: '#1E293B',
                                                  cursor: 'pointer',
                                                  borderRadius: '8px',
                                                  marginBottom: '2px',
                                                  display: 'flex',
                                                  justifyContent: 'space-between',
                                                  alignItems: 'center',
                                                  transition: 'background 0.15s ease'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                                              >
                                                <span>{m.name}</span>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                  <span style={{ fontSize: '10.5px', color: '#16A34A', background: '#F0FDF4', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>Stock: {m.stock || 0}</span>
                                                  <span style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>{m.sku}</span>
                                                </div>
                                              </div>
                                            ))
                                          ) : (
                                            <div style={{ padding: '12px', fontSize: '12px', color: '#94A3B8', textAlign: 'center', fontStyle: 'italic' }}>
                                              No matching catalog items
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', fontWeight: 600, display: 'flex', gap: '10px' }}>
                                  <span>Stock: <strong style={{ color: '#0F172A' }}>{selectedMed?.stock || 0}</strong></span>
                                  <span>Avg/mo: <strong style={{ color: '#0F172A' }}>{selectedMed?.avgMonthlyUse || 1200}</strong></span>
                                </div>
                              </div>

                              {/* 2. Qty Input */}
                              <div>
                                <input 
                                  type="number" 
                                  className="proc-input" 
                                  style={{ 
                                    height: '40px', 
                                    borderRadius: '10px', 
                                    border: '1.5px solid #CBD5E1', 
                                    fontWeight: 800, 
                                    fontSize: '14px', 
                                    textAlign: 'center',
                                    background: '#F8FAFC',
                                    color: '#0F172A'
                                  }} 
                                  value={item.qty} 
                                  onChange={e => {
                                    const updated = [...poScreenItems];
                                    updated[idx].qty = Number(e.target.value) || 0;
                                    setPoScreenItems(updated);
                                  }} 
                                />
                              </div>

                              {/* 3. Vendor Selector */}
                              <div>
                                {item.sku ? (() => {
                                  const medName = item.name || selectedMed?.name || '';
                                  const medSku = item.sku || selectedMed?.sku || '';
                                  const candidateVendors = (vendors || []).filter(v => 
                                    (v.status === 'Active' || !v.status) &&
                                    v.medicines && 
                                    v.medicines.some(med => (medSku && med.sku && med.sku.toLowerCase() === medSku.toLowerCase()) || (medName && med.name && med.name.toLowerCase() === medName.toLowerCase()))
                                  );
                                  return (
                                    <select
                                      className="proc-select"
                                      style={{ 
                                        height: '40px', 
                                        borderRadius: '10px', 
                                        border: '1.5px solid #CBD5E1', 
                                        fontWeight: 750, 
                                        fontSize: '12px', 
                                        background: '#FFFFFF', 
                                        padding: '0 8px', 
                                        width: '100%', 
                                        outline: 'none',
                                        color: item.vendorId ? '#0F172A' : '#64748B'
                                      }}
                                      value={item.vendorId || ''}
                                      onChange={e => {
                                        const val = e.target.value;
                                        const updated = [...poScreenItems];
                                        if (val) {
                                          const vObj = vendors.find(v => v._id === val);
                                          const medInfo = vObj?.medicines?.find(med => (medSku && med.sku && med.sku.toLowerCase() === medSku.toLowerCase()) || (medName && med.name && med.name.toLowerCase() === medName.toLowerCase()));
                                          updated[idx] = {
                                            ...updated[idx],
                                            vendorId: val,
                                            vendorName: vObj ? vObj.name : '',
                                            price: medInfo ? medInfo.price : updated[idx].price,
                                            tax: medInfo && medInfo.gst !== undefined ? medInfo.gst : (updated[idx].tax || 12)
                                          };
                                        } else {
                                          updated[idx] = {
                                            ...updated[idx],
                                            vendorId: '',
                                            vendorName: '',
                                            price: 0,
                                            tax: 12
                                          };
                                        }
                                        setPoScreenItems(updated);
                                      }}
                                    >
                                      <option value="">— Select Vendor —</option>
                                      {candidateVendors.map(v => {
                                        const medInfo = v.medicines.find(med => (medSku && med.sku && med.sku.toLowerCase() === medSku.toLowerCase()) || (medName && med.name && med.name.toLowerCase() === medName.toLowerCase()));
                                        return (
                                          <option key={v._id} value={v._id}>
                                            {v.name} (₹{medInfo ? medInfo.price : '--'})
                                          </option>
                                        );
                                      })}
                                    </select>
                                  );
                                })() : (
                                  <select
                                    className="proc-select"
                                    style={{ height: '40px', borderRadius: '10px', border: '1.5px solid #E2E8F0', fontWeight: 600, fontSize: '12px', background: '#F8FAFC', color: '#94A3B8', padding: '0 8px', width: '100%', cursor: 'not-allowed' }}
                                    disabled
                                  >
                                    <option>— Select medicine first —</option>
                                  </select>
                                )}
                              </div>

                              {/* 4. Unit Price */}
                              <div>
                                <input 
                                  type="number" 
                                  className="proc-input" 
                                  style={{ 
                                    height: '40px', 
                                    borderRadius: '10px', 
                                    border: '1.5px solid #CBD5E1', 
                                    background: '#F1F5F9', 
                                    color: '#1E293B', 
                                    fontWeight: 800, 
                                    fontSize: '13.5px', 
                                    textAlign: 'center', 
                                    cursor: 'not-allowed' 
                                  }} 
                                  value={item.price} 
                                  readOnly 
                                />
                              </div>

                              {/* 5. Discount */}
                              <div>
                                <input 
                                  type="number" 
                                  className="proc-input" 
                                  style={{ height: '40px', borderRadius: '10px', border: '1.5px solid #CBD5E1', fontWeight: 700, fontSize: '13px', textAlign: 'center', background: '#FFFFFF' }} 
                                  value={item.discount} 
                                  onChange={e => {
                                    const updated = [...poScreenItems];
                                    updated[idx].discount = Number(e.target.value) || 0;
                                    setPoScreenItems(updated);
                                  }} 
                                />
                              </div>

                              {/* 6. Tax % */}
                              <div>
                                <input 
                                  type="number" 
                                  className="proc-input" 
                                  style={{ height: '40px', borderRadius: '10px', border: '1.5px solid #CBD5E1', fontWeight: 700, fontSize: '13px', textAlign: 'center', background: '#FFFFFF' }} 
                                  value={item.tax} 
                                  onChange={e => {
                                    const updated = [...poScreenItems];
                                    updated[idx].tax = Number(e.target.value) || 0;
                                    setPoScreenItems(updated);
                                  }} 
                                />
                              </div>

                              {/* 7. Line Total */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '40px' }}>
                                <span style={{ 
                                  fontSize: '14px', 
                                  fontWeight: 900, 
                                  color: '#0F172A', 
                                  background: '#F8FAFC', 
                                  padding: '5px 10px', 
                                  borderRadius: '8px', 
                                  border: '1px solid #E2E8F0',
                                  fontFamily: "'Outfit', monospace"
                                }}>
                                  ₹{Math.round(lineTotal).toLocaleString()}
                                </span>
                              </div>

                              {/* 8. Delete Line Button */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40px' }}>
                                <button 
                                  style={{ 
                                    background: 'transparent', 
                                    border: 'none', 
                                    cursor: 'pointer', 
                                    color: '#EF4444', 
                                    padding: '7px', 
                                    borderRadius: '8px', 
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'background 0.2s' 
                                  }} 
                                  onMouseEnter={e => e.currentTarget.style.background = '#FEE2E2'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                  onClick={() => {
                                    if (poScreenItems.length === 1) return;
                                    setPoScreenItems(poScreenItems.filter((_, i) => i !== idx));
                                  }}
                                  title="Remove line"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Notes & Summary Columns */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px', alignItems: 'start' }}>
                      {/* Left: Notes & Delivery Terms Card */}
                      <div style={{ 
                        background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)', 
                        border: '1.5px solid #E2E8F0', 
                        borderRadius: '18px', 
                        padding: '22px', 
                        boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.04)' 
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </div>
                            <span style={{ fontSize: '15px', fontWeight: 850, color: '#0F172A', fontFamily: "'Outfit', sans-serif" }}>Notes & Delivery Terms</span>
                          </div>
                          <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Printed on Purchase Order</span>
                        </div>

                        {/* Quick Presets */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                          {[
                            'Cold Chain (2°C - 8°C) Required',
                            'Standard Hospital Receiving Hours (9am - 4pm)',
                            'Verify Batch Expiry (> 18 months)',
                            'Net 30 Days Payment Terms'
                          ].map((preset, pIdx) => (
                            <button
                              key={pIdx}
                              type="button"
                              onClick={() => {
                                const current = poScreenNotes ? poScreenNotes.trim() + '\n' : '';
                                if (!current.includes(preset)) {
                                  setPoScreenNotes(current + '• ' + preset);
                                }
                              }}
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '4px 10px',
                                borderRadius: '16px',
                                border: '1px solid #DBEAFE',
                                background: '#EFF6FF',
                                color: '#1E40AF',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = '#DBEAFE'}
                              onMouseLeave={e => e.currentTarget.style.background = '#EFF6FF'}
                            >
                              + {preset}
                            </button>
                          ))}
                        </div>

                        <textarea 
                          className="proc-input" 
                          style={{ 
                            minHeight: '130px', 
                            resize: 'vertical', 
                            borderRadius: '12px', 
                            border: '1.5px solid #CBD5E1', 
                            padding: '12px 14px', 
                            fontSize: '13px', 
                            lineHeight: '1.5',
                            background: '#FFFFFF',
                            width: '100%',
                            boxSizing: 'border-box'
                          }}
                          placeholder="Delivery instructions, receiving dock requirements, packaging specifications..."
                          value={poScreenNotes}
                          onChange={e => setPoScreenNotes(e.target.value)}
                        />
                      </div>

                      {/* Right: Order Summary Deck */}
                      <div style={{ 
                        background: '#FFFFFF', 
                        border: '1.5px solid #DBEAFE', 
                        borderRadius: '18px', 
                        overflow: 'hidden', 
                        boxShadow: '0 10px 30px -4px rgba(37, 99, 235, 0.08)' 
                      }}>
                        {/* Summary Deck Top Gradient Banner */}
                        <div style={{ 
                          padding: '16px 20px', 
                          background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)', 
                          borderBottom: '1.5px solid #BFDBFE',
                          color: '#1E40AF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ 
                              width: '28px', 
                              height: '28px', 
                              borderRadius: '8px', 
                              background: '#2563EB', 
                              color: '#FFFFFF', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)'
                            }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/>
                              </svg>
                            </div>
                            <span style={{ fontSize: '15.5px', fontWeight: 900, fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.01em', color: '#0F172A' }}>Order Summary</span>
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: 800, background: '#FFFFFF', color: '#2563EB', padding: '3px 9px', borderRadius: '10px', border: '1px solid #BFDBFE' }}>
                            {uniqueVendorsCount} {uniqueVendorsCount === 1 ? 'Supplier' : 'Suppliers'}
                          </span>
                        </div>
                        
                        <div style={{ padding: '20px' }}>
                          {/* Vendor Bills List */}
                          {Object.values(vendorBreakdown).length > 0 ? (
                            Object.values(vendorBreakdown).map((vData, vIdx) => (
                              <div key={vIdx} style={{ 
                                marginBottom: '14px', 
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '12px',
                                padding: '12px 14px'
                              }}>
                                <div style={{ fontSize: '11.5px', fontWeight: 900, color: '#1E40AF', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>Bill #{vIdx + 1}: {vData.name}</span>
                                  <span style={{ fontSize: '9.5px', background: '#DBEAFE', color: '#1E40AF', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>Draft PO</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>
                                  <span>Subtotal</span>
                                  <span style={{ fontWeight: 700, color: '#1E293B' }}>₹{Math.round(vData.subtotal).toLocaleString()}</span>
                                </div>
                                {vData.discount > 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#16A34A', marginBottom: '4px' }}>
                                    <span>Discount</span>
                                    <span style={{ fontWeight: 700 }}>- ₹{Math.round(vData.discount).toLocaleString()}</span>
                                  </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>
                                  <span>Tax / GST</span>
                                  <span style={{ fontWeight: 700, color: '#1E293B' }}>₹{Math.round(vData.tax).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 900, color: '#0F172A', borderTop: '1px solid #E2E8F0', paddingTop: '6px', marginTop: '6px' }}>
                                  <span>Supplier Net</span>
                                  <span style={{ color: '#2563EB' }}>₹{Math.round(vData.total).toLocaleString()}</span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div style={{ padding: '16px', textAlign: 'center', color: '#94A3B8', fontSize: '12px', fontStyle: 'italic' }}>
                              Add medicine lines to calculate supplier breakdown.
                            </div>
                          )}

                          {/* Grand Total Highlight Box */}
                          <div style={{ 
                            background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)', 
                            border: '1.5px solid #BFDBFE', 
                            borderRadius: '14px', 
                            padding: '16px 18px', 
                            marginTop: '16px',
                            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.08)'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#1E40AF', fontWeight: 750, marginBottom: '6px' }}>
                              <span>Generated Orders</span>
                              <span style={{ fontWeight: 900 }}>{uniqueVendorsCount} PO Documents</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <span style={{ fontSize: '13.5px', color: '#0F172A', fontWeight: 900 }}>Grand Combined Total</span>
                              <span style={{ fontSize: '24px', fontWeight: 900, color: '#1D4ED8', fontFamily: "'Outfit', monospace" }}>
                                ₹{Math.round(totalOverallAmount).toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons Deck */}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                            <button 
                              className="proc-btn proc-btn-secondary" 
                              style={{ flexGrow: 1, padding: '11px', fontSize: '12.5px', borderRadius: '10px', justifyContent: 'center' }} 
                              onClick={handleSaveDraftPO}
                              title="Save current lines to Drafts"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                              <span>Save Draft</span>
                            </button>
                            <button 
                              className="proc-btn proc-btn-secondary" 
                              style={{ padding: '11px 14px', borderRadius: '10px' }} 
                              onClick={() => window.print()}
                              title="Print Purchase Order Sheet"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                            </button>
                            <button 
                              className="proc-btn proc-btn-primary" 
                              style={{ 
                                flexGrow: 2, 
                                padding: '11px 16px', 
                                fontSize: '13px', 
                                borderRadius: '10px', 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '7px',
                                background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)'
                              }} 
                              onClick={handleSendPurchaseOrder}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                              <span>Send Purchase Order</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            )}

            {/* VIEW 4: GOODS RECEIPT */}
            {activeTab === 'grn' && (
              <div>
                <div className="proc-title-row">
                  <div>
                    <h1 className="proc-title">Goods Receipt Notes</h1>
                    <p className="proc-subtitle">Verify physical deliveries before inventory updates.</p>
                  </div>
                </div>

                {/* KPI CARDS ROW (MATCHING ADMIN PORTAL DESIGN LANGUAGE) */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '16px',
                  width: '100%',
                  marginBottom: '24px',
                  boxSizing: 'border-box'
                }}>
                  {/* Card 1: AWAITING VERIFICATION (Warm Amber / Orange Theme) */}
                  <div 
                    style={{
                      padding: '18px 20px',
                      borderRadius: '16px',
                      border: '1px solid rgba(254, 215, 170, 0.95)',
                      boxShadow: '0 12px 28px rgba(245, 158, 11, 0.08)',
                      background: 'radial-gradient(circle at 0% 100%, rgba(245, 158, 11, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 50%, #FEF3C7 100%)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'all 0.2s ease'
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
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="13" x="1" y="3" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                      </div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#78350F', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        AWAITING VERIFICATION
                      </span>
                    </div>

                    <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                          {getDisplayPOs().filter(p => !p.isParent && p.vendorName !== 'Consolidated Multiple Suppliers' && !(p.vendorOrders && p.vendorOrders.length > 0) && ['Approved', 'Sent', 'Confirmed', 'Partially Delivered'].includes(p.status)).length}
                        </div>
                        <div style={{ fontSize: '12px', color: '#D97706', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                          Pending physical inspection
                        </div>
                      </div>

                      {/* Amber Mini Sparkline */}
                      <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="grnAmberGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22 L 64 32 L 0 32 Z" fill="url(#grnAmberGrad)" />
                          <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22" fill="none" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>

                    {/* Half Gradient Accent Line */}
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

                  {/* Card 2: GRNS THIS WEEK (Emerald / Mint Green Theme) */}
                  <div 
                    style={{
                      padding: '18px 20px',
                      borderRadius: '16px',
                      border: '1px solid rgba(167, 243, 208, 0.95)',
                      boxShadow: '0 12px 28px rgba(16, 185, 129, 0.08)',
                      background: 'radial-gradient(circle at 100% 0%, rgba(16, 185, 129, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 50%, #D1FAE5 100%)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'all 0.2s ease'
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
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                      </div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#064E3B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        GRNS THIS WEEK
                      </span>
                    </div>

                    <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                          {getGrnsThisWeek()}
                        </div>
                        <div style={{ fontSize: '12px', color: '#059669', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                          Stock successfully loaded
                        </div>
                      </div>

                      {/* Green Mini Sparkline */}
                      <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="grnGreenGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10B981" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#10B981" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10 L 64 32 L 0 32 Z" fill="url(#grnGreenGrad)" />
                          <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10" fill="none" stroke="#10B981" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>

                    {/* Half Gradient Accent Line */}
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

                  {/* Card 3: QUANTITY MISMATCHES (Rose / Red Theme) */}
                  <div 
                    style={{
                      padding: '18px 20px',
                      borderRadius: '16px',
                      border: '1px solid rgba(254, 202, 202, 0.95)',
                      boxShadow: '0 12px 28px rgba(239, 68, 68, 0.08)',
                      background: 'radial-gradient(circle at 100% 100%, rgba(239, 68, 68, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FEF2F2 50%, #FEE2E2 100%)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 4px 10px rgba(239, 68, 68, 0.25)'
                      }}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      </div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        QUANTITY MISMATCHES
                      </span>
                    </div>

                    <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                          {getQuantityMismatches()}
                        </div>
                        <div style={{ fontSize: '12px', color: '#DC2626', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                          {getQuantityMismatches() === 0 ? 'Zero variance detected' : 'Discrepancies flagged'}
                        </div>
                      </div>

                      {/* Red Mini Sparkline */}
                      <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="grnRedGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#EF4444" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 24 Q 14 20, 24 24 T 38 16 T 50 20 T 64 12 L 64 32 L 0 32 Z" fill="url(#grnRedGrad)" />
                          <path d="M 0 24 Q 14 20, 24 24 T 38 16 T 50 20 T 64 12" fill="none" stroke="#EF4444" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>

                    {/* Half Gradient Accent Line */}
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      height: '4px',
                      width: '60%',
                      borderBottomRightRadius: '16px',
                      background: 'linear-gradient(90deg, transparent 0%, #EF4444 100%)',
                      pointerEvents: 'none'
                    }} />
                  </div>

                  {/* Card 4: ACCEPTED (MONTH) (Electric Blue Theme) */}
                  <div 
                    style={{
                      padding: '18px 20px',
                      borderRadius: '16px',
                      border: '1px solid rgba(191, 219, 254, 0.95)',
                      boxShadow: '0 12px 28px rgba(37, 99, 235, 0.08)',
                      background: 'radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 50%, #DBEAFE 100%)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'all 0.2s ease'
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
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      </div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        ACCEPTED (MONTH)
                      </span>
                    </div>

                    <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                          {formatAcceptedTotal()}
                        </div>
                        <div style={{ fontSize: '12px', color: '#1D4ED8', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                          Total intake valuation
                        </div>
                      </div>

                      {/* Blue Mini Sparkline */}
                      <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="grnBlueGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#grnBlueGrad)" />
                          <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12" fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>

                    {/* Half Gradient Accent Line */}
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
                </div>

                {/* DELIVERIES AWAITING GRN */}
                <div className="proc-card" style={{ padding: '0 0 12px 0', overflow: 'hidden', marginBottom: '24px' }}>
                  <div style={{ padding: '16px 24px', borderBottom: '1.5px solid #F1F5F9' }}>
                    <span style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', display: 'block' }}>Deliveries Awaiting GRN</span>
                    <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 500, marginTop: '2px', display: 'block' }}>
                      Open a delivery to verify cartons, batches and expiry dates. Only individual supplier POs approved by Admin are received here.
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="proc-table">
                      <thead>
                        <tr>
                          <th>PO Number</th>
                          <th>Vendor</th>
                          <th>Expected</th>
                          <th>Items</th>
                          <th>Order Value</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right', paddingRight: '24px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const filteredPOs = getDisplayPOs()
                            .filter(p => !p.isParent && p.vendorName !== 'Consolidated Multiple Suppliers' && !(p.vendorOrders && p.vendorOrders.length > 0) && ['Approved', 'Sent', 'Confirmed', 'Partially Delivered'].includes(p.status))
                            .filter(po => {
                              if (!searchQuery) return true;
                              const q = searchQuery.toLowerCase();
                              return (po.poId || '').toLowerCase().includes(q) || (po.vendorName || '').toLowerCase().includes(q);
                            });

                          if (filteredPOs.length === 0) {
                            return (
                              <tr>
                                <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: '#64748B', fontWeight: 600 }}>
                                  {searchQuery ? `No awaiting deliveries matching "${searchQuery}".` : 'No purchase orders currently awaiting verification.'}
                                </td>
                              </tr>
                            );
                          }

                          return filteredPOs.map(po => {
                            const expectedDelivery = po.expectedDelivery 
                              ? new Date(po.expectedDelivery).toISOString().split('T')[0] 
                              : new Date(new Date(po.createdAt || Date.now()).getTime() + 3*24*60*60*1000).toISOString().split('T')[0];
                            
                            const itemsCount = po.items ? po.items.reduce((sum, item) => sum + (item.requiredQty || 0), 0) : 0;

                            return (
                              <tr key={po._id}>
                                <td>
                                  {po.parentPOId ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#2563EB', fontSize: '13px', background: '#F8FAFC', padding: '3px 7px', borderRadius: '6px', border: '1px solid #CBD5E1' }}>
                                        {po.poId}
                                      </span>
                                      <span style={{ fontSize: '9.5px', fontWeight: 800, background: '#F1F5F9', color: '#475569', padding: '1px 5px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                                        Sub-PO
                                      </span>
                                    </div>
                                  ) : (
                                    <span style={{ fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>{po.poId}</span>
                                  )}
                                </td>
                                <td>
                                  <div>
                                    <div style={{ fontWeight: 700, color: '#0F172A' }}>{po.vendorName}</div>
                                    {po.parentPOId && (
                                      <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>Master: {po.parentPOId}</div>
                                    )}
                                  </div>
                                </td>
                                <td style={{ fontWeight: 500 }}>{expectedDelivery}</td>
                                <td style={{ fontWeight: 700 }}>{itemsCount}</td>
                                <td style={{ fontWeight: 800, color: '#0F172A' }}>₹{Number(po.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td>
                                  <span className={`proc-badge ${po.status.toLowerCase().replace(/ /g, '-')}`}>
                                    {po.status}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                                  <button 
                                    className="proc-btn proc-btn-primary" 
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '13px' }}
                                    onClick={() => {
                                      handleGrnPOSelection(po._id);
                                      setGrnFlowType('po');
                                      setShowGRNModal(true);
                                    }}
                                  >
                                    Open GRN <i data-lucide="arrow-right" style={{ width: '14px', height: '14px' }}></i>
                                  </button>
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* HISTORICAL GRNS */}
                <div className="proc-card" style={{ padding: '0 0 12px 0', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 24px', borderBottom: '1.5px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', display: 'block' }}>Filed Goods Receipt Notes (GRN)</span>
                      <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 500, marginTop: '2px', display: 'block' }}>
                        Historical record of stock loaded into pharmacy inventory.
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button 
                        type="button"
                        className="proc-btn proc-btn-secondary" 
                        style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#2563EB', borderColor: '#BFDBFE', background: '#EFF6FF', fontWeight: 700, cursor: 'pointer' }}
                        onClick={() => setShowGrnExportModal(true)}
                        title="Export filtered GRNs as Excel or PDF"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Export
                      </button>
                      <button className="proc-btn proc-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => {
                        setGrnFlowType('direct');
                        setGrnSelectedPOId('');
                        setGrnDirectVendorId(getDisplayVendors()[0]?._id || '');
                        setGrnItems([{ name: '', sku: '', qtyRequired: 0, qtyReceived: 10, price: 10 }]);
                        setGrnInvoiceFileName('');
                        setShowGRNModal(true);
                      }}>
                        <i data-lucide="plus" style={{ width: '12px', height: '12px' }}></i> Direct Purchase GRN
                      </button>
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="proc-table">
                      <thead>
                        <tr>
                          <th>GRN Number</th>
                          <th>PO Reference</th>
                          <th>Supplier</th>
                          <th>Date Received</th>
                          <th>Items Count</th>
                          <th>Invoice Ref</th>
                          <th style={{ textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const filteredGrns = (goodsReceipts || []).filter(grn => {
                            if (!searchQuery) return true;
                            const q = searchQuery.toLowerCase();
                            return (grn.grnId || '').toLowerCase().includes(q) || 
                                   (grn.poNumber || '').toLowerCase().includes(q) || 
                                   (grn.vendorName || '').toLowerCase().includes(q) ||
                                   (grn.invoiceNumber || '').toLowerCase().includes(q);
                          });

                          if (filteredGrns.length === 0) {
                            return (
                              <tr>
                                <td colSpan="7" style={{ textAlign: 'center', padding: '28px', color: '#64748B', fontWeight: 600 }}>
                                  {searchQuery ? `No goods receipt notes matching "${searchQuery}".` : 'No goods receipts filed yet. Verify deliveries above to load stock.'}
                                </td>
                              </tr>
                            );
                          }

                          return filteredGrns.map(grn => (
                            <tr key={grn._id}>
                              <td style={{ fontWeight: 800, color: '#0F172A' }}>{grn.grnId}</td>
                              <td style={{ fontWeight: 700, color: '#2563EB' }}>{grn.poNumber || 'Direct Purchase'}</td>
                              <td style={{ fontWeight: 700, color: '#475569' }}>{grn.vendorName}</td>
                              <td>{new Date(grn.receivedDate || grn.createdAt).toLocaleDateString()}</td>
                              <td style={{ fontWeight: 700 }}>{grn.items ? grn.items.length : 0} items</td>
                              <td>{grn.invoiceUrl || '--'}</td>
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                  <button className="proc-btn proc-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={() => setSelectedGrnDetails(grn)}>
                                    <i data-lucide="eye" style={{ width: '13px', height: '13px' }}></i> View
                                  </button>
                                  {(() => {
                                    const ageMs = Date.now() - new Date(grn.createdAt || grn.receivedDate || Date.now()).getTime();
                                    const isEditable = ageMs <= 24 * 60 * 60 * 1000;
                                    return isEditable ? (
                                      <button 
                                        className="proc-btn proc-btn-secondary" 
                                        style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#2563EB', borderColor: '#BFDBFE' }} 
                                        onClick={() => handleOpenEditGrn(grn)}
                                      >
                                        <i data-lucide="edit-2" style={{ width: '13px', height: '13px' }}></i> Edit
                                      </button>
                                    ) : null;
                                  })()}
                                  <button 
                                    className="proc-btn proc-btn-primary" 
                                    style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#059669' }}
                                    onClick={() => printGRN(grn, localStorage.getItem('tenantName') || 'CUROXA HEALTHCARE')}
                                    title="Print / Save GRN Document"
                                  >
                                    📄 PDF
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 5: VENDOR PAYMENTS */}
            {activeTab === 'payments' && (() => {
              const activeVendor = getDisplayVendors().find(v => v._id === selectedPaymentVendorId) || getDisplayVendors()[0];
              const vendorPOs = activeVendor ? getDisplayPOs().filter(po => po.vendorId === activeVendor._id) : [];

              const totalPurchases = vendorPOs.reduce((acc, po) => acc + po.totalAmount, 0);
              const totalPaid = vendorPOs.reduce((acc, po) => acc + (po.paidAmount || 0), 0);
              const totalOutstanding = vendorPOs.filter(p => p.status !== 'Draft').reduce((acc, po) => acc + (po.totalAmount - (po.paidAmount || 0)), 0);
              const creditBalance = 500000 - totalOutstanding;

              return (
                <div>
                  <div className="proc-title-row">
                    <div>
                      <h1 className="proc-title">Vendor Payments</h1>
                      <p className="proc-subtitle">
                        Payment history for {activeVendor ? activeVendor.name : 'Selected Vendor'}
                      </p>
                    </div>
                    <div>
                      <select 
                        className="proc-select" 
                        style={{ minWidth: '240px', background: '#FFF', fontWeight: 600 }}
                        value={selectedPaymentVendorId || (activeVendor ? activeVendor._id : '')}
                        onChange={e => setSelectedPaymentVendorId(e.target.value)}
                      >
                        {getDisplayVendors().map(v => (
                          <option key={v._id} value={v._id}>{v.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* KPI CARDS ROW (MATCHING ADMIN PORTAL DESIGN LANGUAGE) */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '16px',
                    width: '100%',
                    marginBottom: '24px',
                    boxSizing: 'border-box'
                  }}>
                    {/* Card 1: TOTAL PURCHASES (Electric Blue Theme) */}
                    <div 
                      style={{
                        padding: '18px 20px',
                        borderRadius: '16px',
                        border: '1px solid rgba(191, 219, 254, 0.95)',
                        boxShadow: '0 12px 28px rgba(37, 99, 235, 0.08)',
                        background: 'radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 50%, #DBEAFE 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'all 0.2s ease'
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
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                        </div>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          TOTAL PURCHASES
                        </span>
                      </div>

                      <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                            ₹{totalPurchases.toLocaleString()}
                          </div>
                          <div style={{ fontSize: '12px', color: '#1D4ED8', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                            Lifetime procurement volume
                          </div>
                        </div>

                        {/* Blue Mini Sparkline */}
                        <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                          <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                            <defs>
                              <linearGradient id="payBlueGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.45"/>
                                <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05"/>
                              </linearGradient>
                            </defs>
                            <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#payBlueGrad)" />
                            <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12" fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" />
                          </svg>
                        </div>
                      </div>

                      {/* Half Gradient Accent Line */}
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

                    {/* Card 2: OUTSTANDING (Warm Amber / Orange Theme) */}
                    <div 
                      style={{
                        padding: '18px 20px',
                        borderRadius: '16px',
                        border: '1px solid rgba(254, 215, 170, 0.95)',
                        boxShadow: '0 12px 28px rgba(245, 158, 11, 0.08)',
                        background: 'radial-gradient(circle at 0% 100%, rgba(245, 158, 11, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 50%, #FEF3C7 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'all 0.2s ease'
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
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
                        </div>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#78350F', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          OUTSTANDING
                        </span>
                      </div>

                      <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                            ₹{totalOutstanding.toLocaleString()}
                          </div>
                          <div style={{ fontSize: '12px', color: '#D97706', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                            Due to vendor
                          </div>
                        </div>

                        {/* Amber Mini Sparkline */}
                        <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                          <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                            <defs>
                              <linearGradient id="payAmberGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.45"/>
                                <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.05"/>
                              </linearGradient>
                            </defs>
                            <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22 L 64 32 L 0 32 Z" fill="url(#payAmberGrad)" />
                            <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22" fill="none" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
                          </svg>
                        </div>
                      </div>

                      {/* Half Gradient Accent Line */}
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

                    {/* Card 3: PAID AMOUNT (Emerald / Mint Green Theme) */}
                    <div 
                      style={{
                        padding: '18px 20px',
                        borderRadius: '16px',
                        border: '1px solid rgba(167, 243, 208, 0.95)',
                        boxShadow: '0 12px 28px rgba(16, 185, 129, 0.08)',
                        background: 'radial-gradient(circle at 100% 0%, rgba(16, 185, 129, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 50%, #D1FAE5 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'all 0.2s ease'
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
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        </div>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#064E3B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          PAID AMOUNT
                        </span>
                      </div>

                      <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                            ₹{totalPaid.toLocaleString()}
                          </div>
                          <div style={{ fontSize: '12px', color: '#059669', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                            Settled invoices
                          </div>
                        </div>

                        {/* Green Mini Sparkline */}
                        <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                          <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                            <defs>
                              <linearGradient id="payGreenGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10B981" stopOpacity="0.45"/>
                                <stop offset="100%" stopColor="#10B981" stopOpacity="0.05"/>
                              </linearGradient>
                            </defs>
                            <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10 L 64 32 L 0 32 Z" fill="url(#payGreenGrad)" />
                            <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10" fill="none" stroke="#10B981" strokeWidth="2.4" strokeLinecap="round" />
                          </svg>
                        </div>
                      </div>

                      {/* Half Gradient Accent Line */}
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

                    {/* Card 4: CREDIT BALANCE (Purple / Violet Theme) */}
                    <div 
                      style={{
                        padding: '18px 20px',
                        borderRadius: '16px',
                        border: '1px solid rgba(233, 213, 255, 0.95)',
                        boxShadow: '0 12px 28px rgba(139, 92, 246, 0.08)',
                        background: 'radial-gradient(circle at 0% 0%, rgba(139, 92, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 50%, #EDE9FE 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'all 0.2s ease'
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
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
                        </div>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#581C87', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          CREDIT BALANCE
                        </span>
                      </div>

                      <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                            ₹{creditBalance.toLocaleString()}
                          </div>
                          <div style={{ fontSize: '12px', color: '#7C3AED', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap' }}>
                            Limit ₹5,00,000
                          </div>
                        </div>

                        {/* Purple Mini Sparkline */}
                        <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
                          <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                            <defs>
                              <linearGradient id="payPurpleGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.45"/>
                                <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.05"/>
                              </linearGradient>
                            </defs>
                            <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#payPurpleGrad)" />
                            <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12" fill="none" stroke="#8B5CF6" strokeWidth="2.4" strokeLinecap="round" />
                          </svg>
                        </div>
                      </div>

                      {/* Half Gradient Accent Line */}
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
                  </div>

                  <div className="proc-card" style={{ padding: '0 0 12px 0', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 24px', borderBottom: '1.5px solid #F1F5F9' }}>
                      <span style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>Invoice History</span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="proc-table">
                        <thead>
                          <tr>
                            <th>Invoice #</th>
                            <th>Purchase Order</th>
                            <th>Invoice Date</th>
                            <th>Amount</th>
                            <th>Paid</th>
                            <th>Outstanding</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right', paddingRight: '24px' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vendorPOs.length > 0 ? (
                            vendorPOs.map(po => {
                              const orderDate = new Date(po.createdAt || Date.now()).toISOString().split('T')[0];
                              const outstanding = po.totalAmount - (po.paidAmount || 0);
                              
                              let statusLabel = 'Pending';
                              let statusClass = 'draft';
                              if (po.paidAmount >= po.totalAmount) {
                                statusLabel = 'Paid';
                                statusClass = 'completed';
                              } else if (po.paidAmount > 0) {
                                statusLabel = 'Partially Paid';
                                statusClass = 'confirmed';
                              } else {
                                statusLabel = 'Pending';
                                statusClass = 'partially-delivered'; // matches orange/brown
                              }

                              return (
                                <tr key={`pay-${po._id}`}>
                                  <td style={{ fontWeight: 800, color: '#0F172A' }}>INV-A-{po.poId.slice(-4)}</td>
                                  <td style={{ fontWeight: 700, color: '#2563EB' }}>{po.poId}</td>
                                  <td style={{ fontWeight: 500 }}>{orderDate}</td>
                                  <td style={{ fontWeight: 800, color: '#0F172A' }}>₹{po.totalAmount.toLocaleString()}</td>
                                  <td style={{ color: po.paidAmount > 0 ? '#16A34A' : '#64748B', fontWeight: 700 }}>
                                    ₹{po.paidAmount ? po.paidAmount.toLocaleString() : '0'}
                                  </td>
                                  <td style={{ fontWeight: 700, color: '#0F172A' }}>
                                    {outstanding === 0 ? '—' : `₹${outstanding.toLocaleString()}`}
                                  </td>
                                  <td>
                                    <span className={`proc-badge ${statusClass}`}>
                                      {statusLabel}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                                    <div style={{ display: 'inline-flex', gap: '8px', justifyContent: 'flex-end' }}>
                                      <button 
                                        className="proc-btn proc-btn-secondary" 
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', fontSize: '12px' }}
                                        onClick={() => setSelectedInvoiceDetails(po)}
                                      >
                                        <i data-lucide="eye" style={{ width: '13px', height: '13px' }}></i> Invoice
                                      </button>
                                      <button 
                                        type="button"
                                        className="proc-btn proc-btn-secondary" 
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', fontSize: '12px' }}
                                        onClick={() => {
                                          setTargetVendorForMedicine(activeVendor);
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
                                        <i data-lucide="plus" style={{ width: '13px', height: '13px' }}></i> Add Med
                                      </button>
                                      {outstanding > 0 && (
                                        <button 
                                          className="proc-btn proc-btn-primary" 
                                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', fontSize: '12px' }}
                                          onClick={() => {
                                            setPaymentPOId(po.poId);
                                            setPaymentAmount(String(outstanding));
                                            setShowPaymentModal(true);
                                          }}
                                        >
                                          <i data-lucide="credit-card" style={{ width: '13px', height: '13px' }}></i> Record Payment
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: '#64748B', fontWeight: 600 }}>
                                No purchase orders or invoice history found for this vendor.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* TAB: CATALOG APPROVALS */}
            {activeTab === 'catalog-approvals' && (
              <div>
                <div className="proc-title-row" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h1 className="proc-page-title" style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Catalog Medicine Approvals</h1>
                    <p className="proc-page-subtitle" style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
                      Real-time tracker for vendor medicine additions and price update authorizations submitted to Admin.
                    </p>
                  </div>
                  <button 
                    className="proc-btn proc-btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 18px', borderRadius: '10px', fontWeight: 800 }}
                    onClick={() => {
                      if (getDisplayVendors().length > 0) {
                        setTargetVendorForMedicine(getDisplayVendors()[0]);
                        setNewMedApprovalData({ name: '', sku: '', price: '', gst: 12, available: true, mrp: '', comment: '' });
                        setShowAddMedicineApprovalModal(true);
                      } else {
                        showToast("Please add at least one vendor first.", "info");
                      }
                    }}
                  >
                    <i data-lucide="plus"></i> Propose New Medicine
                  </button>
                </div>

                {/* Summary Metrics (MATCHING ADMIN PORTAL DESIGN LANGUAGE) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  {/* Card 1: Total Submissions (Electric Blue Theme) */}
                  <div style={{
                    padding: '18px 20px',
                    borderRadius: '16px',
                    border: '1px solid rgba(191, 219, 254, 0.95)',
                    boxShadow: '0 12px 28px rgba(37, 99, 235, 0.08)',
                    background: 'radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 50%, #DBEAFE 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '9px',
                        background: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)'
                      }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      </div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        TOTAL SUBMISSIONS
                      </span>
                    </div>
                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                          {catalogApprovals.length}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#1D4ED8', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap' }}>
                          All change requests
                        </div>
                      </div>
                      <div style={{ width: '56px', height: '28px', position: 'relative', flexShrink: 0 }}>
                        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="catBlueGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#catBlueGrad)" />
                          <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12" fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
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

                  {/* Card 2: Pending Admin Review (Warm Amber / Orange Theme) */}
                  <div style={{
                    padding: '18px 20px',
                    borderRadius: '16px',
                    border: '1px solid rgba(254, 215, 170, 0.95)',
                    boxShadow: '0 12px 28px rgba(245, 158, 11, 0.08)',
                    background: 'radial-gradient(circle at 0% 100%, rgba(245, 158, 11, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 50%, #FEF3C7 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '9px',
                        background: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 4px 10px rgba(245, 158, 11, 0.25)'
                      }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      </div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#78350F', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        PENDING ADMIN REVIEW
                      </span>
                    </div>
                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                          {catalogApprovals.filter(a => (a.status || '').toLowerCase() === 'pending').length}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#D97706', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap' }}>
                          Awaiting authorization
                        </div>
                      </div>
                      <div style={{ width: '56px', height: '28px', position: 'relative', flexShrink: 0 }}>
                        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="catAmberGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22 L 64 32 L 0 32 Z" fill="url(#catAmberGrad)" />
                          <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22" fill="none" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
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

                  {/* Card 3: Approved & Active (Emerald / Mint Green Theme) */}
                  <div style={{
                    padding: '18px 20px',
                    borderRadius: '16px',
                    border: '1px solid rgba(167, 243, 208, 0.95)',
                    boxShadow: '0 12px 28px rgba(16, 185, 129, 0.08)',
                    background: 'radial-gradient(circle at 100% 0%, rgba(16, 185, 129, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 50%, #D1FAE5 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '9px',
                        background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 4px 10px rgba(16, 185, 129, 0.25)'
                      }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      </div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#064E3B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        APPROVED & ACTIVE
                      </span>
                    </div>
                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                          {catalogApprovals.filter(a => (a.status || '').toLowerCase() === 'approved').length}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap' }}>
                          Live in vendor catalogs
                        </div>
                      </div>
                      <div style={{ width: '56px', height: '28px', position: 'relative', flexShrink: 0 }}>
                        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="catGreenGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10B981" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#10B981" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10 L 64 32 L 0 32 Z" fill="url(#catGreenGrad)" />
                          <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10" fill="none" stroke="#10B981" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
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

                  {/* Card 4: Rejected Requests (Rose / Red Theme) */}
                  <div style={{
                    padding: '18px 20px',
                    borderRadius: '16px',
                    border: '1px solid rgba(254, 202, 202, 0.95)',
                    boxShadow: '0 12px 28px rgba(239, 68, 68, 0.08)',
                    background: 'radial-gradient(circle at 100% 100%, rgba(239, 68, 68, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FEF2F2 50%, #FEE2E2 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '9px',
                        background: 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 4px 10px rgba(239, 68, 68, 0.25)'
                      }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                      </div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        REJECTED REQUESTS
                      </span>
                    </div>
                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                          {catalogApprovals.filter(a => (a.status || '').toLowerCase() === 'denied' || (a.status || '').toLowerCase() === 'rejected').length}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#DC2626', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap' }}>
                          Declined by Admin
                        </div>
                      </div>
                      <div style={{ width: '56px', height: '28px', position: 'relative', flexShrink: 0 }}>
                        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="catRedGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#EF4444" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 24 Q 14 20, 24 24 T 38 16 T 50 20 T 64 12 L 64 32 L 0 32 Z" fill="url(#catRedGrad)" />
                          <path d="M 0 24 Q 14 20, 24 24 T 38 16 T 50 20 T 64 12" fill="none" stroke="#EF4444" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      height: '4px',
                      width: '60%',
                      borderBottomRightRadius: '16px',
                      background: 'linear-gradient(90deg, transparent 0%, #EF4444 100%)',
                      pointerEvents: 'none'
                    }} />
                  </div>
                </div>

                {/* Table */}
                <div className="proc-card" style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: 0, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="proc-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0' }}>
                          <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Medicine / SKU</th>
                          <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Target Vendor</th>
                          <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Rate (₹)</th>
                          <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>GST</th>
                          <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Requested On</th>
                          <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Status</th>
                          <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Admin Comments / Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catalogApprovals.length > 0 ? (
                          catalogApprovals.map(req => {
                            const med = req.details?.medicine || req.details || {};
                            const vendorName = req.details?.vendorName || (getDisplayVendors().find(v => v._id === req.details?.vendorId)?.name) || 'Vendor';
                            const vendorCode = req.details?.vendorCode || (getDisplayVendors().find(v => v._id === req.details?.vendorId)?.code) || '';
                            const isPending = (req.status || '').toLowerCase() === 'pending';
                            const isApproved = (req.status || '').toLowerCase() === 'approved';
                            const isRejected = (req.status || '').toLowerCase() === 'denied' || (req.status || '').toLowerCase() === 'rejected';

                            return (
                              <tr key={req._id} style={{ borderBottom: '1px solid #F1F5F9' }}>
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
                                <td style={{ padding: '14px 18px', color: '#64748B', fontSize: '12.5px' }}>
                                  {req.createdAt ? new Date(req.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'}
                                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>by {req.requesterName || 'Procurement'}</div>
                                </td>
                                <td style={{ padding: '14px 18px' }}>
                                  {isPending && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 11px', borderRadius: '20px', fontSize: '12px', fontWeight: 800, background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }}>
                                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F59E0B' }}></span>
                                      Pending Approval
                                    </span>
                                  )}
                                  {isApproved && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 11px', borderRadius: '20px', fontSize: '12px', fontWeight: 800, background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>
                                      <i data-lucide="check" style={{ width: '12px', height: '12px' }}></i> Approved
                                    </span>
                                  )}
                                  {isRejected && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 11px', borderRadius: '20px', fontSize: '12px', fontWeight: 800, background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
                                      <i data-lucide="x" style={{ width: '12px', height: '12px' }}></i> Rejected
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: '14px 18px', fontSize: '12.5px', color: '#475569' }}>
                                  {req.rejectionReason ? (
                                    <span style={{ color: '#DC2626', fontWeight: 700 }}>Reason: {req.rejectionReason}</span>
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
                              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>Propose medicines from Vendors to track approval workflow here.</div>
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
        </main>
      </div>


      {/* MODAL 2: CREATE PURCHASE ORDER */}
      {showCreatePOModal && (
        <div className="proc-modal-overlay">
          <form className="proc-modal" style={{ maxWidth: '750px' }} onSubmit={handleCreatePO}>
            <div className="proc-modal-header">
              <span className="proc-modal-title">New Purchase Order</span>
              <button type="button" className="proc-close-btn" onClick={() => setShowCreatePOModal(false)}>
                <i data-lucide="x"></i>
              </button>
            </div>
            <div className="proc-modal-body">
              <div className="proc-form-grid">
                <div className="proc-form-group">
                  <label className="proc-form-label">Target Vendor *</label>
                  <select required className="proc-select" value={selectedVendorForPO} onChange={e => setSelectedVendorForPO(e.target.value)}>
                    <option value="">-- Choose Vendor --</option>
                    {getDisplayVendors().map(v => (
                      <option key={v._id} value={v._id}>{v.name} ({v.code})</option>
                    ))}
                  </select>
                </div>

                <div className="proc-form-group">
                  <label className="proc-form-label">Expected Delivery Date *</label>
                  <input 
                    type="date" 
                    required 
                    className="proc-input" 
                    value={poExpectedDelivery} 
                    onChange={e => setPoExpectedDelivery(e.target.value)} 
                  />
                </div>

                <div className="proc-form-group proc-form-full">
                  <label className="proc-form-label">Status *</label>
                  <select 
                    required 
                    className="proc-select" 
                    value={poInitialStatus} 
                    onChange={e => setPoInitialStatus(e.target.value)}
                  >
                    <option value="Draft">Draft</option>
                    <option value="Sent">Sent</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Partially Delivered">Partially Delivered</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '20px' }}>
                <span className="proc-form-label">Items list</span>
                <table className="proc-items-table">
                  <thead>
                    <tr>
                      <th style={{ width: '45%' }}>Medicine Name</th>
                      <th style={{ width: '15%' }}>Quantity</th>
                      <th style={{ width: '20%' }}>Unit Price (₹)</th>
                      <th style={{ width: '15%', textAlign: 'right' }}>Total (₹)</th>
                      <th style={{ width: '5%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {poDraftItems.map((item, idx) => (
                      <tr key={`item-${idx}`}>
                        <td>
                          <input type="text" required className="proc-input" placeholder="e.g. Paracetamol"
                            value={item.name} onChange={e => {
                              const updated = [...poDraftItems];
                              updated[idx].name = e.target.value;
                              setPoDraftItems(updated);
                            }} />
                        </td>
                        <td>
                          <input type="number" required min="1" className="proc-input"
                            value={item.qty} onChange={e => {
                              const updated = [...poDraftItems];
                              updated[idx].qty = Number(e.target.value);
                              setPoDraftItems(updated);
                            }} />
                        </td>
                        <td>
                          <input type="number" required min="0" step="0.01" className="proc-input"
                            value={item.price} onChange={e => {
                              const updated = [...poDraftItems];
                              updated[idx].price = Number(e.target.value);
                              setPoDraftItems(updated);
                            }} />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, paddingRight: '8px' }}>
                          ₹{(Number(item.qty || 0) * Number(item.price || 0)).toLocaleString()}
                        </td>
                        <td>
                          {poDraftItems.length > 1 && (
                            <button type="button" className="proc-close-btn" style={{ color: '#EF4444' }} onClick={() => handleRemoveRow(idx)}>
                              <i data-lucide="trash-2"></i>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <button type="button" className="proc-btn proc-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={handleAddRow}>
                  <i data-lucide="plus" style={{ width: '14px' }}></i> Add Row
                </button>
              </div>
            </div>
            <div className="proc-modal-footer">
              <div style={{ marginRight: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>ESTIMATED TOTAL</span>
                <span style={{ fontSize: '18px', fontWeight: 900, color: '#10B981' }}>
                  ₹{poDraftItems.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.price || 0)), 0).toLocaleString()}
                </span>
              </div>
              <button type="button" className="proc-btn proc-btn-secondary" onClick={() => setShowCreatePOModal(false)}>Cancel</button>
              <button type="submit" className="proc-btn proc-btn-primary">Send Purchase Order</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: GENERATE GRN */}
      {showGRNModal && (
        <div className="proc-modal-overlay">
          <form className="proc-modal" style={{ maxWidth: '1000px', width: '95%' }} onSubmit={handleSaveGRN}>
            <div className="proc-modal-header">
              <span className="proc-modal-title">Goods Receipt Note (GRN) Generation</span>
              <button type="button" className="proc-close-btn" onClick={() => setShowGRNModal(false)}>
                <i data-lucide="x"></i>
              </button>
            </div>
            <div className="proc-modal-body">
              <div className="proc-form-group">
                <label className="proc-form-label">GRN Flow Type</label>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 600 }}>
                    <input type="radio" name="grnFlow" checked={grnFlowType === 'po'} onChange={() => setGrnFlowType('po')} />
                    Receive against Approved PO
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 600 }}>
                    <input type="radio" name="grnFlow" checked={grnFlowType === 'direct'} onChange={() => setGrnFlowType('direct')} />
                    Direct Purchase (No PO)
                  </label>
                </div>
              </div>

              {grnFlowType === 'po' ? (
                <div className="proc-form-group">
                  <label className="proc-form-label">Reference Approved PO *</label>
                  <select required className="proc-select" value={grnSelectedPOId} onChange={e => handleGrnPOSelection(e.target.value)}>
                    <option value="">-- Choose Purchase Order --</option>
                    {getDisplayPOs().filter(po => ['Approved', 'Sent', 'Confirmed', 'Partially Delivered'].includes(po.status)).map(po => (
                      <option key={po._id} value={po._id}>{po.poId} ({po.vendorName})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="proc-form-group">
                  <label className="proc-form-label">Supplier *</label>
                  <select required className="proc-select" value={grnDirectVendorId} onChange={e => {
                    setGrnDirectVendorId(e.target.value);
                    setGrnItems([{ name: 'Paracetamol 650mg', sku: 'PAR-650', qtyRequired: 0, qtyReceived: 100, price: 10, gst: 12, batchNumber: '', expiryDate: '', mfgDate: '' }]);
                  }}>
                    <option value="">-- Choose Vendor --</option>
                    {getDisplayVendors().map(v => (
                      <option key={v._id} value={v._id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {grnItems.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <span className="proc-form-label">Verify Received Stock Quantities & Tax Rates</span>
                  <table className="proc-items-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Ordered Qty</th>
                        <th>Received Qty</th>
                        <th>Batch No.</th>
                        <th>Mfg Date</th>
                        <th>Expiry Date</th>
                        <th>Price (₹)</th>
                        <th>GST (%)</th>
                        <th>GST Amt</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grnItems.map((item, idx) => {
                        const qty = item.qtyReceived || 0;
                        const price = item.price || 0;
                        const gstRate = item.gst !== undefined ? item.gst : 12;
                        const gstAmt = qty * price * (gstRate / 100);
                        const totalAmt = qty * price + gstAmt;

                        return (
                          <tr key={`grn-${idx}`}>
                            <td style={{ fontWeight: 700 }}>{item.name}</td>
                            <td>{item.qtyRequired || 'Direct'}</td>
                            <td>
                              <input type="number" required min="1" className="proc-input" style={{ padding: '6px', width: '70px' }}
                                value={qty} onChange={e => {
                                  let val = Number(e.target.value);
                                  if (grnFlowType === 'po' && val > (item.qtyRequired || 0)) {
                                    showToast(`Received quantity cannot exceed ordered quantity (${item.qtyRequired})!`, 'error');
                                    val = item.qtyRequired;
                                  }
                                  const updated = [...grnItems];
                                  updated[idx].qtyReceived = val;
                                  setGrnItems(updated);
                                }} />
                            </td>
                            <td>
                              <input type="text" required placeholder="Batch" className="proc-input" style={{ padding: '6px', width: '80px' }}
                                value={item.batchNumber || ''} onChange={e => {
                                  const updated = [...grnItems];
                                  updated[idx].batchNumber = e.target.value;
                                  setGrnItems(updated);
                                }} />
                            </td>
                            <td>
                              <input type="date" className="proc-input" style={{ padding: '6px', width: '115px', fontSize: '12px' }}
                                max={new Date().toISOString().split('T')[0]}
                                value={item.mfgDate || ''} onChange={e => {
                                  const today = new Date().toISOString().split('T')[0];
                                  if (e.target.value > today) {
                                    showToast('Manufacturing date cannot be in the future!', 'error');
                                    return;
                                  }
                                  const updated = [...grnItems];
                                  updated[idx].mfgDate = e.target.value;
                                  setGrnItems(updated);
                                }} />
                            </td>
                            <td>
                              <input type="date" required className="proc-input" style={{ padding: '6px', width: '115px', fontSize: '12px' }}
                                value={item.expiryDate || ''} onChange={e => {
                                  const updated = [...grnItems];
                                  updated[idx].expiryDate = e.target.value;
                                  setGrnItems(updated);
                                }} />
                            </td>
                            <td>
                              <input type="number" required min="0" step="0.01" className="proc-input" style={{ padding: '6px', width: '70px' }}
                                value={price} onChange={e => {
                                  const updated = [...grnItems];
                                  updated[idx].price = Number(e.target.value);
                                  setGrnItems(updated);
                                }} />
                            </td>
                            <td>
                              <input type="number" required min="0" max="100" className="proc-input" style={{ padding: '6px', width: '60px' }}
                                value={gstRate} onChange={e => {
                                  const updated = [...grnItems];
                                  updated[idx].gst = Number(e.target.value);
                                  setGrnItems(updated);
                                }} />
                            </td>
                            <td style={{ fontWeight: 600 }}>₹{gstAmt.toFixed(2)}</td>
                            <td style={{ fontWeight: 700 }}>₹{totalAmt.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {(() => {
                    const totals = grnItems.reduce((acc, item) => {
                      const qty = Number(item.qtyReceived) || 0;
                      const price = Number(item.price) || 0;
                      const gst = item.gst !== undefined ? item.gst : 12;
                      const sub = qty * price;
                      const gstAmt = sub * (gst / 100);
                      return {
                        subtotal: acc.subtotal + sub,
                        gstTotal: acc.gstTotal + gstAmt,
                        grandTotal: acc.grandTotal + sub + gstAmt
                      };
                    }, { subtotal: 0, gstTotal: 0, grandTotal: 0 });

                    return (
                      <div style={{ marginTop: '16px', padding: '12px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                          <span>Subtotal (Excl. GST)</span>
                          <span>₹{totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', fontWeight: 700, color: '#EA580C' }}>
                          <span>Total GST Burden</span>
                          <span>₹{totals.gstTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: '6px', fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                          <span>Total Amount (Incl. GST)</span>
                          <span>₹{totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="proc-form-group">
                <label className="proc-form-label">Supplier Invoice Reference Number *</label>
                <input type="text" required className="proc-input" placeholder="e.g. INV-99120"
                  value={grnInvoiceFileName} onChange={e => setGrnInvoiceFileName(e.target.value)} />
              </div>
            </div>
            <div className="proc-modal-footer">
              <button type="button" className="proc-btn proc-btn-secondary" onClick={() => setShowGRNModal(false)}>Cancel</button>
              <button type="submit" className="proc-btn proc-btn-primary">Generate GRN</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 4: RECORD PAYMENT */}
      {showPaymentModal && (
        <div className="proc-modal-overlay">
          <form className="proc-modal" onSubmit={handleSavePayment}>
            <div className="proc-modal-header">
              <span className="proc-modal-title">Record Vendor Payment</span>
              <button type="button" className="proc-close-btn" onClick={() => setShowPaymentModal(false)}>
                <i data-lucide="x"></i>
              </button>
            </div>
            <div className="proc-modal-body">
              <div className="proc-form-group">
                <label className="proc-form-label">Purchase Order Reference *</label>
                <select required className="proc-select" value={paymentPOId} onChange={e => setPaymentPOId(e.target.value)}>
                  {getDisplayPOs().filter(po => ['Approved', 'Sent', 'Confirmed', 'Partially Delivered'].includes(po.status)).map(po => (
                    <option key={po._id} value={po.poId}>{po.poId} ({po.vendorName}) - Total: ₹{po.totalAmount.toLocaleString()}</option>
                  ))}
                </select>
              </div>

              <div className="proc-form-group">
                <label className="proc-form-label">Payment Amount (₹) *</label>
                <input type="number" required min="1" className="proc-input" placeholder="e.g. 50000"
                  value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
              </div>

              <div className="proc-form-group">
                <label className="proc-form-label">Method of Payment</label>
                <select className="proc-select" value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                  <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                  <option value="UPI">UPI Payout</option>
                  <option value="Cheque">Corporate Cheque</option>
                  <option value="Cash">Cash Ledger</option>
                </select>
              </div>
            </div>
            <div className="proc-modal-footer">
              <button type="button" className="proc-btn proc-btn-secondary" onClick={() => setShowPaymentModal(false)}>Cancel</button>
              <button type="submit" className="proc-btn proc-btn-primary">Record Payment</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 5: VENDOR PROFILE */}
      {selectedVendorProfile && (
        <div className="proc-modal-overlay">
          <div className="proc-modal" style={{ maxWidth: '850px', width: '95%', maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px' }}>
            <div className="proc-modal-header" style={{ position: 'sticky', top: 0, background: 'white', zIndex: 10, borderBottom: '1px solid #E2E8F0', padding: '16px 24px' }}>
              <span className="proc-modal-title" style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>Supplier Master Profile: {selectedVendorProfile.name}</span>
              <button type="button" className="proc-close-btn" onClick={() => setSelectedVendorProfile(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <div className="proc-modal-body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
              
              {/* Section 1: General & Classification */}
              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', marginBottom: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>Supplier Classification</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Supplier Code</span>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#2563EB', marginTop: '2px' }}>{selectedVendorProfile.code}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Supplier Type</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, marginTop: '2px' }}>{selectedVendorProfile.type || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Supplier Category</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, marginTop: '2px' }}>{selectedVendorProfile.supplierCategory || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Organization Type</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, marginTop: '2px' }}>{selectedVendorProfile.organizationType || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Status</span>
                    <div style={{ marginTop: '2px' }}>
                      <span className={`proc-badge-status ${(selectedVendorProfile.status || 'Active').toLowerCase()}`}>
                        {selectedVendorProfile.status || 'Active'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Address & Communication */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', marginBottom: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>Address & Communication</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Complete Address</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, marginTop: '2px' }}>
                      {selectedVendorProfile.houseNo ? `${selectedVendorProfile.houseNo}, ` : ''}
                      {selectedVendorProfile.street ? `${selectedVendorProfile.street}, ` : ''}
                      {selectedVendorProfile.address || ''}
                      {selectedVendorProfile.city ? `, ${selectedVendorProfile.city}` : ''}
                      {selectedVendorProfile.state ? `, ${selectedVendorProfile.state}` : ''}
                      {selectedVendorProfile.zipCode || selectedVendorProfile.pinCode ? ` - ${selectedVendorProfile.zipCode || selectedVendorProfile.pinCode}` : ''}
                      {selectedVendorProfile.country ? `, ${selectedVendorProfile.country}` : ''}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Email Address</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{selectedVendorProfile.email || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Website</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#2563EB', marginTop: '2px' }}>{selectedVendorProfile.website || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Landline Number</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, marginTop: '2px' }}>{selectedVendorProfile.landline || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Fax Number</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, marginTop: '2px' }}>{selectedVendorProfile.faxNo || '--'}</div>
                  </div>
                </div>
              </div>

              {/* Section 3: Contact Persons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', marginBottom: '10px' }}>Primary Contact Person</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700 }}>NAME / DESIGNATION</span>
                      <div style={{ fontSize: '13px', fontWeight: 800 }}>{selectedVendorProfile.contactPerson || selectedVendorProfile.primaryContactPerson || '--'} ({selectedVendorProfile.primaryContactPersonDesignation || 'Contact Person'})</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700 }}>MOBILE NUMBER</span>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{selectedVendorProfile.phone || selectedVendorProfile.primaryContactPersonMobileNo || '--'}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700 }}>EMAIL ID</span>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{selectedVendorProfile.primaryContactPersonEmailId || '--'}</div>
                    </div>
                  </div>
                </div>

                <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', marginBottom: '10px' }}>Secondary Contact Person</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700 }}>NAME / DESIGNATION</span>
                      <div style={{ fontSize: '13px', fontWeight: 800 }}>{selectedVendorProfile.secondaryContactPerson || '--'} {selectedVendorProfile.secondaryContactPersonDesignation ? `(${selectedVendorProfile.secondaryContactPersonDesignation})` : ''}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700 }}>MOBILE NUMBER</span>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{selectedVendorProfile.secondaryContactPersonMobileNo || '--'}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700 }}>EMAIL ID</span>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{selectedVendorProfile.secondaryContactPersonEmailId || '--'}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 4: Compliance & Business Registration */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', marginBottom: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>Compliance & Business Registration</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>GST Number</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{selectedVendorProfile.gstNumber || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>PAN Card Number</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{selectedVendorProfile.panNumber || selectedVendorProfile.panCardNo || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Name on PAN Card</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{selectedVendorProfile.nameOnPanCard || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Drug License Number</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{selectedVendorProfile.licenseNumber || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>CIN Number</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{selectedVendorProfile.cinNo || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>PF Registration No</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{selectedVendorProfile.pfRegistrationNo || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>ROC Number</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{selectedVendorProfile.rocNo || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>ESI Registration No</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{selectedVendorProfile.esiRegistrationNo || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>ISO Certification No</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{selectedVendorProfile.isoCertificationNo ? `${selectedVendorProfile.isoCertificationNo} (Exp: ${selectedVendorProfile.isoValidUpto || '--'})` : '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Pollution Control Cert</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{selectedVendorProfile.pollutionControlBoardCertificationNo ? `${selectedVendorProfile.pollutionControlBoardCertificationNo} (Exp: ${selectedVendorProfile.pollutionValidUpto || '--'})` : '--'}</div>
                  </div>
                </div>
              </div>

              {/* Section 5: Bank Details */}
              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', marginBottom: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>Bank Account Routing</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>BANK NAME</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 800 }}>{selectedVendorProfile.bankName || selectedVendorProfile.bank1Name || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>BRANCH</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{selectedVendorProfile.bank1Branch || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>ACCOUNT NUMBER</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>{selectedVendorProfile.accountNumber || selectedVendorProfile.bank1AccountNumber || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>IFSC CODE</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#2563EB' }}>{selectedVendorProfile.ifscCode || selectedVendorProfile.bank1IfscCode || '--'}</div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>BANK BRANCH ADDRESS</span>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{selectedVendorProfile.bank1Address || '--'}</div>
                  </div>
                </div>
              </div>

              {/* Section 6: Commercial Terms & MSME */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', marginBottom: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>Commercial Terms & MSME Status</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>MSME Registration</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 700 }}>
                      {selectedVendorProfile.isMsmeRegistration === 'Yes' ? `Yes (${selectedVendorProfile.msmeRegistrationNo || '--'} - ${selectedVendorProfile.msmeRegistrationType || ''})` : 'No'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Payment Terms</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{selectedVendorProfile.paymentTerms || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Payment Method</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{selectedVendorProfile.paymentMethod || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Credit Limit / Credit Days</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 700 }}>₹{(selectedVendorProfile.creditLimit || 0).toLocaleString('en-IN')} ({selectedVendorProfile.creditDays || 30} Days)</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Taxes Config</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{selectedVendorProfile.taxes || '--'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Delivery Terms</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{selectedVendorProfile.deliveryTerms || '--'}</div>
                  </div>
                </div>
              </div>

              {/* Section 7: Mapped Products & Prices */}
              <div>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', display: 'block', marginBottom: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>Active Contracts / Price List</span>
                <table className="proc-table" style={{ marginTop: '8px' }}>
                  <thead>
                    <tr>
                      <th>Medicine Name</th>
                      <th>Contract SKU</th>
                      <th>Unit Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedVendorProfile.medicines && selectedVendorProfile.medicines.length > 0 ? (
                      selectedVendorProfile.medicines.map((m, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 700 }}>{m.name}</td>
                          <td>{m.sku}</td>
                          <td style={{ fontWeight: 800 }}>₹{m.price}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="3" style={{ padding: '12px', textAlign: 'center', color: '#64748B' }}>
                          No contract prices mapped. Custom PO rates will apply.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Remarks/Notes */}
              {selectedVendorProfile.notes && (
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Remarks / Internal Notes</span>
                  <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px', fontStyle: 'italic' }}>{selectedVendorProfile.notes}</div>
                </div>
              )}
            </div>
            
            <div className="proc-modal-footer" style={{ position: 'sticky', bottom: 0, background: 'white', zIndex: 10, borderTop: '1px solid #E2E8F0', padding: '16px 24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="proc-btn proc-btn-primary" onClick={() => setSelectedVendorProfile(null)}>Close Profile</button>
            </div>
          </div>
        </div>
      )}

      {/* DEDICATED VENDOR MEDICINE PRICE LIST MODAL */}
      {selectedVendorPriceList && (
        <div 
          className="proc-modal-backdrop" 
          onClick={() => setSelectedVendorPriceList(null)} 
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
        >
          <div 
            className="proc-modal" 
            onClick={e => e.stopPropagation()} 
            style={{ background: '#ffffff', borderRadius: '16px', width: '92%', maxWidth: '750px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #E2E8F0', overflow: 'hidden', animation: 'fadeIn 0.2s ease' }}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i data-lucide="tag" style={{ width: '22px', height: '22px' }}></i>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                      {selectedVendorPriceList.name}
                    </h3>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 800, color: '#2563EB', background: '#DBEAFE', padding: '2px 8px', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
                      {selectedVendorPriceList.code || 'VND'}
                    </span>
                  </div>
                  <span style={{ fontSize: '12.5px', color: '#64748B', display: 'block', marginTop: '3px', fontWeight: 500 }}>
                    Supplied Medicine Catalogue &amp; Wholesale Contract Rates
                  </span>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedVendorPriceList(null)}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <i data-lucide="x" style={{ width: '20px', height: '20px' }}></i>
              </button>
            </div>

            {/* Filter Search Bar & Item Count Badge */}
            <div style={{ padding: '14px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', background: '#FFFFFF' }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: '360px' }}>
                <input 
                  type="text"
                  placeholder="Search medicine name or SKU..."
                  value={priceListSearch}
                  onChange={e => setPriceListSearch(e.target.value)}
                  style={{ width: '100%', height: '38px', paddingLeft: '34px', paddingRight: '12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none', background: '#F8FAFC' }}
                />
                <i data-lucide="search" style={{ position: 'absolute', left: '11px', top: '11px', width: '15px', height: '15px', color: '#94A3B8' }}></i>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  className="proc-btn proc-btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '12.5px', fontWeight: 700 }}
                  onClick={() => {
                    setTargetVendorForMedicine(selectedVendorPriceList);
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
                  <i data-lucide="plus" style={{ width: '14px', height: '14px' }}></i> Add Medicine for Approval
                </button>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#1E40AF', background: '#EFF6FF', border: '1px solid #DBEAFE', padding: '5px 12px', borderRadius: '20px' }}>
                  {(selectedVendorPriceList.medicines || []).length} Medicines Available
                </span>
              </div>
            </div>

            {/* Body: Medicines & Prices Table */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {(() => {
                const meds = (selectedVendorPriceList.medicines || []).filter(m => 
                  !priceListSearch || 
                  (m.name || '').toLowerCase().includes(priceListSearch.toLowerCase()) ||
                  (m.sku || '').toLowerCase().includes(priceListSearch.toLowerCase())
                );

                if (meds.length === 0) {
                  return (
                    <div style={{ padding: '48px 24px', textAlign: 'center', background: '#F8FAFC', borderRadius: '12px', border: '1.5px dashed #CBD5E1', color: '#64748B', fontSize: '13.5px' }}>
                      <div style={{ fontWeight: 700, color: '#334155', marginBottom: '4px' }}>No medicines found</div>
                      <div>{priceListSearch ? `No medicine matches "${priceListSearch}" in this catalog.` : 'This vendor does not have any medicines listed yet.'}</div>
                    </div>
                  );
                }

                return (
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                          <th style={{ padding: '12px 16px', width: '45px', textAlign: 'center', color: '#64748B', fontWeight: 800 }}>#</th>
                          <th style={{ padding: '12px 16px', color: '#334155', fontWeight: 800 }}>Medicine Name</th>
                          <th style={{ padding: '12px 16px', color: '#334155', fontWeight: 800, width: '130px' }}>Contract SKU</th>
                          <th style={{ padding: '12px 16px', color: '#334155', fontWeight: 800, textAlign: 'right', width: '150px' }}>Wholesale Price</th>
                          <th style={{ padding: '12px 16px', color: '#334155', fontWeight: 800, textAlign: 'center', width: '90px' }}>GST Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {meds.map((m, idx) => (
                          <tr key={idx} style={{ borderBottom: idx === (meds.length - 1) ? 'none' : '1px solid #F1F5F9' }}>
                            <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748B', fontWeight: 700, fontSize: '12px' }}>{idx + 1}</td>
                            <td style={{ padding: '12px 16px', fontWeight: 750, color: '#0F172A' }}>{m.name}</td>
                            <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#2563EB', fontWeight: 700 }}>{m.sku || '—'}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                              <span style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '4px 10px', borderRadius: '6px' }}>
                                ₹{Number(m.price || 0).toFixed(2)}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748B', fontWeight: 700 }}>
                              {m.gst !== undefined ? m.gst : 12}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', background: '#F8FAFC' }}>
              <button 
                type="button" 
                className="proc-btn proc-btn-primary" 
                onClick={() => setSelectedVendorPriceList(null)}
                style={{ padding: '8px 24px', fontSize: '13px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD MEDICINE FOR APPROVAL */}
      {showAddMedicineApprovalModal && (() => {
        const vendorObj = targetVendorForMedicine || selectedVendorPriceList || selectedVendorProfile;
        return (
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
            onClick={() => { setShowAddMedicineApprovalModal(false); setTargetVendorForMedicine(null); }}
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
                        {vendorObj?.name || 'Selected Vendor'}
                      </span>
                      {vendorObj?.code && (
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#2563EB', background: '#EFF6FF', padding: '2px 7px', borderRadius: '6px', fontSize: '11.5px', border: '1px solid #DBEAFE' }}>
                          {vendorObj.code}
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
                  onClick={() => { setShowAddMedicineApprovalModal(false); setTargetVendorForMedicine(null); }}
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
                    onClick={() => { setShowAddMedicineApprovalModal(false); setTargetVendorForMedicine(null); }}
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
        );
      })()}

      {/* VENDOR COMPARISON DRAWER */}
      {compareItemIdx !== null && (() => {
        const item = poScreenItems[compareItemIdx];
        const med = medicines.find(m => m.sku === item.sku);
        if (!med) return null;

        const getVendorPriceForMedicine = (vendor, med) => {
          const contract = vendor.medicines?.find(m => m.sku === med.sku || m.name.toLowerCase() === med.name.toLowerCase());
          if (contract) return contract.price;
          
          if (med.name.toLowerCase().includes('paracetamol')) {
            if (vendor.name.includes('Apex')) return 46;
            if (vendor.name.includes('MediCorp') || vendor.name.includes('MedLife') || vendor.name.includes('City')) return 48;
            if (vendor.name.includes('SureMed') || vendor.name.includes('Pacific') || vendor.name.includes('Global')) return 50;
          }
          if (med.name.toLowerCase().includes('pantoprazole')) {
            if (vendor.name.includes('Pacific') || vendor.name.includes('Global')) return 89;
            if (vendor.name.includes('Apex')) return 92;
            if (vendor.name.includes('SureMed') || vendor.name.includes('MediCorp') || vendor.name.includes('MedLife')) return 95;
          }
          
          const hash = vendor.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          return Math.round((med.price || 40) * (0.85 + (hash % 20) / 100));
        };

        const getVendorLeadTime = (vendor) => {
          if (vendor.name.includes('SureMed') || vendor.name.includes('Global')) return '1 day';
          if (vendor.name.includes('MediCorp') || vendor.name.includes('MedLife') || vendor.name.includes('City')) return '2 days';
          if (vendor.name.includes('Apex')) return '5 days';
          if (vendor.name.includes('Pacific')) return '3 days';
          return '3 days';
        };

        const options = getDisplayVendors().map(vendor => {
          const price = getVendorPriceForMedicine(vendor, med);
          const leadTime = getVendorLeadTime(vendor);
          return {
            vendor,
            price,
            leadTime,
            lineTotal: price * item.qty
          };
        }).sort((a, b) => a.price - b.price);

        const lowestOpt = options[0];
        const highestOpt = options[options.length - 1];
        const savings = (highestOpt.price - lowestOpt.price) * item.qty;

        return (
          <div className="proc-drawer-backdrop" onClick={() => setCompareItemIdx(null)}>
            <div className="proc-drawer" onClick={e => e.stopPropagation()}>
              <div className="proc-drawer-header">
                <div>
                  <span className="proc-drawer-title">Vendor Price Comparison</span>
                  <div className="proc-drawer-subtitle">{med.name} - Required {item.qty} units</div>
                </div>
                <button type="button" className="proc-close-btn" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', fontWeight: 800 }} onClick={() => setCompareItemIdx(null)}>
                  <i data-lucide="x"></i>
                </button>
              </div>

              <div className="proc-drawer-body">
                <div className="proc-drawer-stats">
                  <div className="proc-drawer-detail-item">
                    <span className="proc-drawer-stat-label">Current Inventory</span>
                    <span className="proc-drawer-stat-val">{med.stock || 420}</span>
                  </div>
                  <div className="proc-drawer-detail-item">
                    <span className="proc-drawer-stat-label">Avg Monthly Use</span>
                    <span className="proc-drawer-stat-val">{med.avgMonthlyUse || 1200}</span>
                  </div>
                  <div className="proc-drawer-detail-item">
                    <span className="proc-drawer-stat-label">Last Purchase</span>
                    <span className="proc-drawer-stat-val">₹{med.price || 48}</span>
                    <span className="proc-drawer-stat-sub">MediCorp</span>
                  </div>
                </div>

                {lowestOpt && (
                  <div className="proc-rec-banner">
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div className="proc-rec-icon">
                        <i data-lucide="trophy" style={{ width: '20px', height: '20px' }}></i>
                      </div>
                      <div>
                        <div className="proc-rec-title">SYSTEM RECOMMENDATION</div>
                        <div className="proc-rec-desc">{lowestOpt.vendor.name} · ₹{lowestOpt.price} per unit</div>
                        {savings > 0 && (
                          <div className="proc-rec-savings">Potential savings of ₹{savings.toLocaleString()} vs highest offer</div>
                        )}
                      </div>
                    </div>
                    <button 
                      className="proc-btn proc-btn-primary" 
                      style={{ padding: '8px 14px', fontSize: '12px' }}
                      onClick={() => {
                        const updated = [...poScreenItems];
                        const medInVendor = lowestOpt.vendor.medicines?.find(m => m.sku === item.sku);
                        updated[compareItemIdx] = {
                          ...updated[compareItemIdx],
                          vendorId: lowestOpt.vendor._id,
                          price: lowestOpt.price,
                          tax: medInVendor && medInVendor.gst !== undefined ? medInVendor.gst : 12
                        };
                        setPoScreenItems(updated);
                        setCompareItemIdx(null);
                      }}
                    >
                      Use Recommendation
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {options.map((opt, oIdx) => {
                    const isSelected = item.vendorId === opt.vendor._id;
                    const isLowest = oIdx === 0;
                    const isFastest = opt.leadTime === '1 day';

                    return (
                      <div key={opt.vendor._id} className={`proc-vendor-opt-card ${isSelected ? 'selected' : ''}`}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="proc-vendor-opt-name">{opt.vendor.name}</span>
                            {isLowest && (
                              <span className="proc-badge completed" style={{ fontSize: '9px', padding: '2px 6px' }}>Lowest Price</span>
                            )}
                            {isFastest && !isLowest && (
                              <span className="proc-badge partially-delivered" style={{ fontSize: '9px', padding: '2px 6px' }}>Fastest Delivery</span>
                            )}
                          </div>
                          <div className="proc-vendor-opt-code">{opt.vendor.code || `VND-00${oIdx+1}`} · {opt.vendor.city || 'Mumbai'}</div>
                          
                          <div className="proc-vendor-opt-details">
                            <div className="proc-vendor-opt-detail-item">
                              <span className="proc-vendor-opt-detail-label">Price</span>
                              <span className="proc-vendor-opt-detail-val">₹{opt.price}</span>
                            </div>
                            <div className="proc-vendor-opt-detail-item">
                              <span className="proc-vendor-opt-detail-label">Lead Time</span>
                              <span className="proc-vendor-opt-detail-val">{opt.leadTime}</span>
                            </div>
                            <div className="proc-vendor-opt-detail-item">
                              <span className="proc-vendor-opt-detail-label">Line Total</span>
                              <span className="proc-vendor-opt-detail-val">₹{opt.lineTotal.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          {isSelected ? (
                            <button className="proc-btn proc-btn-primary" style={{ padding: '8px 16px', fontSize: '13px', background: '#2563EB', border: 'none', color: '#fff' }} disabled>
                              Selected
                            </button>
                          ) : (
                            <button 
                              className="proc-btn proc-btn-secondary" 
                              style={{ padding: '8px 16px', fontSize: '13px' }}
                              onClick={() => {
                                const updated = [...poScreenItems];
                                const medInVendor = opt.vendor.medicines?.find(m => m.sku === item.sku);
                                updated[compareItemIdx] = {
                                  ...updated[compareItemIdx],
                                  vendorId: opt.vendor._id,
                                  price: opt.price,
                                  tax: medInVendor && medInVendor.gst !== undefined ? medInVendor.gst : 12
                                };
                                setPoScreenItems(updated);
                                setCompareItemIdx(null);
                              }}
                            >
                              Select Vendor
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 3: GENERATE GRN */}
      {showGRNModal && (() => {
        const selectedPoObj = grnFlowType === 'po' 
          ? getDisplayPOs().find(x => x._id === grnSelectedPOId || x.poId === grnSelectedPOId) 
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
          <div className="proc-modal-overlay" style={{ backdropFilter: 'blur(8px)', background: 'rgba(15, 23, 42, 0.65)' }}>
            <form 
              className="proc-modal" 
              style={{ 
                maxWidth: '1260px', 
                width: '90%', 
                maxHeight: '92vh', 
                overflowY: 'auto', 
                borderRadius: '20px', 
                border: '1px solid rgba(226, 232, 240, 0.9)', 
                boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.35)',
                background: '#FFFFFF'
              }} 
              onSubmit={(e) => handleSaveGRN(e, 'Verified/Completed')}
            >
              {/* MODAL HEADER */}
              <div 
                className="proc-modal-header" 
                style={{ 
                  position: 'sticky', 
                  top: 0, 
                  background: 'rgba(255, 255, 255, 0.98)', 
                  backdropFilter: 'blur(10px)', 
                  zIndex: 20, 
                  borderBottom: '1.5px solid #F1F5F9', 
                  padding: '20px 28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 6px 18px rgba(16, 185, 129, 0.35)',
                    flexShrink: 0
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
                      <path d="m3.3 7 8.7 5 8.7-5"/>
                      <path d="M12 22V12"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>
                        Goods Receipt Note (GRN) Verification
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 800, background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', padding: '2px 8px', borderRadius: '20px' }}>
                        ● INTAKE LEDGER
                      </span>
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px', fontWeight: 500 }}>
                      Inspect cartons, verify batch numbers &amp; expiry dates, and lock in received stock against invoice.
                    </div>
                  </div>
                </div>

                <button 
                  type="button" 
                  onClick={() => setShowGRNModal(false)}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: '#F1F5F9',
                    border: '1px solid #E2E8F0',
                    color: '#64748B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: 700,
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#64748B'; }}
                >
                  ✕
                </button>
              </div>

              <div className="proc-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px 28px' }}>
                
                {/* 1. WORKFLOW SWITCH & RECEIVING STORE */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
                  gap: '18px', 
                  background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)', 
                  padding: '18px 20px', 
                  borderRadius: '16px', 
                  border: '1.5px solid #E2E8F0' 
                }}>
                  <div>
                    <label className="proc-form-label" style={{ marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 850, letterSpacing: '0.04em' }}>
                      Receipt Workflow Mode
                    </label>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                      <div 
                        onClick={() => {
                          setGrnFlowType('po');
                          setGrnSelectedPOId('');
                          setGrnDirectVendorId('');
                          setGrnItems([]);
                        }}
                        style={{
                          flex: 1,
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: grnFlowType === 'po' ? '2px solid #2563EB' : '1.5px solid #CBD5E1',
                          background: grnFlowType === 'po' ? '#EFF6FF' : '#FFFFFF',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          transition: 'all 0.15s ease',
                          boxShadow: grnFlowType === 'po' ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none'
                        }}
                      >
                        <div style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          border: grnFlowType === 'po' ? '5px solid #2563EB' : '2px solid #94A3B8',
                          background: '#FFFFFF'
                        }} />
                        <span style={{ fontSize: '12.5px', fontWeight: 800, color: grnFlowType === 'po' ? '#1E40AF' : '#475569' }}>
                          Against Approved PO
                        </span>
                      </div>

                      <div 
                        onClick={() => {
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
                        style={{
                          flex: 1,
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: grnFlowType === 'direct' ? '2px solid #2563EB' : '1.5px solid #CBD5E1',
                          background: grnFlowType === 'direct' ? '#EFF6FF' : '#FFFFFF',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          transition: 'all 0.15s ease',
                          boxShadow: grnFlowType === 'direct' ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none'
                        }}
                      >
                        <div style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          border: grnFlowType === 'direct' ? '5px solid #2563EB' : '2px solid #94A3B8',
                          background: '#FFFFFF'
                        }} />
                        <span style={{ fontSize: '12.5px', fontWeight: 800, color: grnFlowType === 'direct' ? '#1E40AF' : '#475569' }}>
                          Direct Purchase (No PO)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="proc-form-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 850, letterSpacing: '0.04em' }}>
                      Receiving Destination Store *
                    </label>
                    <select 
                      className="proc-select" 
                      value={grnLocation} 
                      onChange={e => setGrnLocation(e.target.value)}
                      style={{ height: '42px', fontSize: '13px', fontWeight: 700, borderRadius: '10px', border: '1.5px solid #CBD5E1', background: '#FFFFFF', marginTop: '6px' }}
                    >
                      <option value="Main Pharmacy Store">🏥 Main Pharmacy Store</option>
                      <option value="Central Warehouse Depot">🏢 Central Warehouse Depot</option>
                      <option value="OPD Dispensing Store">💊 OPD Dispensing Store</option>
                      <option value="Emergency & ICU Store">🚨 Emergency &amp; ICU Store</option>
                    </select>
                  </div>
                </div>

                {/* 2. PO SELECTION & READ-ONLY ORDER DETAILS */}
                {grnFlowType === 'po' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div className="proc-form-group" style={{ margin: 0 }}>
                      <label className="proc-form-label" style={{ fontSize: '11.5px', textTransform: 'uppercase', color: '#334155', fontWeight: 850, letterSpacing: '0.03em' }}>
                        Select Approved Purchase Order *
                      </label>
                      <select 
                        required 
                        className="proc-select" 
                        value={grnSelectedPOId} 
                        onChange={e => handleGrnPOSelection(e.target.value)}
                        style={{ height: '44px', fontSize: '13.5px', fontWeight: 800, borderRadius: '10px', border: '1.5px solid #2563EB', background: '#FFFFFF', color: '#0F172A' }}
                      >
                        <option value="">-- Choose Approved Supplier Order --</option>
                        {getDisplayPOs().filter(po => !po.isParent && po.vendorName !== 'Consolidated Multiple Suppliers' && !(po.vendorOrders && po.vendorOrders.length > 0) && ['Approved', 'Sent', 'Confirmed', 'Partially Delivered', 'Partially Received'].includes(po.status)).map(po => (
                          <option key={po._id} value={po._id}>
                            {po.poId} — {po.vendorName} (₹{Number(po.totalAmount || 0).toLocaleString()} • {po.status})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedPoObj && (
                      <div style={{ 
                        background: 'linear-gradient(90deg, #EFF6FF 0%, #F8FAFC 100%)', 
                        border: '1.5px solid #BFDBFE', 
                        borderRadius: '14px', 
                        padding: '16px 20px', 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                        gap: '16px',
                        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.06)'
                      }}>
                        <div>
                          <span style={{ fontSize: '10.5px', fontWeight: 850, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>PO NUMBER</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                            <span style={{ fontSize: '14.5px', fontWeight: 900, color: '#1E3A8A', fontFamily: 'monospace' }}>{selectedPoObj.poId}</span>
                            {selectedPoObj.parentPOId && (
                              <span style={{ fontSize: '9.5px', fontWeight: 800, background: '#DBEAFE', color: '#1E40AF', padding: '1px 5px', borderRadius: '4px' }}>Sub-PO</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '10.5px', fontWeight: 850, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>ORDER DATE</span>
                          <div style={{ fontSize: '13.5px', fontWeight: 750, color: '#1E293B', marginTop: '3px' }}>
                            {new Date(selectedPoObj.createdAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '10.5px', fontWeight: 850, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>ASSIGNED VENDOR</span>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginTop: '3px' }}>{selectedPoObj.vendorName}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '10.5px', fontWeight: 850, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>APPROVAL STATUS</span>
                          <div style={{ marginTop: '3px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 850, padding: '3px 9px', borderRadius: '20px', background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10B981' }}></span>
                              {selectedPoObj.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="proc-form-group" style={{ margin: 0 }}>
                    <label className="proc-form-label" style={{ fontSize: '11.5px', textTransform: 'uppercase', color: '#475569', fontWeight: 850 }}>
                      Supplier / Vendor *
                    </label>
                    <select 
                      required 
                      className="proc-select" 
                      value={grnDirectVendorId} 
                      onChange={e => setGrnDirectVendorId(e.target.value)}
                      style={{ height: '42px', fontSize: '13.5px', fontWeight: 700, borderRadius: '10px' }}
                    >
                      <option value="">-- Choose Vendor --</option>
                      {getDisplayVendors().map(v => (
                        <option key={v._id} value={v._id}>{v.name} ({v.code})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 3. ITEM RECEIVING & QUALITY INSPECTION LEDGER */}
                {grnItems.length > 0 && (
                  <div style={{ marginTop: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', textTransform: 'uppercase', color: '#0F172A', fontWeight: 900, letterSpacing: '0.04em' }}>
                          Physical Receiving &amp; Quality Inspection Ledger
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 800, background: '#EFF6FF', color: '#1D4ED8', padding: '2px 8px', borderRadius: '12px', border: '1px solid #BFDBFE' }}>
                          {grnItems.length} {grnItems.length === 1 ? 'Line Item' : 'Line Items'}
                        </span>
                      </div>

                      {grnFlowType === 'direct' && (
                        <button 
                          type="button" 
                          className="proc-btn proc-btn-primary" 
                          style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px', borderRadius: '8px' }}
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
                          + Add Item Line
                        </button>
                      )}
                    </div>

                    <div style={{ border: '1.5px solid #E2E8F0', borderRadius: '14px', background: '#FFFFFF', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                            <th style={{ padding: '12px 12px', textAlign: 'left', fontWeight: 850, color: '#334155' }}>ITEM SPECIFICATION</th>
                            <th style={{ padding: '12px 6px', textAlign: 'left', fontWeight: 850, color: '#334155', width: '90px' }}>BARCODE</th>
                            <th style={{ padding: '12px 6px', textAlign: 'left', fontWeight: 850, color: '#1E40AF', width: '90px', background: '#EFF6FF' }}>BATCH NO. *</th>
                            <th style={{ padding: '12px 6px', textAlign: 'left', fontWeight: 850, color: '#334155', width: '108px' }}>MFG DATE</th>
                            <th style={{ padding: '12px 6px', textAlign: 'left', fontWeight: 850, color: '#B45309', width: '108px', background: '#FEF3C7' }}>EXPIRY DATE *</th>
                            {grnFlowType === 'po' && (
                              <>
                                <th style={{ padding: '12px 4px', textAlign: 'center', fontWeight: 850, color: '#64748B', width: '45px' }}>PO QTY</th>
                                <th style={{ padding: '12px 4px', textAlign: 'center', fontWeight: 850, color: '#64748B', width: '45px' }}>PREV.</th>
                                <th style={{ padding: '12px 4px', textAlign: 'center', fontWeight: 900, color: '#1D4ED8', width: '50px', background: '#EFF6FF' }}>REMAIN</th>
                              </>
                            )}
                            <th style={{ padding: '12px 6px', textAlign: 'center', fontWeight: 900, color: '#047857', width: '68px', background: '#ECFDF5' }}>RECV QTY *</th>
                            <th style={{ padding: '12px 6px', textAlign: 'center', fontWeight: 900, color: '#B91C1C', width: '58px', background: '#FEF2F2' }}>REJ QTY</th>
                            <th style={{ padding: '12px 6px', textAlign: 'right', fontWeight: 850, color: '#334155', width: '68px' }}>RATE (₹)</th>
                            <th style={{ padding: '12px 4px', textAlign: 'center', fontWeight: 850, color: '#334155', width: '45px' }}>DISC %</th>
                            <th style={{ padding: '12px 4px', textAlign: 'center', fontWeight: 850, color: '#334155', width: '45px' }}>GST %</th>
                            <th style={{ padding: '12px 6px', textAlign: 'right', fontWeight: 850, color: '#1D4ED8', width: '68px' }}>BUY PRICE</th>
                            <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 900, color: '#0F172A', width: '85px' }}>NET TOTAL</th>
                            {grnFlowType === 'direct' && <th style={{ padding: '12px 4px', width: '30px' }}></th>}
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
                              <tr key={`grn-item-row-${idx}`} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#FFFFFF' : '#FAFCFF' }}>
                                <td style={{ padding: '8px 12px' }}>
                                  {grnFlowType === 'po' ? (
                                    <div>
                                      <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '13px' }}>{item.name}</div>
                                      <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <span style={{ fontFamily: 'monospace', color: '#2563EB', fontWeight: 800, background: '#EFF6FF', padding: '1px 4px', borderRadius: '4px', border: '1px solid #DBEAFE' }}>
                                          {item.sku}
                                        </span>
                                        <span>•</span>
                                        <span style={{ fontWeight: 600 }}>{item.unit || 'Strip'}</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                      <input 
                                        type="text" 
                                        required 
                                        placeholder="Item Name" 
                                        className="proc-input" 
                                        value={item.name} 
                                        onChange={e => {
                                          const updated = [...grnItems];
                                          updated[idx].name = e.target.value;
                                          setGrnItems(updated);
                                        }}
                                        style={{ height: '30px', fontSize: '11.5px', borderRadius: '6px', width: '100%', boxSizing: 'border-box' }}
                                      />
                                      <div style={{ display: 'flex', gap: '4px' }}>
                                        <input 
                                          type="text" 
                                          placeholder="SKU" 
                                          className="proc-input" 
                                          value={item.sku} 
                                          onChange={e => {
                                            const updated = [...grnItems];
                                            updated[idx].sku = e.target.value;
                                            setGrnItems(updated);
                                          }}
                                          style={{ height: '24px', fontSize: '10.5px', width: '80px', fontFamily: 'monospace', borderRadius: '6px' }}
                                        />
                                        <input 
                                          type="text" 
                                          placeholder="Unit" 
                                          className="proc-input" 
                                          value={item.unit} 
                                          onChange={e => {
                                            const updated = [...grnItems];
                                            updated[idx].unit = e.target.value;
                                            setGrnItems(updated);
                                          }}
                                          style={{ height: '24px', fontSize: '10.5px', width: '60px', borderRadius: '6px' }}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </td>

                                <td style={{ padding: '8px 5px' }}>
                                  <input 
                                    type="text" 
                                    placeholder={qty > 0 ? "Barcode" : "—"} 
                                    disabled={qty === 0}
                                    className="proc-input" 
                                    value={item.barcode || ''} 
                                    onChange={e => {
                                      const updated = [...grnItems];
                                      updated[idx].barcode = e.target.value;
                                      setGrnItems(updated);
                                    }}
                                    style={{ height: '30px', fontSize: '11px', padding: '0 6px', fontFamily: 'monospace', borderRadius: '6px', width: '100%', boxSizing: 'border-box', background: qty === 0 ? '#F1F5F9' : '#FFFFFF', cursor: qty === 0 ? 'not-allowed' : 'text', opacity: qty === 0 ? 0.65 : 1 }}
                                  />
                                </td>

                                <td style={{ padding: '8px 5px', background: '#F8FAFC' }}>
                                  <input 
                                    type="text" 
                                    required={qty > 0} 
                                    disabled={qty === 0}
                                    placeholder={qty > 0 ? "Batch *" : "—"} 
                                    className="proc-input" 
                                    value={item.batchNumber || ''} 
                                    onChange={e => {
                                      const updated = [...grnItems];
                                      updated[idx].batchNumber = e.target.value;
                                      setGrnItems(updated);
                                    }}
                                    style={{ height: '30px', fontSize: '11.5px', padding: '0 6px', fontWeight: 800, borderRadius: '6px', borderColor: (item.batchNumber || qty === 0) ? '#CBD5E1' : '#93C5FD', background: qty === 0 ? '#F1F5F9' : '#FFFFFF', cursor: qty === 0 ? 'not-allowed' : 'text', width: '100%', boxSizing: 'border-box', opacity: qty === 0 ? 0.65 : 1 }}
                                  />
                                </td>

                                <td style={{ padding: '8px 5px' }}>
                                  <input 
                                    type="date" 
                                    disabled={qty === 0}
                                    max={new Date().toISOString().split('T')[0]}
                                    className="proc-input" 
                                    value={item.mfgDate || ''} 
                                    onChange={e => {
                                      const updated = [...grnItems];
                                      updated[idx].mfgDate = e.target.value;
                                      setGrnItems(updated);
                                    }}
                                    style={{ height: '30px', fontSize: '10.5px', padding: '0 4px', borderRadius: '6px', width: '100%', boxSizing: 'border-box', background: qty === 0 ? '#F1F5F9' : '#FFFFFF', cursor: qty === 0 ? 'not-allowed' : 'text', opacity: qty === 0 ? 0.65 : 1 }}
                                  />
                                </td>

                                <td style={{ padding: '8px 5px', background: '#FFFDF5' }}>
                                  <input 
                                    type="date" 
                                    required={qty > 0}
                                    disabled={qty === 0}
                                    className="proc-input" 
                                    value={item.expiryDate || ''} 
                                    onChange={e => {
                                      const updated = [...grnItems];
                                      updated[idx].expiryDate = e.target.value;
                                      setGrnItems(updated);
                                    }}
                                    style={{ height: '30px', fontSize: '10.5px', padding: '0 4px', borderRadius: '6px', borderColor: (item.expiryDate || qty === 0) ? '#CBD5E1' : '#FDE68A', background: qty === 0 ? '#F1F5F9' : '#FFFFFF', cursor: qty === 0 ? 'not-allowed' : 'text', width: '100%', boxSizing: 'border-box', opacity: qty === 0 ? 0.65 : 1 }}
                                  />
                                </td>

                                {grnFlowType === 'po' && (
                                  <>
                                    <td style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 750, color: '#475569', fontSize: '12px' }}>
                                      {item.qtyOrdered || 0}
                                    </td>
                                    <td style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 700, color: '#64748B', fontSize: '12px' }}>
                                      {item.previouslyReceivedQty || 0}
                                    </td>
                                    <td style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 900, color: '#2563EB', fontSize: '12.5px', background: '#F8FAFC' }}>
                                      {item.remainingQty !== undefined ? item.remainingQty : Math.max(0, (item.qtyOrdered || 0) - (item.previouslyReceivedQty || 0))}
                                    </td>
                                  </>
                                )}

                                <td style={{ padding: '8px 5px', textAlign: 'center', background: '#F0FDF4' }}>
                                  <input 
                                    type="number" 
                                    required 
                                    min="0"
                                    max={grnFlowType === 'po' ? remainingLimit : 999999}
                                    className="proc-input" 
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
                                    style={{ height: '30px', fontSize: '12.5px', padding: '0 4px', textAlign: 'center', fontWeight: 900, color: '#047857', borderColor: '#86EFAC', borderRadius: '6px', background: '#FFFFFF', width: '100%', boxSizing: 'border-box' }}
                                  />
                                </td>

                                <td style={{ padding: '8px 5px', textAlign: 'center', background: '#FEF2F2' }}>
                                  <input 
                                    type="number" 
                                    min="0" 
                                    className="proc-input" 
                                    value={item.rejectedQty !== undefined ? item.rejectedQty : 0} 
                                    onChange={e => {
                                      const updated = [...grnItems];
                                      updated[idx].rejectedQty = Math.max(0, Number(e.target.value) || 0);
                                      setGrnItems(updated);
                                    }}
                                    style={{ height: '30px', fontSize: '12.5px', padding: '0 4px', textAlign: 'center', fontWeight: 900, color: '#DC2626', borderColor: '#FECACA', borderRadius: '6px', background: '#FFFFFF', width: '100%', boxSizing: 'border-box' }}
                                    title="Rejected units will not be added to active inventory stock"
                                  />
                                </td>

                                <td style={{ padding: '8px 5px', textAlign: 'right' }}>
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    min="0"
                                    required
                                    className="proc-input" 
                                    value={item.price !== undefined ? item.price : item.purchaseRate || 0} 
                                    onChange={e => {
                                      const updated = [...grnItems];
                                      const p = Math.max(0, Number(e.target.value) || 0);
                                      updated[idx].price = p;
                                      updated[idx].purchaseRate = p;
                                      setGrnItems(updated);
                                    }}
                                    style={{ height: '30px', fontSize: '12px', padding: '0 6px', textAlign: 'right', fontWeight: 800, borderRadius: '6px', width: '100%', boxSizing: 'border-box' }}
                                  />
                                </td>

                                <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                                  <input 
                                    type="number" 
                                    min="0" 
                                    max="100"
                                    className="proc-input" 
                                    value={item.discountPercent !== undefined ? item.discountPercent : 0} 
                                    onChange={e => {
                                      const updated = [...grnItems];
                                      updated[idx].discountPercent = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                      setGrnItems(updated);
                                    }}
                                    style={{ height: '30px', fontSize: '11px', padding: '0 2px', textAlign: 'center', borderRadius: '6px', width: '100%', boxSizing: 'border-box' }}
                                  />
                                </td>

                                <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                                  <input 
                                    type="number" 
                                    min="0" 
                                    max="100"
                                    className="proc-input" 
                                    value={item.gst !== undefined ? item.gst : 12} 
                                    onChange={e => {
                                      const updated = [...grnItems];
                                      updated[idx].gst = Math.max(0, Number(e.target.value) || 0);
                                      setGrnItems(updated);
                                    }}
                                    style={{ height: '30px', fontSize: '11px', padding: '0 2px', textAlign: 'center', borderRadius: '6px', width: '100%', boxSizing: 'border-box' }}
                                  />
                                </td>

                                <td style={{ padding: '8px 5px', textAlign: 'right', fontWeight: 800, color: '#2563EB', fontSize: '12px' }}>
                                  ₹{unitBuyPrice.toFixed(2)}
                                </td>

                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 900, color: '#0F172A', fontSize: '13px' }}>
                                  ₹{netAmt.toFixed(2)}
                                </td>

                                {grnFlowType === 'direct' && (
                                  <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                                    <button 
                                      type="button" 
                                      className="proc-close-btn" 
                                      style={{ color: '#EF4444', background: '#FEF2F2', width: '24px', height: '24px', borderRadius: '6px' }} 
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
                <div style={{ 
                  background: 'linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)', 
                  border: '1.5px solid #E2E8F0', 
                  borderRadius: '16px', 
                  padding: '20px 24px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      Supplier Invoice Details &amp; Document
                    </span>
                    <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 500 }}>
                      (Verify supplier bill information against physical invoice document)
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', alignItems: 'flex-start' }}>
                    <div>
                      <label className="proc-form-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 850 }}>Invoice Number *</label>
                      <input 
                        type="text" 
                        placeholder="e.g. INV-2026-9901" 
                        className="proc-input" 
                        value={grnInvoiceNumber} 
                        onChange={e => setGrnInvoiceNumber(e.target.value)}
                        style={{ height: '40px', fontSize: '13px', fontWeight: 750, borderRadius: '8px', border: '1.5px solid #CBD5E1', marginTop: '4px' }}
                      />
                    </div>

                    <div>
                      <label className="proc-form-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 850 }}>Invoice Date *</label>
                      <input 
                        type="date" 
                        className="proc-input" 
                        value={grnInvoiceDate} 
                        onChange={e => setGrnInvoiceDate(e.target.value)}
                        style={{ height: '40px', fontSize: '13px', borderRadius: '8px', border: '1.5px solid #CBD5E1', marginTop: '4px' }}
                      />
                    </div>

                    <div>
                      <label className="proc-form-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 850 }}>Billed Invoice Amount (₹) *</label>
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="e.g. 5250.00" 
                        className="proc-input" 
                        value={grnInvoiceAmount} 
                        onChange={e => setGrnInvoiceAmount(e.target.value)}
                        style={{ height: '40px', fontSize: '13.5px', fontWeight: 900, borderRadius: '8px', border: '1.5px solid #CBD5E1', marginTop: '4px' }}
                      />
                    </div>

                    <div>
                      <label className="proc-form-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 850 }}>Invoice Document Attachment</label>
                      
                      {!grnInvoiceFileName ? (
                        <div style={{ marginTop: '4px' }}>
                          <input 
                            type="file" 
                            id="grn-invoice-file-input"
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
                            className="proc-btn" 
                            style={{ height: '40px', width: '100%', fontSize: '12.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 750, background: '#EFF6FF', color: '#1D4ED8', border: '1.5px dashed #93C5FD', borderRadius: '8px', cursor: 'pointer' }}
                            onClick={() => document.getElementById('grn-invoice-file-input')?.click()}
                          >
                            📎 + Attach Invoice Document
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#DCFCE7', border: '1.5px solid #86EFAC', borderRadius: '8px', height: '40px', boxSizing: 'border-box', marginTop: '4px' }}>
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

                {/* 5. NOTES & AUTHORITATIVE SUMMARY DUAL COLUMN */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', alignItems: 'stretch' }}>
                  
                  {/* Left: Notes & Discrepancy Remarks */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label className="proc-form-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 850, letterSpacing: '0.03em', marginBottom: '6px' }}>
                      Inspection Notes / Discrepancy Remarks
                    </label>
                    <textarea 
                      placeholder="Add inspection observations, batch discrepancies, damaged packaging notes..." 
                      className="proc-input" 
                      value={grnNotes} 
                      onChange={e => setGrnNotes(e.target.value)}
                      style={{ flex: 1, minHeight: '120px', fontSize: '13px', padding: '12px', borderRadius: '12px', border: '1.5px solid #CBD5E1', resize: 'vertical' }}
                    />
                  </div>

                  {/* Right: Authoritative GRN Summary & Variance Card */}
                  <div style={{ 
                    background: 'linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)', 
                    border: '1.5px solid #E2E8F0', 
                    borderRadius: '16px', 
                    padding: '20px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '10px',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.03)'
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1.5px solid #F1F5F9', paddingBottom: '8px' }}>
                      GRN Financial Summary
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                      <span>Gross Subtotal:</span>
                      <strong style={{ color: '#0F172A' }}>₹{liveTotals.subtotal.toFixed(2)}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                      <span>Total Line Discount:</span>
                      <strong style={{ color: '#16A34A' }}>−₹{liveTotals.totalDiscount.toFixed(2)}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                      <span>Taxable Base:</span>
                      <strong style={{ color: '#0F172A' }}>₹{liveTotals.taxableBase.toFixed(2)}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                      <span>Total GST Tax:</span>
                      <strong style={{ color: '#EA580C' }}>+₹{liveTotals.totalGst.toFixed(2)}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #E2E8F0', paddingTop: '10px', marginTop: '4px', fontSize: '17px', fontWeight: 900, color: '#0F172A' }}>
                      <span>Calculated GRN Total:</span>
                      <span style={{ color: '#2563EB', letterSpacing: '-0.02em' }}>₹{liveTotals.grandTotal.toFixed(2)}</span>
                    </div>

                    {invoicedVal > 0 && (
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        background: varianceVal === 0 ? '#DCFCE7' : '#FEF3C7', 
                        border: `1.5px solid ${varianceVal === 0 ? '#86EFAC' : '#FDE68A'}`, 
                        padding: '8px 12px', 
                        borderRadius: '10px', 
                        marginTop: '6px' 
                      }}>
                        <span style={{ fontSize: '12px', fontWeight: 850, color: varianceVal === 0 ? '#166534' : '#92400E' }}>
                          {varianceVal === 0 ? '✓ Invoice Matched Perfectly' : `⚠ Invoice Variance (${varianceVal > 0 ? '+' : ''}₹${varianceVal.toFixed(2)})`}
                        </span>
                        <span style={{ fontSize: '12.5px', fontWeight: 900, color: varianceVal === 0 ? '#166534' : '#92400E' }}>
                          Billed: ₹{invoicedVal.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* MODAL FOOTER */}
              <div 
                className="proc-modal-footer" 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  position: 'sticky', 
                  bottom: 0, 
                  background: '#FFFFFF', 
                  zIndex: 20, 
                  borderTop: '1.5px solid #F1F5F9', 
                  padding: '16px 28px' 
                }}
              >
                <button 
                  type="button" 
                  className="proc-btn" 
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    border: '1.5px solid #E2E8F0',
                    background: '#F8FAFC',
                    color: '#64748B',
                    fontWeight: 750,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                  onClick={() => setShowGRNModal(false)}
                >
                  Cancel
                </button>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    type="button" 
                    disabled={grnItems.length === 0}
                    style={{ 
                      padding: '10px 20px', 
                      borderRadius: '10px', 
                      border: '1.5px solid #BFDBFE', 
                      background: '#EFF6FF', 
                      color: '#1D4ED8', 
                      fontWeight: 800, 
                      fontSize: '13px', 
                      cursor: grnItems.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: grnItems.length === 0 ? 0.6 : 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                    onClick={(e) => handleSaveGRN(e, 'Draft')}
                  >
                    💾 Save as Draft
                  </button>

                  <button 
                    type="submit" 
                    disabled={grnItems.length === 0 || (grnFlowType === 'direct' && !grnDirectVendorId)}
                    style={{ 
                      padding: '10px 24px', 
                      borderRadius: '10px', 
                      border: 'none', 
                      background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', 
                      color: '#FFFFFF', 
                      fontWeight: 850, 
                      fontSize: '13.5px', 
                      cursor: (grnItems.length === 0 || (grnFlowType === 'direct' && !grnDirectVendorId)) ? 'not-allowed' : 'pointer',
                      opacity: (grnItems.length === 0 || (grnFlowType === 'direct' && !grnDirectVendorId)) ? 0.6 : 1,
                      boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5"/>
                    </svg>
                    Generate GRN &amp; Update Inventory
                  </button>
                </div>
              </div>
            </form>
          </div>
        );
      })()}

      {/* MODAL 4: RECORD PAYMENT */}
      {showPaymentModal && (
        <div className="proc-modal-overlay">
          <form className="proc-modal" onSubmit={handleSavePayment}>
            <div className="proc-modal-header">
              <span className="proc-modal-title">Record Vendor Payment</span>
              <button type="button" className="proc-close-btn" onClick={() => setShowPaymentModal(false)}>
                <i data-lucide="x"></i>
              </button>
            </div>
            <div className="proc-modal-body">
              <div className="proc-form-group">
                <label className="proc-form-label">Purchase Order Reference *</label>
                <select required className="proc-select" value={paymentPOId} onChange={e => setPaymentPOId(e.target.value)}>
                  {getDisplayPOs().filter(po => ['Approved', 'Sent', 'Confirmed', 'Partially Delivered'].includes(po.status)).map(po => (
                    <option key={po._id} value={po.poId}>{po.poId} ({po.vendorName}) - Total: ₹{po.totalAmount.toLocaleString()}</option>
                  ))}
                </select>
              </div>

              <div className="proc-form-group">
                <label className="proc-form-label">Payment Amount (₹) *</label>
                <input type="number" required min="1" className="proc-input" placeholder="e.g. 50000"
                  value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
              </div>

              <div className="proc-form-group">
                <label className="proc-form-label">Method of Payment</label>
                <select className="proc-select" value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                  <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                  <option value="UPI">UPI Payout</option>
                  <option value="Cheque">Corporate Cheque</option>
                  <option value="Cash">Cash Ledger</option>
                </select>
              </div>
            </div>
            <div className="proc-modal-footer">
              <button type="button" className="proc-btn proc-btn-secondary" onClick={() => setShowPaymentModal(false)}>Cancel</button>
              <button type="submit" className="proc-btn proc-btn-primary">Record Payment</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 5: VENDOR PROFILE DETAILS */}
      {selectedVendorProfile && (
        <div className="proc-modal-overlay">
          <div className="proc-modal" style={{ maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="proc-modal-header">
              <span className="proc-modal-title">Vendor Master Profile: {selectedVendorProfile.name}</span>
              <button type="button" className="proc-close-btn" onClick={() => setSelectedVendorProfile(null)}>
                <i data-lucide="x"></i>
              </button>
            </div>
            <div className="proc-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Classification</span>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>{selectedVendorProfile.type} • {selectedVendorProfile.supplierCategory || 'Medicine'}</div>
                  <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>Code: <strong>{selectedVendorProfile.code}</strong></div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Contact Person</span>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>{selectedVendorProfile.contactPerson || selectedVendorProfile.primaryContactPerson || '—'}</div>
                  <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>{selectedVendorProfile.phone} • {selectedVendorProfile.email}</div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Tax &amp; Legal</span>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>GSTIN: {selectedVendorProfile.gstNumber || '—'}</div>
                  <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>PAN: {selectedVendorProfile.panNumber || selectedVendorProfile.panCardNo || '—'}</div>
                </div>
              </div>

              <div>
                <span className="proc-form-label" style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase' }}>Catalog Medications ({selectedVendorProfile.medicines?.length || 0})</span>
                <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px', marginTop: '6px' }}>
                  <table className="proc-items-table" style={{ margin: 0 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        <th>Medicine</th>
                        <th>SKU</th>
                        <th style={{ textAlign: 'right' }}>Wholesale Price (₹)</th>
                        <th style={{ textAlign: 'right' }}>GST %</th>
                        <th style={{ textAlign: 'center' }}>Availability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedVendorProfile.medicines || []).map((med, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 700 }}>{med.name}</td>
                          <td style={{ fontFamily: 'monospace', color: '#2563EB', fontWeight: 700 }}>{med.sku}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800 }}>₹{Number(med.price || 0).toFixed(2)}</td>
                          <td style={{ textAlign: 'right' }}>{med.gst !== undefined ? med.gst : 12}%</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '10px', background: med.available !== false ? '#DCFCE7' : '#FEE2E2', color: med.available !== false ? '#15803D' : '#B91C1C' }}>
                              {med.available !== false ? 'Available' : 'Out of Stock'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="proc-modal-footer">
              <button type="button" className="proc-btn proc-btn-primary" onClick={() => setSelectedVendorProfile(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: VENDOR PRICE LIST CONFIG */}
      {selectedVendorPriceList && (
        <div className="proc-modal-overlay">
          <div className="proc-modal" style={{ maxWidth: '800px' }}>
            <div className="proc-modal-header">
              <span className="proc-modal-title">Configured Price List: {selectedVendorPriceList.name}</span>
              <button type="button" className="proc-close-btn" onClick={() => setSelectedVendorPriceList(null)}>
                <i data-lucide="x"></i>
              </button>
            </div>
            <div className="proc-modal-body">
              <table className="proc-items-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>SKU Code</th>
                    <th style={{ textAlign: 'right' }}>Wholesale Contract (₹)</th>
                    <th style={{ textAlign: 'right' }}>GST</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedVendorPriceList.medicines || []).map((med, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 700 }}>{med.name}</td>
                      <td style={{ fontFamily: 'monospace', color: '#2563EB' }}>{med.sku}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>₹{Number(med.price || 0).toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{med.gst !== undefined ? med.gst : 12}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="proc-modal-footer">
              <button type="button" className="proc-btn proc-btn-primary" onClick={() => setSelectedVendorPriceList(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: INVOICE DETAILS PREVIEW */}
      {selectedInvoiceDetails && (
        <div className="proc-modal-overlay">
          <div className="proc-modal" style={{ maxWidth: '540px' }}>
            <div className="proc-modal-header">
              <span className="proc-modal-title">Vendor Invoice Record</span>
              <button type="button" className="proc-close-btn" onClick={() => setSelectedInvoiceDetails(null)}>
                ✕
              </button>
            </div>
            <div className="proc-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Invoice Number</span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>INV-A-{selectedInvoiceDetails.poId.slice(-4)}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Purchase Order</span>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#2563EB' }}>{selectedInvoiceDetails.poId}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Supplier</span>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{selectedInvoiceDetails.vendorName}</div>
                </div>
              </div>
              <hr style={{ border: '0', borderTop: '1px solid #E2E8F0', margin: '8px 0' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Total Value</span>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>₹{selectedInvoiceDetails.totalAmount.toLocaleString()}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Total Paid</span>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#16A34A' }}>₹{(selectedInvoiceDetails.paidAmount || 0).toLocaleString()}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Outstanding</span>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#EF4444' }}>
                    ₹{(selectedInvoiceDetails.totalAmount - (selectedInvoiceDetails.paidAmount || 0)).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
            <div className="proc-modal-footer">
              <button type="button" className="proc-btn proc-btn-primary" onClick={() => setSelectedInvoiceDetails(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PO COPY PREVIEW (SAMPLE BILL) */}
      {previewPoDetails && (
        <div className="proc-modal-overlay">
          <div className="proc-modal" style={{ maxWidth: '680px', padding: '24px' }}>
            <div className="proc-modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <span className="proc-modal-title" style={{ fontSize: '14px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Purchase Order Preview</span>
              <button type="button" className="proc-close-btn" onClick={() => setPreviewPoDetails(null)}>
                ✕
              </button>
            </div>
            
            <div className="proc-modal-body" style={{ background: '#FFFFFF', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '24px', position: 'relative', overflow: 'hidden' }}>
              {/* Approval Watermark */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%) rotate(-25deg)',
                fontSize: '38px',
                fontWeight: 900,
                color: 'rgba(194, 65, 12, 0.07)',
                letterSpacing: '3px',
                pointerEvents: 'none',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                border: '4px double rgba(194, 65, 12, 0.07)',
                padding: '10px 20px',
                borderRadius: '8px'
              }}>
                Sent for Approval
              </div>

              {/* Bill Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    Curoxa Pharmacy
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', fontWeight: 500 }}>
                    102, Medical Enclave, Sector-4<br />
                    Phone: +91 98765 43210 | GSTIN: 07AAAAC1234A1Z1
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ background: '#FFF7ED', color: '#C2410C', border: '1.5px solid #FFEDD5', fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '20px', display: 'inline-block', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Sent for Approval
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#475569' }}>{previewPoDetails.poId}</div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>Date: {new Date(previewPoDetails.createdAt || Date.now()).toISOString().split('T')[0]}</div>
                </div>
              </div>

              {/* Vendor & Delivery info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', padding: '14px', background: '#F8FAFC', borderRadius: '10px', marginBottom: '20px', border: '1px solid #E2E8F0' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Vendor / Supplier</div>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A' }}>{previewPoDetails.vendorName}</div>
                  <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px', fontWeight: 500 }}>
                    Vendor ID: {previewPoDetails.vendorId}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Expected Delivery</div>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A' }}>
                    {previewPoDetails.expectedDelivery ? new Date(previewPoDetails.expectedDelivery).toISOString().split('T')[0] : '3-5 Days (Standard)'}
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E2E8F0', paddingBottom: '6px' }}>
                    <th style={{ textAlign: 'left', fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', padding: '6px 4px' }}>Product / Item</th>
                    <th style={{ textAlign: 'left', fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', padding: '6px 4px' }}>SKU</th>
                    <th style={{ textAlign: 'center', fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', padding: '6px 4px' }}>Qty</th>
                    <th style={{ textAlign: 'right', fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', padding: '6px 4px' }}>Rate</th>
                    <th style={{ textAlign: 'right', fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', padding: '6px 4px' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {previewPoDetails.items && previewPoDetails.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A', padding: '10px 4px' }}>{item.name}</td>
                      <td style={{ fontSize: '11px', color: '#475569', fontFamily: 'monospace', padding: '10px 4px' }}>{item.sku}</td>
                      <td style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A', textAlign: 'center', padding: '10px 4px' }}>{item.requiredQty || item.qty}</td>
                      <td style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A', textAlign: 'right', padding: '10px 4px' }}>₹{(item.price || 0).toLocaleString()}</td>
                      <td style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A', textAlign: 'right', padding: '10px 4px' }}>₹{(item.total || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Total calculations */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ width: '200px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>
                    <span>Subtotal</span>
                    <span>₹{previewPoDetails.totalAmount.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>
                    <span>GST (Included)</span>
                    <span>Included</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#0F172A', fontWeight: 900, borderTop: '1.5px solid #E2E8F0', paddingTop: '6px', marginTop: '4px' }}>
                    <span>Grand Total</span>
                    <span style={{ color: '#2563EB' }}>₹{previewPoDetails.totalAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="proc-modal-footer" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="proc-btn proc-btn-secondary" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }} onClick={() => window.print()}>
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print
              </button>
              <button type="button" className="proc-btn proc-btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setPreviewPoDetails(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: STRUCTURED GRN DETAILS & INSPECTION VIEW */}
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

        // Determine delivery sequence across all GRNs linked to this PO
        const relatedGrns = (goodsReceipts || [])
          .filter(g => (selectedGrnDetails.poId && (g.poId === selectedGrnDetails.poId || g._id === selectedGrnDetails.poId)) || (selectedGrnDetails.poNumber && g.poNumber === selectedGrnDetails.poNumber))
          .sort((a, b) => new Date(a.receivedDate || a.createdAt) - new Date(b.receivedDate || b.createdAt));

        const deliveryIndex = relatedGrns.findIndex(g => g._id === selectedGrnDetails._id || g.grnId === selectedGrnDetails.grnId);
        const deliveryInfo = relatedGrns.length > 0 ? {
          current: deliveryIndex >= 0 ? deliveryIndex + 1 : 1,
          total: relatedGrns.length
        } : null;

        return (
          <div className="proc-modal-overlay">
            <div className="proc-modal" style={{ maxWidth: '1020px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
              <div className="proc-modal-header" style={{ position: 'sticky', top: 0, background: '#FFFFFF', zIndex: 10 }}>
                <div>
                  <span className="proc-modal-title" style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>
                    Goods Receipt Note (GRN) Inspection
                  </span>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Verified inspection breakdown and inventory intake record</div>
                </div>
                <button type="button" className="proc-close-btn" onClick={() => setSelectedGrnDetails(null)}>
                  ✕
                </button>
              </div>

              <div className="proc-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '16px 4px' }}>
                
                {/* Header Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>GRN Identifier</span>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#059669', fontFamily: 'monospace', marginTop: '2px' }}>{selectedGrnDetails.grnId}</div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Location: {selectedGrnDetails.grnLocation || 'Main Pharmacy Store'}</div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Reference Order</span>
                      {deliveryInfo && (
                        <span style={{ 
                          fontSize: '10px', 
                          fontWeight: 850, 
                          color: '#1D4ED8', 
                          background: '#EFF6FF', 
                          border: '1px solid #BFDBFE', 
                          padding: '2px 8px', 
                          borderRadius: '12px',
                          whiteSpace: 'nowrap'
                        }}>
                          Delivery {deliveryInfo.current} of {deliveryInfo.total}
                        </span>
                      )}
                    </div>
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
                    <table className="proc-items-table" style={{ margin: 0, width: '100%', minWidth: '940px' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          <th style={{ padding: '8px 12px', fontSize: '11px' }}>Medicine / Item</th>
                          <th style={{ padding: '8px 8px', fontSize: '11px' }}>Batch / Expiry</th>
                          <th style={{ padding: '8px 6px', fontSize: '11px', textAlign: 'center' }}>Ord. Qty</th>
                          <th style={{ padding: '8px 6px', fontSize: '11px', textAlign: 'center', color: '#475569', background: '#F1F5F9' }}>Prev. Recv</th>
                          <th style={{ padding: '8px 6px', fontSize: '11px', textAlign: 'center', color: '#047857', background: '#ECFDF5' }}>Recv Qty</th>
                          <th style={{ padding: '8px 6px', fontSize: '11px', textAlign: 'center', color: '#1D4ED8', background: '#EFF6FF' }}>Balance</th>
                          <th style={{ padding: '8px 6px', fontSize: '11px', textAlign: 'center' }}>Rej. Qty</th>
                          <th style={{ padding: '8px 8px', fontSize: '11px', textAlign: 'right' }}>Rate (₹)</th>
                          <th style={{ padding: '8px 6px', fontSize: '11px', textAlign: 'center' }}>Disc %</th>
                          <th style={{ padding: '8px 6px', fontSize: '11px', textAlign: 'center' }}>GST</th>
                          <th style={{ padding: '8px 8px', fontSize: '11px', textAlign: 'right' }}>Buy Price</th>
                          <th style={{ padding: '8px 12px', fontSize: '11px', textAlign: 'right' }}>Net Total</th>
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

                          const ordQty = item.qtyOrdered !== undefined ? item.qtyOrdered : (item.orderedQty !== undefined ? item.orderedQty : '—');
                          const prevRecv = item.previouslyReceivedQty !== undefined ? item.previouslyReceivedQty : 0;
                          const balanceRemaining = item.remainingQty !== undefined 
                            ? item.remainingQty 
                            : (typeof ordQty === 'number' ? Math.max(0, ordQty - prevRecv - qty) : '—');

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
                              <td style={{ padding: '10px 6px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>
                                {ordQty}
                              </td>
                              <td style={{ padding: '10px 6px', textAlign: 'center', color: '#64748B', fontWeight: 700, background: '#F8FAFC' }}>
                                {prevRecv}
                              </td>
                              <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 900, color: '#059669', background: '#F0FDF4' }}>
                                {qty}
                              </td>
                              <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 800, color: '#1D4ED8', background: '#F8FAFC' }}>
                                {balanceRemaining}
                              </td>
                              <td style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 700, color: item.rejectedQty > 0 ? '#DC2626' : '#94A3B8' }}>
                                {item.rejectedQty || 0}
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>
                                ₹{price.toFixed(2)}
                              </td>
                              <td style={{ padding: '10px 6px', textAlign: 'center', color: '#64748B' }}>
                                {discPct}%
                              </td>
                              <td style={{ padding: '10px 6px', textAlign: 'center', color: '#64748B' }}>
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

                {/* Summary & Audit Section */}
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

              <div className="proc-modal-footer" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: '#FFFFFF', zIndex: 10, borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
                {(() => {
                  const ageMs = Date.now() - new Date(selectedGrnDetails.createdAt || selectedGrnDetails.receivedDate || Date.now()).getTime();
                  const isEditable = ageMs <= 24 * 60 * 60 * 1000;
                  return isEditable ? (
                    <button 
                      type="button" 
                      className="proc-btn" 
                      style={{ background: '#0EA5E9', color: 'white', fontWeight: 800, border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '8px 16px' }}
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
                      className="proc-btn" 
                      style={{ background: '#F1F5F9', color: '#94A3B8', fontWeight: 700, border: '1px solid #CBD5E1', borderRadius: '6px', cursor: 'not-allowed', padding: '8px 16px' }}
                      disabled
                      title="Editing period expired (24 hours from creation)"
                    >
                      Editing Period Expired
                    </button>
                  );
                })()}
                <button 
                  type="button" 
                  className="proc-btn" 
                  style={{ background: '#10B981', color: 'white', fontWeight: 800, border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '8px 16px' }}
                  onClick={() => printGRN(selectedGrnDetails, localStorage.getItem('tenantName') || 'CUROXA HEALTHCARE')}
                >
                  Download PDF
                </button>
                <button type="button" className="proc-btn proc-btn-primary" onClick={() => setSelectedGrnDetails(null)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* GRN Unified Export Modal */}
      {showGrnExportModal && (() => {
        const filteredGrns = (goodsReceipts || []).filter(grn => {
          if (!searchQuery) return true;
          const q = searchQuery.toLowerCase();
          return (grn.grnId || '').toLowerCase().includes(q) || 
                 (grn.poNumber || '').toLowerCase().includes(q) || 
                 (grn.vendorName || '').toLowerCase().includes(q) ||
                 (grn.invoiceNumber || '').toLowerCase().includes(q);
        });
        const flattenedGrnData = flattenGrnForExport(filteredGrns);

        return (
          <ExportModal
            dataset="GRNs"
            data={flattenedGrnData}
            columns={grnExportColumns}
            dateField={['receivedDate', 'grnDate', 'createdAt']}
            currentFilters={{
              search: searchQuery || ''
            }}
            clinicName={localStorage.getItem('tenantName') || 'CUROXA HEALTHCARE'}
            onClose={() => setShowGrnExportModal(false)}
            onSuccess={(result) => {
              showToast(`Exported ${result.recordCount} GRN line item(s) to ${result.fileName}!`, 'success');
            }}
          />
        );
      })()}

      {/* Purchase Orders Unified Export Modal */}
      {showPoExportModal && (() => {
        let pos = getDisplayPOs();
        if (poFilter === 'awaiting') {
          pos = pos.filter(p => ['Approved', 'Sent', 'Confirmed', 'Partially Delivered'].includes(p.status));
        } else if (poFilter === 'pending') {
          pos = pos.filter(p => p.status === 'Pending' || p.status === 'Pending Approval');
        } else if (poFilter === 'delivered') {
          pos = pos.filter(p => p.status === 'Completed');
        } else if (poFilter === 'drafts') {
          pos = pos.filter(p => p.status === 'Draft' || p.status === 'Rejected');
        }

        if (searchQuery && searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          pos = pos.filter(p => {
            const matchId = p.poId && p.poId.toLowerCase().includes(q);
            const matchVendor = p.vendorName && p.vendorName.toLowerCase().includes(q);
            const matchStatus = p.status && p.status.toLowerCase().includes(q);
            const matchItems = p.items && p.items.some(it => 
              (it.name && it.name.toLowerCase().includes(q)) || 
              (it.sku && it.sku.toLowerCase().includes(q))
            );
            return matchId || matchVendor || matchStatus || matchItems;
          });
        }

        const flattenedPoData = flattenPoForExport(pos);

        return (
          <ExportModal
            dataset="Purchase Orders"
            data={flattenedPoData}
            columns={poExportColumns}
            dateField="createdAt"
            currentFilters={{
              statusTab: poFilter,
              search: searchQuery || ''
            }}
            clinicName={localStorage.getItem('tenantName') || 'CUROXA HEALTHCARE'}
            onClose={() => setShowPoExportModal(false)}
            onSuccess={(result) => {
              showToast(`Exported ${result.recordCount} Purchase Order line(s) to ${result.fileName}!`, 'success');
            }}
          />
        );
      })()}
    </>
  );
};

export default ProcurementDashboard;
