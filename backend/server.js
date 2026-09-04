const express = require("express");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
// Backend updated for Pharmacy Procurement Phase 1B

const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const patientRoutes = require("./routes/patientRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const prescriptionRoutes = require("./routes/prescriptionRoutes");
const labRoutes = require("./routes/labRoutes");
const labInventoryRoutes = require("./routes/labInventoryRoutes");
const billingRoutes = require("./routes/billingRoutes");
const medicineRoutes = require("./routes/medicineRoutes");
const indentRoutes = require("./routes/indentRoutes");
const permissionRoutes = require("./routes/permissions");
const approvalRoutes = require("./routes/approvals");
const auditLogRoutes = require("./routes/auditLogs");
const vendorRoutes = require("./routes/vendorRoutes");
const purchaseOrderRoutes = require("./routes/purchaseOrderRoutes");
const goodsReceiptRoutes = require("./routes/goodsReceiptRoutes");
const hrRoutes = require("./routes/hrRoutes");
const returnRoutes = require("./routes/returnRoutes");
const superAdminRoutes = require("./routes/superAdminRoutes");
const emrRoutes = require("./routes/emrRoutes");
const labTestRoutes = require("./routes/labTestRoutes");
const pharmacyTicketRoutes = require("./routes/pharmacyTicketRoutes");
const clinicalServiceRoutes = require("./routes/clinicalServiceRoutes");
const pharmacySaleRoutes = require("./routes/pharmacySaleRoutes");
const inventoryExpiryRoutes = require("./routes/inventoryExpiryRoutes");

const app = express();
const PORT = process.env.PORT || 5000;
// Trust proxy so rate limiters see correct client IPs behind reverse proxies
app.set("trust proxy", 1);

// 1. CORS FIRST — Ensures every request/response (including preflights & errors) has CORS headers
const corsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-tenant-id',
    'x-bypass-consent-emergency',
    'Cache-Control',
    'Pragma',
    'Expires',
    'x-requested-with',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['Content-Disposition']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Connect to MongoDB
connectDB();

// Stateful in-memory store for login attempts
const ipAttempts = new Map();

// Cleanup old entries periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, state] of ipAttempts.entries()) {
    if (now - state.lastAttemptTime > 15 * 60 * 1000) {
      ipAttempts.delete(ip);
    }
  }
}, 10 * 60 * 1000);

const authLimiter = (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  let state = ipAttempts.get(ip);
  if (!state) {
    state = {
      consecutiveFailures: 0,
      lockoutCount: 0,
      lockoutUntil: 0,
      lastAttemptTime: Date.now()
    };
    ipAttempts.set(ip, state);
  }

  // If the IP has been idle for more than 15 minutes, reset state
  if (Date.now() - state.lastAttemptTime > 15 * 60 * 1000) {
    state.consecutiveFailures = 0;
    state.lockoutCount = 0;
    state.lockoutUntil = 0;
  }

  // Check if currently locked out
  if (Date.now() < state.lockoutUntil) {
    const remainingSec = Math.ceil((state.lockoutUntil - Date.now()) / 1000);
    let unit = "seconds";
    let value = remainingSec;
    if (remainingSec >= 60) {
      value = Math.ceil(remainingSec / 60);
      unit = value === 1 ? "minute" : "minutes";
    }
    return res.status(429).json({
      error: `Too many failed login attempts. Please try again after ${value} ${unit}.`
    });
  }

  // Intercept response to track successes and failures
  res.on("finish", () => {
    const currentState = ipAttempts.get(ip);
    if (!currentState) return;

    currentState.lastAttemptTime = Date.now();

    if (res.statusCode >= 200 && res.statusCode < 300) {
      // Success: Reset failures and lockout count
      currentState.consecutiveFailures = 0;
      currentState.lockoutCount = 0;
      currentState.lockoutUntil = 0;
    } else if (res.statusCode === 401 || res.statusCode === 400) {
      // Failed login attempt (Invalid credentials / client error)
      currentState.consecutiveFailures += 1;

      if (currentState.consecutiveFailures >= 5) {
        let blockDuration = 30 * 1000; // 30 seconds for 1st lockout
        if (currentState.lockoutCount === 1) {
          blockDuration = 60 * 1000; // 1 minute for 2nd lockout
        } else if (currentState.lockoutCount >= 2) {
          blockDuration = 5 * 60 * 1000; // 5 minutes for subsequent lockouts
        }

        currentState.lockoutUntil = Date.now() + blockDuration;
        currentState.lockoutCount += 1;
        currentState.consecutiveFailures = 0; // reset count for next cycle
      }
    }
  });

  next();
};

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // Limit each IP to 300 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" }
});

// Middleware — compression first so all downstream JSON responses are gzipped
app.use(compression());



// Security middlewares (allow cross-origin requests from Render frontend)
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  contentSecurityPolicy: false
}));
app.use(mongoSanitize());

// Apply rate limits
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/google-login", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/verify-otp", authLimiter);
app.use("/api", apiLimiter);

app.use(express.json({ limit: "2mb" }));

const path = require("path");
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Lightweight cache hints for safe GET endpoints (per-tenant data)
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.includes("/auth/")) {
    if (req.path.startsWith("/api/") || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache') {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    } else {
      res.set("Cache-Control", "private, max-age=15");
    }
  }
  next();
});

const { checkModule } = require("./middleware/subscriptionMiddleware");

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/patients", checkModule(["reception", "doctor"]), patientRoutes);
app.use("/api/appointments", checkModule(["reception", "doctor"]), appointmentRoutes);
app.use("/api/prescriptions", checkModule(["doctor", "pharmacy", "reception"]), prescriptionRoutes);
app.use("/api/labs", checkModule("laboratory"), labRoutes);
app.use("/api/lab-tests", checkModule("laboratory"), labTestRoutes);
app.use("/api/lab-inventory", checkModule("laboratory"), labInventoryRoutes);
app.use("/api/billing", checkModule("reception"), billingRoutes);
app.use("/api/medicines", checkModule(["pharmacy", "doctor"]), medicineRoutes);
app.use("/api/indents", checkModule("inventory"), indentRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/approvals", approvalRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/vendors", checkModule("inventory"), vendorRoutes);
app.use("/api/purchase-orders", checkModule("inventory"), purchaseOrderRoutes);
app.use("/api/goods-receipts", checkModule("inventory"), goodsReceiptRoutes);
app.use("/api/hr", hrRoutes);
app.use("/api/returns", checkModule("inventory"), returnRoutes);
app.use("/api/superadmin", superAdminRoutes);
app.use("/api/emr", checkModule("doctor"), emrRoutes);
app.use("/api/clinical-services", checkModule(["doctor", "reception"]), clinicalServiceRoutes);
app.use("/api/pharmacy-tickets", checkModule("pharmacy"), pharmacyTicketRoutes);
app.use("/api/pharmacy-sales", checkModule("pharmacy"), pharmacySaleRoutes);

app.use("/api/inventory-expiry", checkModule(["pharmacy", "inventory"]), inventoryExpiryRoutes);

const portalRoutes = require("./routes/portalRoutes");
app.use("/api/public/portal", portalRoutes);

// Create HTTP server and initialize socket.io
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: corsOptions.origin,
    methods: ["GET", "POST"]
  }
});

// Set io instance on app so it can be retrieved in routes
app.set("io", io);

io.on("connection", (socket) => {
  console.log(`[SOCKET] Client connected: ${socket.id}`);

  socket.on("join_tenant", (tenantId) => {
    if (tenantId) {
      const room = String(tenantId).trim().toLowerCase();
      socket.join(room);
      const rawRoom = String(tenantId).trim();
      if (rawRoom !== room) {
        socket.join(rawRoom);
      }
      console.log(`[SOCKET] Client ${socket.id} joined tenant room(s): ${room} / ${rawRoom}`);
    }
  });

  socket.on("change_global_theme", (data) => {
    console.log("[SOCKET] Global theme change broadcast:", data);
    io.emit("global_theme_changed", data);
  });

  socket.on("disconnect", () => {
    console.log(`[SOCKET] Client disconnected: ${socket.id}`);
  });
});

// Basic route for testing
app.get("/", (req, res) => {
  res.send("Curoxa API is running...");
});

app.get("/api/debug-db", async (req, res) => {
  try {
    const User = require("./models/User");
    const Patient = require("./models/Patient");
    const Appointment = require("./models/Appointment");
    const Billing = require("./models/Billing");
    const users = await User.find({});
    const patients = await Patient.find({});
    const appointments = await Appointment.find({});
    const bills = await Billing.find({});
    res.json({ users, patients, appointments, bills });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  try {
    const { startLeaveBackgroundScheduler } = require('./services/leaveScheduler');
    startLeaveBackgroundScheduler();
  } catch (e) {
    console.warn('[LeaveScheduler] Initialization notice:', e.message);
  }
});
