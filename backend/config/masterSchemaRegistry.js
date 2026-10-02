/**
 * QUROXA — SUPER ADMIN MASTER SCHEMA REGISTRY
 *
 * Source of Truth: Client Excel Workbook ("master structure.xlsx")
 * Version: Phase 1 Final Verified Registry
 *
 * Principles:
 * 1. [CLIENT-DEFINITION]: Preserves exact Excel worksheet names, column letters, headers,
 *    and unconfirmed statuses without inventing or altering fields.
 * 2. [SYSTEM-CONFIGURATION]: Supplies normalized internal keys, input types, and operational flags.
 * 3. [PRODUCT-REQUIREMENT]: Declares top-level platform categories (e.g., Radiology) while marking
 *    unconfirmed client specifications as SOURCE-CONFIRMATION-REQUIRED.
 * 4. [PRICING-ISOLATION]: Distinguishes GLOBAL_CANONICAL fields from HOSPITAL_SPECIFIC pricing fields.
 */

const MASTER_SCHEMA_REGISTRY = {
  // =========================================================================
  // 1. LAB OPERATION (Sheet: "Lab Operation" | 24 Columns)
  // =========================================================================
  "Lab Operation": {
    categoryName: "Lab Operation",
    excelSheet: "Lab Operation",
    hasDepartment: true,
    status: "CONFIRMED",
    sharedFields: [
      { clientHeader: "S.No", fieldKey: "sNo", excelColumn: "A", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: true, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Category", fieldKey: "category", excelColumn: "B", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: "CLIENT_CONFIRMED", allowedValues: ["Lab Operation"], defaultSource: "SAMPLE_VALUE", defaultValue: "Lab Operation", readOnly: true, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Department", fieldKey: "department", excelColumn: "C", inputType: "select", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: "CLIENT_CONFIRMED", allowedValues: ["Biochemistry", "Hematology", "Serology", "Molecular Biology", "Immunology", "Histopathology", "Microbiology", "Clinical Pathology", "Flowcytometry", "Cytology", "Immunohistochemistry", "Special Biochemistry", "Miscellaneous"], defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "itemTypeName", fieldKey: "itemTypeName", excelColumn: "D", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["Calibrator"], defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ItemCode", fieldKey: "itemCode", excelColumn: "E", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: "99", pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ItemName", fieldKey: "itemName", excelColumn: "F", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Description", fieldKey: "description", excelColumn: "G", inputType: "textarea", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Specification", fieldKey: "specification", excelColumn: "H", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "MakeandModelNo", fieldKey: "makeandModelNo", excelColumn: "I", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "HSNCode", fieldKey: "hsnCode", excelColumn: "J", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Expirable", fieldKey: "expirable", excelColumn: "K", inputType: "select", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["Yes", "No"], defaultSource: "SAMPLE_VALUE", defaultValue: "Yes", readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ExpiryDateCutoff", fieldKey: "expiryDateCutoff", excelColumn: "L", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: "SAMPLE_VALUE", defaultValue: 0, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "GSTNTax", fieldKey: "gstnTax", excelColumn: "M", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: [0, 5, 12, 18, 28], defaultSource: "SAMPLE_VALUE", defaultValue: 5, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ManufactureID", fieldKey: "manufactureId", excelColumn: "N", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ManufactureName", fieldKey: "manufactureName", excelColumn: "O", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "CatalogNo", fieldKey: "catalogNo", excelColumn: "P", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "MachineID", fieldKey: "machineId", excelColumn: "Q", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "MachineName", fieldKey: "machineName", excelColumn: "R", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "PurchasedUnit", fieldKey: "purchasedUnit", excelColumn: "S", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["PAC", "SET"], defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Converter", fieldKey: "converter", excelColumn: "T", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: "SAMPLE_VALUE", defaultValue: 1, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "PackSize", fieldKey: "packSize", excelColumn: "U", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ConsumptionUnit", fieldKey: "consumptionUnit", excelColumn: "V", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["PAC", "SET"], defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "IssueMultiplier", fieldKey: "issueMultiplier", excelColumn: "W", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: "SAMPLE_VALUE", defaultValue: 0, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Status", fieldKey: "status", excelColumn: "X", inputType: "select", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["Active", "Inactive"], defaultSource: "SAMPLE_VALUE", defaultValue: "Active", readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" }
    ],
    departments: {
      "Biochemistry": { additionalFields: [] },
      "Hematology": { additionalFields: [] },
      "Serology": { additionalFields: [] },
      "Molecular Biology": { additionalFields: [] },
      "Immunology": { additionalFields: [] },
      "Histopathology": { additionalFields: [] },
      "Microbiology": { additionalFields: [] },
      "Clinical Pathology": { additionalFields: [] },
      "Flowcytometry": { additionalFields: [] },
      "Cytology": { additionalFields: [] },
      "Immunohistochemistry": { additionalFields: [] },
      "Special Biochemistry": { additionalFields: [] },
      "Miscellaneous": { additionalFields: [] }
    }
  },

  // =========================================================================
  // 2. PHARMACY (Sheet: "Pharmacy" | 25 Columns)
  // =========================================================================
  "Pharmacy": {
    categoryName: "Pharmacy",
    excelSheet: "Pharmacy",
    hasDepartment: true,
    status: "CONFIRMED",
    sharedFields: [
      { clientHeader: "S.No", fieldKey: "sNo", excelColumn: "A", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: true, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Category", fieldKey: "category", excelColumn: "B", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: "CLIENT_CONFIRMED", allowedValues: ["Pharmacy"], defaultSource: "SAMPLE_VALUE", defaultValue: "Pharmacy", readOnly: true, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Department", fieldKey: "department", excelColumn: "C", inputType: "select", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: "CLIENT_CONFIRMED", allowedValues: ["Medicine"], defaultSource: "SAMPLE_VALUE", defaultValue: "Medicine", readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "itemTypeName", fieldKey: "itemTypeName", excelColumn: "D", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["Antibiotic", "antipyretic"], defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Dosage Form", fieldKey: "dosageForm", excelColumn: "E", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["Liquid", "Tablet", "Capsule", "Syrup", "Injection"], defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Strength", fieldKey: "strength", excelColumn: "F", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ManufactureName", fieldKey: "manufactureName", excelColumn: "G", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ItemCode", fieldKey: "itemCode", excelColumn: "H", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: "98", pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ItemName", fieldKey: "itemName", excelColumn: "I", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Generic Name", fieldKey: "genericName", excelColumn: "J", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Description", fieldKey: "description", excelColumn: "K", inputType: "textarea", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Usage Details", fieldKey: "usageDetails", excelColumn: "L", inputType: "textarea", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "HSNCode", fieldKey: "hsnCode", excelColumn: "M", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Expirable", fieldKey: "expirable", excelColumn: "N", inputType: "select", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["Yes", "No"], defaultSource: "SAMPLE_VALUE", defaultValue: "Yes", readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ExpiryDateCutoff", fieldKey: "expiryDateCutoff", excelColumn: "O", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: "SAMPLE_VALUE", defaultValue: 0, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "GSTNTax", fieldKey: "gstnTax", excelColumn: "P", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: [0, 5, 12, 18, 28], defaultSource: "SAMPLE_VALUE", defaultValue: 5, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "CatalogNo", fieldKey: "catalogNo", excelColumn: "Q", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "PurchasedUnit", fieldKey: "purchasedUnit", excelColumn: "R", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["PAC", "SET"], defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Converter", fieldKey: "converter", excelColumn: "S", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: "SAMPLE_VALUE", defaultValue: 1, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "PackSize", fieldKey: "packSize", excelColumn: "T", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ConsumptionUnit", fieldKey: "consumptionUnit", excelColumn: "U", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["PAC", "SET"], defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "IssueMultiplier", fieldKey: "issueMultiplier", excelColumn: "V", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: "SAMPLE_VALUE", defaultValue: 0, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Required Prescription", fieldKey: "requiredPrescription", excelColumn: "W", inputType: "select", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["Yes", "No"], defaultSource: "SAMPLE_VALUE", defaultValue: "Yes", readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Rack_Location", fieldKey: "rackLocation", excelColumn: "X", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Image URL", fieldKey: "imageUrl", excelColumn: "Y", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" }
    ],
    departments: {
      "Medicine": { additionalFields: [] }
    }
  },

  // =========================================================================
  // 3. PATHOLOGY (Sheet: "Pathology" | 12 Columns)
  // =========================================================================
  "Pathology": {
    categoryName: "Pathology",
    excelSheet: "Pathology",
    hasDepartment: true,
    status: "CONFIRMED",
    sharedFields: [
      { clientHeader: "S.No", fieldKey: "sNo", excelColumn: "A", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: true, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Category", fieldKey: "category", excelColumn: "B", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: "CLIENT_CONFIRMED", allowedValues: ["Pathology"], defaultSource: "SAMPLE_VALUE", defaultValue: "Pathology", readOnly: true, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "itemTypeName", fieldKey: "itemTypeName", excelColumn: "C", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["Packages", "Profile", "Observation", "Calibrator"], defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Department", fieldKey: "department", excelColumn: "D", inputType: "select", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: "CLIENT_CONFIRMED", allowedValues: ["Biochemistry", "Hematology", "Serology", "Molecular Biology", "Immunology", "OPD Package", "Histopathology", "Microbiology", "Clinical Pathology", "Flowcytometry", "Cytology", "Immunohistochemistry", "Special Biochemistry", "Miscellaneous", "Xray", "Ultrasonography"], defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ItemCode", fieldKey: "itemCode", excelColumn: "E", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: "95", pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ItemName", fieldKey: "itemName", excelColumn: "F", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Description", fieldKey: "description", excelColumn: "G", inputType: "textarea", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Sample Type", fieldKey: "sampleType", excelColumn: "H", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["Serum", "Whole Blood", "Urine", "CSF"], defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Gender", fieldKey: "gender", excelColumn: "I", inputType: "select", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["Male", "Female", "Both"], defaultSource: "SAMPLE_VALUE", defaultValue: "Both", readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Sample Option", fieldKey: "sampleOption", excelColumn: "J", inputType: "select", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["Required", "Not required"], defaultSource: "SAMPLE_VALUE", defaultValue: "Required", readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "MRP ", fieldKey: "mrp", excelColumn: "K", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "HOSPITAL_SPECIFIC" },
      { clientHeader: "Net Rate", fieldKey: "netRate", excelColumn: "L", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "HOSPITAL_SPECIFIC" }
    ],
    departments: {
      "Biochemistry": { additionalFields: [] },
      "Hematology": { additionalFields: [] },
      "Serology": { additionalFields: [] },
      "Molecular Biology": { additionalFields: [] },
      "Immunology": { additionalFields: [] },
      "OPD Package": { additionalFields: [] },
      "Histopathology": { additionalFields: [] },
      "Microbiology": { additionalFields: [] },
      "Clinical Pathology": { additionalFields: [] },
      "Flowcytometry": { additionalFields: [] },
      "Cytology": { additionalFields: [] },
      "Immunohistochemistry": { additionalFields: [] },
      "Special Biochemistry": { additionalFields: [] },
      "Miscellaneous": { additionalFields: [] },
      "Xray": { additionalFields: [] },
      "Ultrasonography": { additionalFields: [] }
    }
  },

  // =========================================================================
  // 4. SERVICE (Sheet: "Service" | 8 Columns)
  // Note: Doctors Name and Doctor ID headers are preserved exactly as in Excel.
  // Both are clientRequired: 'UNCONFIRMED' and systemRequired: false.
  // =========================================================================
  "Service": {
    categoryName: "Service",
    excelSheet: "Service",
    hasDepartment: true,
    status: "CONFIRMED",
    sharedFields: [
      { clientHeader: "S.No", fieldKey: "sNo", excelColumn: "A", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: true, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Category", fieldKey: "category", excelColumn: "B", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: "CLIENT_CONFIRMED", allowedValues: ["Service"], defaultSource: "SAMPLE_VALUE", defaultValue: "Service", readOnly: true, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Department", fieldKey: "department", excelColumn: "C", inputType: "select", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: "CLIENT_CONFIRMED", allowedValues: ["OPD"], defaultSource: "SAMPLE_VALUE", defaultValue: "OPD", readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "itemTypeName", fieldKey: "itemTypeName", excelColumn: "D", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["General Physician", "Cardiologist", "Orthopadic", "Opthopadic", "Eyes", "Dental", "ENT", "Surgery", "Physician", "Physiotherapy", "Ayurvedic", "Homeopathic", "Calibrator", "SKIN SPECIALIST", "OTHERS"], defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Doctors Name", fieldKey: "doctorsName", excelColumn: "E", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: "94", pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Doctor ID", fieldKey: "doctorId", excelColumn: "F", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "MRP", fieldKey: "mrp", excelColumn: "G", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "HOSPITAL_SPECIFIC" },
      { clientHeader: "Net Rate", fieldKey: "netRate", excelColumn: "H", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "HOSPITAL_SPECIFIC" }
    ],
    departments: {
      "OPD": { additionalFields: [] }
    }
  },

  // =========================================================================
  // 5. ASSETS (Sheet: "Asset" | 15 Columns | Department Genuinely Absent)
  // =========================================================================
  "Assets": {
    categoryName: "Assets",
    excelSheet: "Asset",
    hasDepartment: false,
    status: "CONFIRMED",
    sharedFields: [
      { clientHeader: "S.No", fieldKey: "sNo", excelColumn: "A", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: true, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Category", fieldKey: "category", excelColumn: "B", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: "CLIENT_CONFIRMED", allowedValues: ["Assets"], defaultSource: "SAMPLE_VALUE", defaultValue: "Assets", readOnly: true, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "itemTypeName", fieldKey: "itemTypeName", excelColumn: "C", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["One Time Purchase", "Non Movable"], defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ItemCode", fieldKey: "itemCode", excelColumn: "D", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: "73", pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ItemName", fieldKey: "itemName", excelColumn: "E", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: true, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Description", fieldKey: "description", excelColumn: "F", inputType: "textarea", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "HSNCode", fieldKey: "hsnCode", excelColumn: "G", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Expirable", fieldKey: "expirable", excelColumn: "H", inputType: "select", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["Yes", "No"], defaultSource: "SAMPLE_VALUE", defaultValue: "Yes", readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ExpiryDateCutoff", fieldKey: "expiryDateCutoff", excelColumn: "I", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: "SAMPLE_VALUE", defaultValue: 0, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "GSTNTax", fieldKey: "gstnTax", excelColumn: "J", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: [0, 5, 12, 18, 28], defaultSource: "SAMPLE_VALUE", defaultValue: 5, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "ManufactureName", fieldKey: "manufactureName", excelColumn: "K", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "PurchasedUnit", fieldKey: "purchasedUnit", excelColumn: "L", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: ["PAC", "SET"], defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "Converter", fieldKey: "converter", excelColumn: "M", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: "SAMPLE_VALUES_ONLY", allowedValues: [1], defaultSource: "SAMPLE_VALUE", defaultValue: 1, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "PackSize", fieldKey: "packSize", excelColumn: "N", inputType: "text", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "GLOBAL_CANONICAL" },
      { clientHeader: "MRP", fieldKey: "mrp", excelColumn: "O", inputType: "number", clientRequired: "UNCONFIRMED", systemRequired: false, optionsSource: null, allowedValues: null, defaultSource: null, defaultValue: null, readOnly: false, codePrefix: null, pricingScope: "HOSPITAL_SPECIFIC" }
    ],
    departments: {}
  },

  // =========================================================================
  // 6. RADIOLOGY (Product Requirement — Pending Client Source)
  // =========================================================================
  "Radiology": {
    categoryName: "Radiology",
    excelSheet: null,
    hasDepartment: true,
    status: "SOURCE-CONFIRMATION-REQUIRED",
    sharedFields: [],
    departments: {}
  }
};

/**
 * Helper: Retrieve category definition
 */
function getCategoryConfig(category) {
  if (!category) return null;
  return MASTER_SCHEMA_REGISTRY[category] || null;
}

/**
 * Helper: Retrieve all fields applicable to Category + Department
 * Merges sharedFields with department-level additionalFields
 */
function getDepartmentFields(category, department) {
  const catConfig = getCategoryConfig(category);
  if (!catConfig) return [];
  const fields = [...(catConfig.sharedFields || [])];
  if (catConfig.hasDepartment && department && catConfig.departments && catConfig.departments[department]) {
    const deptExtra = catConfig.departments[department].additionalFields || [];
    fields.push(...deptExtra);
  }
  return fields;
}

/**
 * Helper: Get list of all available top-level categories
 */
function getAllCategories() {
  return Object.keys(MASTER_SCHEMA_REGISTRY).map(catKey => {
    const cat = MASTER_SCHEMA_REGISTRY[catKey];
    const deptList = cat.hasDepartment ? Object.keys(cat.departments || {}) : [];
    return {
      name: cat.categoryName,
      categoryName: cat.categoryName,
      excelSheet: cat.excelSheet,
      hasDepartment: cat.hasDepartment,
      status: cat.status,
      fieldCount: (cat.sharedFields || []).length,
      departments: deptList,
      departmentList: deptList
    };
  });
}

/**
 * Helper: Validate an Excel column header against the registry
 */
function isColumnValidForCategory(category, department, columnHeader) {
  const fields = getDepartmentFields(category, department);
  if (!fields || fields.length === 0) return false;
  const cleanHeader = String(columnHeader || '').trim().toLowerCase();
  return fields.some(f => f.clientHeader.trim().toLowerCase() === cleanHeader || f.fieldKey.toLowerCase() === cleanHeader);
}

module.exports = {
  MASTER_SCHEMA_REGISTRY,
  getCategoryConfig,
  getDepartmentFields,
  getAllCategories,
  isColumnValidForCategory
};
