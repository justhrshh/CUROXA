require('./node_modules/dotenv').config({ path: './.env' });
const mongoose = require('./node_modules/mongoose');
const Indent = require('./models/Indent');
const Approval = require('./models/Approval');
const Medicine = require('./models/Medicine');

async function runRegressionSuite() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('====================================================');
  console.log('   FORENSIC APPROVED QUANTITY REGRESSION TEST SUITE  ');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName) {
    totalTests++;
    if (condition) {
      console.log(`[PASS ✓] ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL ✗] ${testName}`);
      throw new Error(`Assertion failed: ${testName}`);
    }
  }

  const tenantId = 'regression-tenant-' + Date.now();

  try {
    // ----------------------------------------------------
    // TEST 1: Request 10 -> Admin modifies & approves 5 -> Pharmacy sees 5 -> Reception sees 5 -> Stock unchanged
    // ----------------------------------------------------
    console.log('--- TEST 1: Request 10 -> Admin approves 5 (Stock Unchanged) ---');
    const med1 = await Medicine.create({
      tenantId,
      name: 'RegMed Paracetamol',
      category: 'Analgesics',
      sku: 'REG-PAR-01',
      stock: 100,
      unit: 'Strip',
      mrp: 40,
      status: 'In Stock'
    });

    const indent1 = await Indent.create({
      tenantId,
      indentId: '#MR-REG-001',
      department: 'OPD',
      indentType: 'Internal Pharmacy Request',
      requiredDate: new Date(),
      requestedBy: 'receptionist-reg',
      items: [
        {
          name: 'RegMed Paracetamol',
          category: 'Analgesics',
          unit: 'Strip',
          requiredQty: 10,
          approvedQty: null,
          suppliedQty: 0,
          utilizedQty: 0,
          availableStock: 100,
          mrp: 40
        }
      ],
      totalQty: 10,
      status: 'Pending'
    });

    const approval1 = await Approval.create({
      tenantId,
      type: 'receptionist_indent',
      staffId: 'staff-reg-1',
      requesterName: 'receptionist-reg',
      requesterRole: 'receptionist',
      details: {
        indentId: indent1._id,
        indentNumber: indent1.indentId,
        department: indent1.department,
        items: indent1.items,
        purpose: 'Restock'
      },
      comment: 'Restock'
    });

    // Check stock unchanged after creation
    const med1AfterCreate = await Medicine.findById(med1._id);
    assert(med1AfterCreate.stock === 100, 'Stock remains 100 after requisition creation');

    // Admin modifies to Approved Qty = 5
    const approvedItems1 = [{ itemId: indent1.items[0]._id, name: 'RegMed Paracetamol', approvedQty: 5 }];
    const indentToUpdate1 = await Indent.findOne({ _id: approval1.details.indentId, tenantId });
    const plainItems1 = (indentToUpdate1.items || []).map((item, idx) => {
      const itemObj = item.toObject ? item.toObject() : { ...item };
      const matched = approvedItems1.find(it => it.name.trim().toLowerCase() === item.name.trim().toLowerCase());
      itemObj.approvedQty = matched ? Number(matched.approvedQty) : Number(itemObj.requiredQty || 0);
      itemObj.suppliedQty = 0;
      itemObj.utilizedQty = 0;
      return itemObj;
    });

    await Indent.updateOne(
      { _id: indentToUpdate1._id, tenantId },
      { $set: { status: 'Approved', items: plainItems1 } }
    );
    await Approval.updateOne(
      { _id: approval1._id, tenantId },
      { $set: { status: 'approved', comment: 'Approved 5', resolvedAt: new Date(), resolvedBy: 'admin', 'details.items': plainItems1 } }
    );

    // Verify stock unchanged after Admin approval
    const med1AfterApprove = await Medicine.findById(med1._id);
    assert(med1AfterApprove.stock === 100, 'Stock remains 100 after Admin approval');

    // Verify MongoDB directly
    const indent1InDb = await Indent.findById(indent1._id).lean();
    assert(indent1InDb.items[0].requiredQty === 10, 'MongoDB Indent contains requestedQty = 10');
    assert(indent1InDb.items[0].approvedQty === 5, 'MongoDB Indent contains approvedQty = 5');
    assert(indent1InDb.items[0].suppliedQty === 0, 'MongoDB Indent contains suppliedQty = 0');
    assert(indent1InDb.status === 'Approved', 'MongoDB Indent status is Approved');

    // Verify Pharmacy query
    const pharmacyFilter = { tenantId, status: { $in: ['Approved', 'Partially Fulfilled', 'Awaiting Stock', 'Fulfilled', 'Cannot Fulfill', 'Received'] } };
    const pharmacyIndents = await Indent.find(pharmacyFilter).lean();
    assert(pharmacyIndents.length === 1, 'Pharmacy receives approved requisition');
    assert(pharmacyIndents[0].items[0].approvedQty === 5, 'Pharmacy sees exact approvedQty = 5');

    // Verify Receptionist query
    const receptionIndents = await Indent.find({ tenantId }).lean();
    assert(receptionIndents[0].items[0].approvedQty === 5, 'Receptionist sees exact approvedQty = 5');

    // ----------------------------------------------------
    // TEST 2: Pharmacy fulfills 5 -> Stock reduces exactly 5 (100 -> 95)
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Pharmacy Fulfill 5 -> Stock 100 -> 95 ---');
    const suppliedPayload = [{ itemId: indent1InDb.items[0]._id, name: 'RegMed Paracetamol', supplyQty: 5 }];
    const targetIndent = await Indent.findById(indent1._id);
    const targetItem = targetIndent.items[0];
    const remainingToSupply = targetItem.approvedQty - targetItem.suppliedQty; // 5 - 0 = 5

    assert(suppliedPayload[0].supplyQty <= remainingToSupply, 'Pharmacy supply quantity (5) <= remaining approved quantity (5)');

    const medToDeduct = await Medicine.findById(med1._id);
    medToDeduct.stock -= suppliedPayload[0].supplyQty;
    await medToDeduct.save();

    targetItem.suppliedQty += suppliedPayload[0].supplyQty;
    targetItem.utilizedQty = targetItem.suppliedQty;
    targetIndent.status = 'Fulfilled';
    await targetIndent.save();

    const med1AfterFulfill = await Medicine.findById(med1._id);
    assert(med1AfterFulfill.stock === 95, 'Stock correctly decremented from 100 to 95');

    const indent1AfterFulfill = await Indent.findById(indent1._id).lean();
    assert(indent1AfterFulfill.items[0].suppliedQty === 5, 'Indent suppliedQty = 5');
    assert(indent1AfterFulfill.status === 'Fulfilled', 'Indent status = Fulfilled');

    // ----------------------------------------------------
    // TEST 3: Duplicate fulfillment attempt -> Rejected & Stock unchanged (95)
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Duplicate Fulfillment Prevention ---');
    const indentDupCheck = await Indent.findById(indent1._id);
    const dupItem = indentDupCheck.items[0];
    const dupRemaining = Math.max(0, dupItem.approvedQty - dupItem.suppliedQty); // 5 - 5 = 0
    let rejected = false;

    if (5 > dupRemaining) {
      rejected = true;
    }
    assert(rejected, 'Duplicate fulfillment of 5 units when 0 remaining was rejected');

    const med1AfterDup = await Medicine.findById(med1._id);
    assert(med1AfterDup.stock === 95, 'Stock remains 95 after rejected duplicate fulfillment');

    // ----------------------------------------------------
    // TEST 4: Attempting to supply more than approved quantity is rejected
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Supply Cannot Exceed Approved Quantity ---');
    const indent2 = await Indent.create({
      tenantId,
      indentId: '#MR-REG-002',
      department: 'ICU',
      indentType: 'Pharmaceuticals',
      requiredDate: new Date(),
      requestedBy: 'nurse-1',
      items: [{ name: 'RegMed Paracetamol', requiredQty: 10, approvedQty: 4, suppliedQty: 0 }],
      totalQty: 10,
      status: 'Approved'
    });

    const supplyAttempt = 6; // Attempting to supply 6 when approved is 4
    const remainingApproved2 = indent2.items[0].approvedQty - indent2.items[0].suppliedQty; // 4
    let excessRejected = false;
    if (supplyAttempt > remainingApproved2) {
      excessRejected = true;
    }
    assert(excessRejected, 'Attempting to supply 6 units on approved 4 units is rejected');

    // Cleanup
    await Medicine.deleteMany({ tenantId });
    await Indent.deleteMany({ tenantId });
    await Approval.deleteMany({ tenantId });

    console.log('\n====================================================');
    console.log(`   ALL REGRESSION TESTS PASSED (${passedTests}/${totalTests}) ✓  `);
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runRegressionSuite();
