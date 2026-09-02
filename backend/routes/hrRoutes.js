const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");
const LeaveRequest = require("../models/LeaveRequest");
const AttendanceRecord = require("../models/AttendanceRecord");
const Asset = require("../models/Asset");
const User = require("../models/User");
const { verifyToken } = require("../middleware/authMiddleware");

// Helper: tenant-specific auto-seeder for leaves, attendance, and assets
const seedIfNeeded = async (tenantId) => {
  try {
    // Seed Leave Requests - Disabled to avoid mock data
    const leaveCount = await LeaveRequest.countDocuments({ tenantId });
    if (leaveCount === 0) {
      // Do not seed any mock leave requests
    }


    // Seed Assets
    const assetCount = await Asset.countDocuments({ tenantId });
    if (assetCount === 0) {
      await Asset.create([
        {
          tenantId,
          assetName: 'Lenovo ThinkPad L14 (EMR Node)',
          category: 'Laptop',
          serialNumber: 'LT-887201-X',
          assignedTo: 'Dr. Sarah Jenkins',
          assignedDate: '2021-03-20',
          status: 'Active',
          value: 65000
        },
        {
          tenantId,
          assetName: 'RFID Hospital Proximity Access Card',
          category: 'Access Card',
          serialNumber: 'RFID-N-0012',
          assignedTo: 'Marcus Vance',
          assignedDate: '2022-06-01',
          status: 'Active',
          value: 500
        },
        {
          tenantId,
          assetName: 'Staff Identity Badge and lanyard',
          category: 'ID Card',
          serialNumber: 'RFID-R-0032',
          assignedTo: 'Emily Rose',
          assignedDate: '2023-01-10',
          status: 'Active',
          value: 150
        },
        {
          tenantId,
          assetName: 'Welch Allyn Digital Blood Pressure Monitor',
          category: 'Medical Equipment',
          serialNumber: 'BP-MON-771',
          status: 'Active',
          value: 12000
        },
        {
          tenantId,
          assetName: 'Dell 24 UltraSharp IPS Monitor',
          category: 'Monitor',
          serialNumber: 'DSK-9921',
          status: 'Active',
          value: 18000
        }
      ]);
    }
  } catch (err) {
    console.error("Auto seeding error:", err);
  }
};

/**
 * POST /api/hr/notify-leave
 * Sends an email notification when a leave request is approved or rejected.
 *
 * Body: { employeeName, employeeEmail, leaveType, fromDate, toDate, days, status, approverName }
 */
router.post("/notify-leave", async (req, res) => {
  const { employeeName, employeeEmail, leaveType, fromDate, toDate, days, status, approverName } = req.body;

  if (!employeeEmail || !status) {
    return res.status(400).json({ error: "employeeEmail and status are required" });
  }

  // Determine colour accent for the email
  const isApproved = status.toLowerCase() === "approved";
  const statusColor = isApproved ? "#10B981" : "#EF4444";
  const statusLabel = isApproved ? "Approved" : "Rejected";
  const statusEmoji = isApproved ? "✅" : "❌";

  const subject = `${statusEmoji} Leave ${statusLabel} — ${leaveType || "Leave"} (${fromDate} to ${toDate})`;

  const htmlBody = `
    <div style="font-family:'Segoe UI',Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#1E293B 0%,#334155 100%);padding:28px 32px;">
        <h1 style="margin:0;color:white;font-size:20px;font-weight:800;letter-spacing:-0.3px;">Curoxa HR</h1>
        <p style="margin:4px 0 0 0;color:#94A3B8;font-size:12px;font-weight:600;">Leave Notification</p>
      </div>
      <div style="padding:28px 32px;">
        <p style="margin:0 0 20px 0;color:#334155;font-size:14px;line-height:1.6;">
          Hello <strong>${employeeName || "Team Member"}</strong>,
        </p>
        <div style="background:#F8FAFC;border-radius:10px;padding:20px;border-left:4px solid ${statusColor};margin-bottom:20px;">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:${statusColor};margin-bottom:8px;">
            ${statusLabel}
          </div>
          <div style="font-size:15px;font-weight:700;color:#0F172A;margin-bottom:12px;">
            ${leaveType || "Leave"} Request — ${days || "N/A"} day${days > 1 ? "s" : ""}
          </div>
          <table style="width:100%;font-size:13px;color:#475569;border-collapse:collapse;">
            <tr><td style="padding:4px 0;font-weight:600;">From</td><td style="padding:4px 0;">${fromDate || "—"}</td></tr>
            <tr><td style="padding:4px 0;font-weight:600;">To</td><td style="padding:4px 0;">${toDate || "—"}</td></tr>
            <tr><td style="padding:4px 0;font-weight:600;">${isApproved ? "Approved" : "Reviewed"} by</td><td style="padding:4px 0;">${approverName || "HR Manager"}</td></tr>
          </table>
        </div>
        <p style="margin:0;color:#64748B;font-size:12px;line-height:1.5;">
          This is an automated notification from the Curoxa HR Portal. If you believe this is an error, please contact your HR administrator.
        </p>
      </div>
      <div style="background:#F8FAFC;padding:16px 32px;border-top:1px solid #E2E8F0;text-align:center;">
        <span style="color:#94A3B8;font-size:11px;font-weight:600;">© ${new Date().getFullYear()} Curoxa — Sunrise Clinic</span>
      </div>
    </div>
  `;

  // Send notification via unified email service
  try {
    const { sendEmail } = require('../utils/emailService');
    const result = await sendEmail({
      to: employeeEmail,
      subject,
      html: htmlBody
    });
    if (result.success) {
      console.log(`[HR] Leave ${statusLabel} email sent to ${employeeEmail}`);
      return res.json({ success: true, message: `Notification sent to ${employeeEmail}` });
    }
  } catch (emailErr) {
    console.error("[HR] Notification email failed:", emailErr.message);
  }

  // If both fail, still return 200 — the leave was processed, email is best-effort
  return res.status(200).json({ success: false, message: "Leave processed but email notification could not be sent." });
});

const {
  normalizeLeaveType,
  isEmployeeEligibleForLeaveType,
  getTenantStartYear,
  getLeavePolicy,
  updateLeavePolicy,
  getStaffLeaveBalance,
  initializeYearForStaff,
  initializeYearForTenant,
  accrueMonthlyLeaves,
  processLeaveApproval,
  processLeaveRejectionOrCancellation
} = require("../services/leaveService");

router.get("/leaves", verifyToken, async (req, res) => {
  try {
    await seedIfNeeded(req.tenantId);
    // Delete any legacy mock leave requests so they do not show up
    await LeaveRequest.deleteMany({
      tenantId: req.tenantId,
      employeeName: { $in: ['Marcus Vance', 'Emily Rose', 'Kevin Smith'] }
    });

    const isManager = req.user && (req.user.role === 'admin' || req.user.role === 'hr' || req.user.role === 'superadmin');
    const query = { tenantId: req.tenantId };
    
    if (!isManager) {
      const userStaffId = req.user.staff_id || req.user.userId || req.user.id;
      query.$or = [
        { employeeId: userStaffId },
        { employeeName: req.user.name }
      ];
    } else if (req.query.staff_id || req.query.employeeId) {
      query.employeeId = req.query.staff_id || req.query.employeeId;
    }

    const leaves = await LeaveRequest.find(query).sort({ createdAt: -1 });
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/leaves", verifyToken, async (req, res) => {
  try {
    const isManager = req.user && (req.user.role === 'admin' || req.user.role === 'hr' || req.user.role === 'superadmin');
    
    // Security: Derive authenticated identity for staff
    const employeeId = (!isManager || !req.body.employeeId) 
      ? (req.user.staff_id || req.user.userId || req.user.id) 
      : String(req.body.employeeId).trim();
      
    const employeeName = (!isManager || !req.body.employeeName) 
      ? (req.user.name || 'Staff Member') 
      : String(req.body.employeeName).trim();
      
    const department = req.body.department || req.user.department || req.user.dept || 'General';

    const { fromDate, toDate, reason, halfDay } = req.body;

    // Validation 1: Valid date presence
    if (!fromDate || !toDate) {
      return res.status(400).json({ error: "Start date and End date are required." });
    }

    // Validation 2: Date order check
    const start = new Date(fromDate);
    const end = new Date(toDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid date format provided." });
    }
    if (fromDate > toDate) {
      return res.status(400).json({ error: "Start date cannot be after End date." });
    }

    // Validation: Tenant operational start year check
    const targetYear = start.getFullYear() || new Date().getFullYear();
    const tenantStartYear = await getTenantStartYear(req.tenantId);
    if (targetYear < tenantStartYear || end.getFullYear() < tenantStartYear) {
      return res.status(400).json({
        error: `Cannot apply for leave in year ${targetYear} prior to hospital start year (${tenantStartYear}).`
      });
    }

    // Validation 3: Days calculation & > 0 check
    let days = Number(req.body.days);
    if (isNaN(days) || days <= 0) {
      const diffTime = Math.abs(end - start);
      days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }
    if (halfDay) {
      days = 0.5;
    }
    if (days <= 0) {
      return res.status(400).json({ error: "Requested days must be greater than 0." });
    }

    // Validation 4: Leave type policy validation
    const norm = normalizeLeaveType(req.body.leaveType || req.body.type);
    const policy = await getLeavePolicy(req.tenantId);
    const policyType = policy.leaveTypes.find(
      lt => lt.code === norm.code || lt.leaveType.toLowerCase() === norm.leaveType.toLowerCase()
    );

    if (!policyType || !policyType.enabled) {
      return res.status(400).json({ error: `Leave type "${norm.leaveType}" is not enabled in clinic policy.` });
    }

    // Validation: Gender / Employee eligibility check
    const isObjId = typeof employeeId === 'string' && employeeId.length === 24 && /^[0-9a-fA-F]+$/.test(employeeId);
    const empUser = await User.findOne({
      tenantId: req.tenantId,
      $or: [
        { staff_id: employeeId },
        ...(isObjId ? [{ _id: employeeId }] : [])
      ]
    }).lean();
    const empGender = empUser?.gender || req.user.gender || '';
    if (empGender && !isEmployeeEligibleForLeaveType(norm.leaveType, empGender)) {
      return res.status(400).json({ error: `Employee is not eligible for ${norm.leaveType}.` });
    }

    // Validation 5: Overlapping conflict check
    const conflict = await LeaveRequest.findOne({
      tenantId: req.tenantId,
      employeeId,
      status: { $in: ['Pending', 'Approved'] },
      $or: [
        { fromDate: { $lte: toDate }, toDate: { $gte: fromDate } }
      ]
    });

    if (conflict) {
      return res.status(400).json({
        error: `Conflicting ${conflict.status.toLowerCase()} leave exists from ${conflict.fromDate} to ${conflict.toDate}.`
      });
    }

    // Validation 6: Balance check for balance-controlled leave types
    if (policyType.paid && norm.code !== 'LWP') {
      const balanceData = await getStaffLeaveBalance(req.tenantId, employeeId, targetYear);
      const balanceInfo = balanceData.balances[policyType.leaveType] || balanceData.balances[norm.leaveType];
      const available = balanceInfo ? balanceInfo.currentBalance : 0;
      
      if (days > available) {
        return res.status(400).json({
          error: `Insufficient ${norm.leaveType} balance. Requested: ${days} day(s), Available: ${available} day(s).`
        });
      }
    }

    const desiredStatus = isManager && req.body.status === 'Approved' ? 'Approved' : 'Pending';

    const leave = await LeaveRequest.create({
      tenantId: req.tenantId,
      employeeId,
      employeeName,
      department,
      leaveType: norm.leaveType,
      fromDate,
      toDate,
      days,
      reason: reason || '',
      status: desiredStatus,
      appliedDate: new Date().toISOString().split('T')[0],
      approvedBy: desiredStatus === 'Approved' ? (req.user.name || 'HR Manager') : undefined,
      approvedDate: desiredStatus === 'Approved' ? new Date().toISOString().split('T')[0] : undefined
    });

    // If approved directly by manager, record debit transaction
    if (leave.status === 'Approved') {
      await processLeaveApproval(req.tenantId, leave, req.user?.name || 'HR Administrator');
    }

    // Emit real-time synchronization
    const io = req.app.get("socketio");
    if (io) {
      io.to(req.tenantId).emit("data_changed", { type: "leaves", employeeId });
    }

    res.status(201).json(leave);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/leaves/:id", verifyToken, async (req, res) => {
  try {
    const prevLeave = await LeaveRequest.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!prevLeave) {
      return res.status(404).json({ error: "Leave request not found." });
    }

    const isManager = req.user && (req.user.role === 'admin' || req.user.role === 'hr' || req.user.role === 'superadmin');
    const targetStatus = req.body.status;

    // 1. Regular staff permissions check
    if (!isManager) {
      const userStaffId = req.user.staff_id || req.user.userId || req.user.id;
      if (prevLeave.employeeId !== userStaffId) {
        return res.status(403).json({ error: "Unauthorized to modify this leave request." });
      }
      if (targetStatus && targetStatus !== 'Cancelled') {
        return res.status(403).json({ error: "Staff can only cancel their own pending leave requests." });
      }
      if (prevLeave.status !== 'Pending') {
        return res.status(400).json({ error: `Cannot cancel a leave request that is already ${prevLeave.status.toLowerCase()}.` });
      }
    }

    // 2. Manager Approval Flow
    if (targetStatus === 'Approved') {
      if (prevLeave.status === 'Approved') {
        return res.status(409).json({ error: "This leave request has already been approved." });
      }
      if (prevLeave.status === 'Rejected') {
        return res.status(400).json({ error: "Cannot approve a rejected leave request." });
      }
      if (prevLeave.status === 'Cancelled') {
        return res.status(400).json({ error: "Cannot approve a cancelled leave request." });
      }
      if (prevLeave.status !== 'Pending') {
        return res.status(400).json({ error: "Only pending leave requests can be approved." });
      }

      // Process authoritative debit and balance revalidation
      try {
        await processLeaveApproval(req.tenantId, prevLeave, req.user?.name || 'HR Administrator');
      } catch (debitErr) {
        return res.status(400).json({ error: debitErr.message });
      }

      // Update request state
      const updatedLeave = await LeaveRequest.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenantId, status: 'Pending' },
        { 
          $set: { 
            status: 'Approved',
            approvedBy: req.user?.name || 'HR Administrator',
            approvedDate: new Date().toISOString().split('T')[0]
          } 
        },
        { returnDocument: 'after' }
      );

      if (!updatedLeave) {
        // Handled race condition: request was concurrently modified
        return res.status(409).json({ error: "This leave request has already been processed." });
      }

      // Send Staff Notification Email (best-effort, non-blocking)
      (async () => {
        try {
          const emp = await User.findOne({ tenantId: req.tenantId, staff_id: updatedLeave.employeeId }, 'name email').lean();
          if (emp && emp.email) {
            const { sendEmail } = require('../utils/emailService');
            await sendEmail({
              to: emp.email,
              subject: `✅ Leave Approved — ${updatedLeave.leaveType} (${updatedLeave.fromDate} to ${updatedLeave.toDate})`,
              html: `<p>Hello <strong>${emp.name}</strong>,</p><p>Your request for <strong>${updatedLeave.days} day(s)</strong> of <strong>${updatedLeave.leaveType}</strong> from ${updatedLeave.fromDate} to ${updatedLeave.toDate} has been <strong>Approved</strong> by ${req.user?.name || 'HR Manager'}.</p>`
            });
          }
        } catch (mailErr) {
          console.warn('[HR] Email notification failed (non-blocking):', mailErr.message);
        }
      })();

      // Emit real-time synchronization
      const io = req.app.get("socketio");
      if (io) {
        io.to(req.tenantId).emit("data_changed", { type: "leaves", employeeId: updatedLeave.employeeId, action: "approved" });
      }

      return res.json(updatedLeave);
    }

    // 3. Manager Rejection Flow
    if (targetStatus === 'Rejected') {
      if (prevLeave.status === 'Approved') {
        return res.status(400).json({ error: "Cannot reject an already approved leave request." });
      }
      if (prevLeave.status === 'Cancelled') {
        return res.status(400).json({ error: "Cannot reject a cancelled leave request." });
      }
      if (prevLeave.status !== 'Pending') {
        return res.status(400).json({ error: "Only pending leave requests can be rejected." });
      }

      const updatedLeave = await LeaveRequest.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenantId, status: 'Pending' },
        { 
          $set: { 
            status: 'Rejected',
            approvedBy: req.user?.name || 'HR Administrator',
            approvedDate: new Date().toISOString().split('T')[0],
            rejectionReason: req.body.rejectionReason || req.body.comments || req.body.reason || ''
          } 
        },
        { returnDocument: 'after' }
      );

      if (!updatedLeave) {
        return res.status(409).json({ error: "This leave request has already been processed." });
      }

      // Send Staff Notification Email (best-effort, non-blocking)
      (async () => {
        try {
          const emp = await User.findOne({ tenantId: req.tenantId, staff_id: updatedLeave.employeeId }, 'name email').lean();
          if (emp && emp.email) {
            const { sendEmail } = require('../utils/emailService');
            await sendEmail({
              to: emp.email,
              subject: `❌ Leave Rejected — ${updatedLeave.leaveType} (${updatedLeave.fromDate} to ${updatedLeave.toDate})`,
              html: `<p>Hello <strong>${emp.name}</strong>,</p><p>Your request for <strong>${updatedLeave.days} day(s)</strong> of <strong>${updatedLeave.leaveType}</strong> from ${updatedLeave.fromDate} to ${updatedLeave.toDate} has been <strong>Rejected</strong> by ${req.user?.name || 'HR Manager'}.</p>${updatedLeave.rejectionReason ? `<p><em>Reason: ${updatedLeave.rejectionReason}</em></p>` : ''}`
            });
          }
        } catch (mailErr) {
          console.warn('[HR] Email notification failed (non-blocking):', mailErr.message);
        }
      })();

      // Emit real-time synchronization
      const io = req.app.get("socketio");
      if (io) {
        io.to(req.tenantId).emit("data_changed", { type: "leaves", employeeId: updatedLeave.employeeId, action: "rejected" });
      }

      return res.json(updatedLeave);
    }

    // 4. Staff Cancellation Flow
    if (targetStatus === 'Cancelled') {
      const updatedLeave = await LeaveRequest.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenantId, status: 'Pending' },
        { $set: { status: 'Cancelled' } },
        { returnDocument: 'after' }
      );

      if (!updatedLeave) {
        return res.status(409).json({ error: "This leave request has already been processed." });
      }

      const io = req.app.get("socketio");
      if (io) {
        io.to(req.tenantId).emit("data_changed", { type: "leaves", employeeId: updatedLeave.employeeId, action: "cancelled" });
      }

      return res.json(updatedLeave);
    }

    // 5. Generic update for managers
    const leave = await LeaveRequest.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: req.body },
      { returnDocument: 'after' }
    );

    const io = req.app.get("socketio");
    if (io) {
      io.to(req.tenantId).emit("data_changed", { type: "leaves", employeeId: leave.employeeId });
    }

    res.json(leave);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/leaves/:id", verifyToken, async (req, res) => {
  try {
    const leave = await LeaveRequest.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (leave && leave.status === 'Approved') {
      await processLeaveRejectionOrCancellation(req.tenantId, leave, req.user?.name || 'HR Manager');
    }
    await LeaveRequest.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    
    const io = req.app.get("socketio");
    if (io) {
      io.to(req.tenantId).emit("data_changed", { type: "leaves" });
    }

    res.json({ message: "Leave deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Leave Policy REST Endpoints
router.get("/leave-policy", verifyToken, async (req, res) => {
  try {
    const policy = await getLeavePolicy(req.tenantId);
    const tenantStartYear = await getTenantStartYear(req.tenantId);
    res.json({
      ...(policy ? policy.toObject() : {}),
      tenantStartYear
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/leave-policy", verifyToken, async (req, res) => {
  try {
    const policy = await updateLeavePolicy(req.tenantId, req.body, req.user?.name || 'HR Administrator');
    
    const io = req.app.get("socketio");
    if (io) {
      io.to(req.tenantId).emit("data_changed", { type: "leaves" });
    }

    res.json(policy);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Leave Balances (Authoritative yearly calculation)
router.get("/leave-balances", verifyToken, async (req, res) => {
  try {
    const isManager = req.user && (req.user.role === 'admin' || req.user.role === 'hr' || req.user.role === 'superadmin');
    const year = Number(req.query.year) || new Date().getFullYear();
    let staffId = req.query.staff_id || req.query.employeeId;

    if (!isManager) {
      staffId = req.user.staff_id || req.user.userId || req.user.id;
    }

    if (staffId) {
      const balance = await getStaffLeaveBalance(req.tenantId, staffId, year);
      return res.json(balance);
    }

    const employees = await User.find({ tenantId: req.tenantId }, 'staff_id name email department').lean();
    const allBalances = await Promise.all(
      employees.map(async emp => {
        const empId = emp.staff_id || emp._id.toString();
        const b = await getStaffLeaveBalance(req.tenantId, empId, year);
        return {
          employeeId: empId,
          employeeName: emp.name,
          department: emp.department,
          ...b
        };
      })
    );
    res.json(allBalances);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Leave Ledger / Audit Trail
router.get("/leave-ledger", verifyToken, async (req, res) => {
  try {
    const isManager = req.user && (req.user.role === 'admin' || req.user.role === 'hr' || req.user.role === 'superadmin');
    const year = Number(req.query.year) || new Date().getFullYear();
    let staffId = req.query.staff_id || req.query.employeeId;

    if (!isManager) {
      staffId = req.user.staff_id || req.user.userId || req.user.id;
    }

    const LeaveLedger = require("../models/LeaveLedger");
    const query = { tenantId: req.tenantId, year };
    if (staffId) {
      query.employeeId = staffId;
    }

    let empGender = '';
    if (staffId) {
      const isObjId = typeof staffId === 'string' && staffId.length === 24 && /^[0-9a-fA-F]+$/.test(staffId);
      const empUser = await User.findOne({
        tenantId: req.tenantId,
        $or: [
          { staff_id: staffId },
          ...(isObjId ? [{ _id: staffId }] : [])
        ]
      }).lean();
      empGender = empUser?.gender || req.user?.gender || '';
    }

    const ledger = await LeaveLedger.find(query).sort({ createdAt: -1 }).lean();
    const filteredLedger = empGender
      ? ledger.filter(entry => isEmployeeEligibleForLeaveType(entry.leaveType, empGender))
      : ledger;

    res.json(filteredLedger);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger Monthly Accrual
router.post("/leave-accrual", verifyToken, async (req, res) => {
  try {
    const year = Number(req.body.year) || new Date().getFullYear();
    const month = Number(req.body.month) || (new Date().getMonth() + 1);
    const staffId = req.body.staff_id || req.body.employeeId || null;

    const result = await accrueMonthlyLeaves(req.tenantId, year, month, staffId, req.user?.name || 'HR Administrator');
    
    const io = req.app.get("socketio");
    if (io) {
      io.to(req.tenantId).emit("data_changed", { type: "leaves" });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger Year Initialization
router.post("/leave-year-init", verifyToken, async (req, res) => {
  try {
    const year = Number(req.body.year) || new Date().getFullYear();
    const staffId = req.body.staff_id || req.body.employeeId || null;

    let result;
    if (staffId) {
      result = await initializeYearForStaff(req.tenantId, staffId, year, req.user?.name || 'HR Administrator');
    } else {
      result = await initializeYearForTenant(req.tenantId, year, req.user?.name || 'HR Administrator');
    }

    const io = req.app.get("socketio");
    if (io) {
      io.to(req.tenantId).emit("data_changed", { type: "leaves" });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Attendance Record REST API
router.get("/attendance", verifyToken, async (req, res) => {
  try {
    await seedIfNeeded(req.tenantId);
    // Delete any previously seeded mock attendance records so they don't show up
    await AttendanceRecord.deleteMany({
      tenantId: req.tenantId,
      employeeName: { $in: ['Dr. Sarah Jenkins', 'Marcus Vance', 'Emily Rose'] }
    });
    const records = await AttendanceRecord.find({ tenantId: req.tenantId });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/attendance", verifyToken, async (req, res) => {
  try {
    const { employeeId, date } = req.body;
    const record = await AttendanceRecord.findOneAndUpdate(
      { tenantId: req.tenantId, employeeId, date },
      { $set: req.body },
      { upsert: true, returnDocument: 'after' }
    );
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Assets REST API
router.get("/assets", verifyToken, async (req, res) => {
  try {
    await seedIfNeeded(req.tenantId);
    const assets = await Asset.find({ tenantId: req.tenantId });
    res.json(assets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/assets", verifyToken, async (req, res) => {
  try {
    const asset = await Asset.create({
      ...req.body,
      tenantId: req.tenantId
    });
    res.status(201).json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/assets/:id", verifyToken, async (req, res) => {
  try {
    const asset = await Asset.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: req.body },
      { returnDocument: 'after' }
    );
    res.json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/assets/:id", verifyToken, async (req, res) => {
  try {
    await Asset.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    res.json({ message: "Asset deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get logged in employee's profile
router.get("/profile/me", verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.user.id || req.user._id, tenantId: req.tenantId });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add document to user
router.post("/users/:id/documents", verifyToken, async (req, res) => {
  try {
    const { category, title, fileName, fileData, fileType } = req.body;
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      {
        $push: {
          documents: {
            category,
            title,
            fileName,
            fileData,
            fileType,
            uploadedAt: new Date(),
            uploadedBy: req.user.name || req.user.staff_id || "HR Manager"
          }
        }
      },
      { returnDocument: 'after' }
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete document from user
router.delete("/users/:id/documents/:docId", verifyToken, async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      {
        $pull: {
          documents: { _id: req.params.docId }
        }
      },
      { returnDocument: 'after' }
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Generate payslip and push to employee's documents
router.post("/payslips", verifyToken, async (req, res) => {
  try {
    const { employeeId, month, baseSalary, allowances, deductions, tax, netPay } = req.body;
    
    const user = await User.findOne({ _id: employeeId, tenantId: req.tenantId });
    if (!user) return res.status(404).json({ error: "Employee not found" });

    // Generate HTML Data URL
    const htmlContent = `
      <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #1e293b; background-color: #ffffff; }
          .container { max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05); }
          .header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 20px; }
          .hospital-name { font-size: 24px; font-weight: 800; color: #1e3a8a; letter-spacing: -0.025em; }
          .slip-title { font-size: 14px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 4px; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 30px; font-size: 13px; }
          .meta-item { background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #f1f5f9; }
          .meta-label { color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
          .meta-value { font-weight: 600; color: #0f172a; }
          .table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
          .table th, .table td { padding: 12px 16px; text-align: left; }
          .table th { background-color: #f8fafc; color: #475569; font-weight: 700; border-bottom: 2px solid #e2e8f0; }
          .table td { border-bottom: 1px solid #f1f5f9; color: #334155; }
          .table tr.total-row td { font-weight: 800; font-size: 15px; color: #1e3a8a; background-color: #eff6ff; border-top: 2px solid #3b82f6; border-bottom: 2px solid #3b82f6; }
          .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="hospital-name">Curoxa Medical Center</div>
            <div class="slip-title">Salary Disbursement Advice</div>
          </div>
          <div class="meta-grid">
            <div class="meta-item">
              <div class="meta-label">Employee Details</div>
              <div class="meta-value">${user.name}</div>
              <div class="meta-value" style="font-size: 11px; color: #64748b; font-weight: 400; margin-top: 2px;">ID: ${user.staff_id}</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Statement Period</div>
              <div class="meta-value">${month}</div>
              <div class="meta-value" style="font-size: 11px; color: #64748b; font-weight: 400; margin-top: 2px;">Issued: ${new Date().toLocaleDateString()}</div>
            </div>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>Earnings & Deductions Component</th>
                <th style="text-align: right;">Amount (INR)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Basic Salary Base</td>
                <td style="text-align: right; font-family: monospace;">${Number(baseSalary).toFixed(2)}</td>
              </tr>
              <tr>
                <td>Allowances & Reimbursements</td>
                <td style="text-align: right; font-family: monospace; color: #16a34a;">+${Number(allowances).toFixed(2)}</td>
              </tr>
              <tr>
                <td>Custom Deductions</td>
                <td style="text-align: right; font-family: monospace; color: #dc2626;">-${Number(deductions).toFixed(2)}</td>
              </tr>
              <tr>
                <td>Professional Income Tax (10%)</td>
                <td style="text-align: right; font-family: monospace; color: #dc2626;">-${Number(tax).toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td>Net Take-Home Remuneration</td>
                <td style="text-align: right; font-family: monospace;">${Number(netPay).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <div class="footer">
            This is a system-generated electronic document. Signature not required.
          </div>
        </div>
      </body>
      </html>
    `;
    const base64Data = "data:text/html;base64," + Buffer.from(htmlContent).toString('base64');

    user.documents.push({
      category: 'salary_slips',
      title: `Payslip - ${month}`,
      fileName: `payslip_${month.replace(/\s+/g, '_').toLowerCase()}.html`,
      fileData: base64Data,
      fileType: 'text/html',
      uploadedAt: new Date(),
      uploadedBy: req.user.name || req.user.staff_id || "HR Manager"
    });

    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Doctor Availability Check API
// Used by Patient and Receptionist dashboards to verify doctor availability on a given date
const DEFAULT_TIME_SLOTS = [
  '09:00 AM - 09:30 AM', '09:30 AM - 10:00 AM', '10:00 AM - 10:30 AM',
  '10:30 AM - 11:00 AM', '11:00 AM - 11:30 AM', '11:30 AM - 12:00 PM',
  '12:00 PM - 12:30 PM', '12:30 PM - 01:00 PM', '02:00 PM - 02:30 PM',
  '02:30 PM - 03:00 PM', '03:00 PM - 03:30 PM', '03:30 PM - 04:00 PM',
  '04:00 PM - 04:30 PM', '04:30 PM - 05:00 PM', '05:00 PM - 05:30 PM'
];

router.get("/doctor-availability/:doctorId", verifyToken, async (req, res) => {
  try {
    const doctor = await User.findById(req.params.doctorId);
    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const dateStr = req.query.date; // YYYY-MM-DD
    const slots = doctor.doctorSlots && doctor.doctorSlots.length > 0 ? doctor.doctorSlots : DEFAULT_TIME_SLOTS;

    // Check weekly off
    if (dateStr) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayOfWeek = dayNames[new Date(dateStr + 'T00:00:00').getDay()];
      const isWeeklyOff = Array.isArray(doctor.weeklyOff)
        ? doctor.weeklyOff.includes(dayOfWeek)
        : typeof doctor.weeklyOff === 'string'
          ? doctor.weeklyOff.split(',').map(d => d.trim()).includes(dayOfWeek)
          : dayOfWeek === (doctor.weeklyOff || 'Sunday');

      if (isWeeklyOff) {
        const weeklyOffStr = Array.isArray(doctor.weeklyOff) 
          ? doctor.weeklyOff.join(', ') 
          : (doctor.weeklyOff || 'Sunday');
        return res.json({ available: false, slots, reason: 'Weekly Off', weeklyOff: weeklyOffStr });
      }

      // Check approved leave for this date
      const approvedLeave = await LeaveRequest.findOne({
        employeeId: { $in: [doctor._id.toString(), doctor.staff_id] },
        status: 'Approved',
        fromDate: { $lte: dateStr },
        toDate: { $gte: dateStr }
      });

      if (approvedLeave) {
        return res.json({ available: false, slots, reason: 'On Leave', leaveType: approvedLeave.leaveType });
      }
    }

    res.json({ available: true, slots, reason: null, weeklyOff: doctor.weeklyOff });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
