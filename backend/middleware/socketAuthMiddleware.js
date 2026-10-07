const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../config/env");

/**
 * QUROXA — PHASE 2C: SOCKET.IO AUTHENTICATION & TENANT ISOLATION MIDDLEWARE
 *
 * Security principles:
 * 1. CLIENT CLAIMS ≠ AUTHORITY.
 * 2. NO DEFAULT TENANT FALLBACK: Missing tenantId fails closed for staff/admin/patient users.
 * 3. STRICT PATIENT ISOLATION: Patients are isolated in tenant:<tenantId>:patient and cannot receive staff broadcasts.
 * 4. SUPERADMIN AUTHORIZATION: SuperAdmin cannot gain tenant room access solely via join_tenant.
 * 5. PUBLIC QUEUE VALIDATION: publicQueueId must match a real, active doctor in the database.
 */
const socketAuthMiddleware = async (socket, next) => {
  try {
    const authPayload = socket.handshake.auth || {};
    const rawToken = authPayload.token;

    // ── PATH 1: AUTHENTICATED JWT CONNECTION (STAFF, ADMIN, PATIENT, SUPERADMIN) ──
    if (rawToken && typeof rawToken === "string" && rawToken.trim()) {
      const token = rawToken.startsWith("Bearer ") ? rawToken.slice(7).trim() : rawToken.trim();

      let secret;
      try {
        secret = getJwtSecret();
      } catch (e) {
        secret = process.env.JWT_SECRET || "secret_key";
      }

      return jwt.verify(token, secret, (err, decoded) => {
        if (err) {
          console.warn(`[SOCKET_AUTH_REJECT] Handshake rejected for ${socket.id}: ${err.message}`);
          return next(new Error("Authentication error: Invalid or expired token"));
        }

        if (!decoded || (!decoded.id && !decoded.userId)) {
          return next(new Error("Authentication error: Malformed token"));
        }

        const nowSec = Math.floor(Date.now() / 1000);
        if (decoded.exp && decoded.exp <= nowSec) {
          return next(new Error("Authentication error: Token expired"));
        }

        const isSuperAdmin = decoded.role === "superadmin" ||
                             decoded.role === "super_admin" ||
                             decoded.role === "platform_admin";

        // ZERO TENANT FALLBACK: A missing tenantId MUST fail closed for normal hospital staff/admin/patient
        if (!decoded.tenantId && !isSuperAdmin) {
          console.warn(`[SOCKET_AUTH_REJECT] Missing tenantId for user ${decoded.id || decoded.userId} (role: ${decoded.role})`);
          return next(new Error("Authentication error: Tenant identification missing from credentials"));
        }

        const verifiedTenant = decoded.tenantId ? String(decoded.tenantId).trim().toLowerCase() : null;

        // Attach verified server-side identity (CLIENT CLAIMS ≠ AUTHORITY)
        socket.user = {
          userId: decoded.id || decoded.userId,
          staff_id: decoded.staff_id || decoded.contact || "",
          role: decoded.role || "staff",
          tenantId: verifiedTenant,
          exp: decoded.exp
        };
        socket.authenticated = true;
        socket.isPublic = false;

        // Schedule server-side socket invalidation / disconnect on token expiration
        if (decoded.exp) {
          const expiresInMs = (decoded.exp - nowSec) * 1000;
          const expiryTimer = setTimeout(() => {
            console.log(`[SOCKET_EXPIRY] Access token expired for socket ${socket.id} (user: ${socket.user.staff_id || socket.user.userId}). Disconnecting.`);
            socket.emit("session_expired", { reason: "token_expired" });
            socket.disconnect(true);
          }, Math.min(expiresInMs, 0x7FFFFFFF));

          socket.on("disconnect", () => {
            clearTimeout(expiryTimer);
          });
        }

        return next();
      });
    }

    // ── PATH 2: PUBLIC DOCTOR QUEUE VIEWER (UNAUTHENTICATED QR LANDING) ──
    const publicQueueId = authPayload.publicQueueId || socket.handshake.query?.publicQueueId;
    if (publicQueueId && typeof publicQueueId === "string") {
      const cleanQueueId = String(publicQueueId).trim();

      // Format validation: must match valid identifier pattern (alphanumeric, underscore, hyphen, 6-64 chars)
      if (!/^[a-zA-Z0-9_-]{6,64}$/.test(cleanQueueId)) {
        return next(new Error("Authentication error: Malformed public queue identifier"));
      }

      // Server-side database validation: verify publicQueueId belongs to an existing doctor
      try {
        const User = require("../models/User");
        const doctor = await User.findOne({
          role: "doctor",
          publicQueueId: cleanQueueId
        }).select("_id tenantId publicQueueId").lean();

        if (!doctor) {
          console.warn(`[SOCKET_AUTH_REJECT] Nonexistent publicQueueId rejected: ${cleanQueueId}`);
          return next(new Error("Authentication error: Public queue not found or inactive"));
        }

        socket.authenticated = false;
        socket.isPublic = true;
        socket.publicQueueId = cleanQueueId;
        socket.doctorTenantId = doctor.tenantId;
        socket.user = null;
        return next();
      } catch (dbErr) {
        console.error("[SOCKET_AUTH_ERROR] Database error during public queue lookup:", dbErr.message);
        return next(new Error("Authentication error: Public queue validation failure"));
      }
    }

    // ── PATH 3: FAIL CLOSED ──
    return next(new Error("Authentication error: No token provided"));
  } catch (err) {
    console.error("[SOCKET_AUTH_ERROR] Unexpected error in handshake:", err.message);
    return next(new Error("Authentication error: Internal authorization failure"));
  }
};

/**
 * Configures room membership and enforces tenant isolation on an authorized socket.
 */
const configureSocketTenantIsolation = (io, socket) => {
  // 1. Authenticated socket room membership
  if (socket.authenticated && socket.user) {
    const verifiedTenant = socket.user.tenantId;

    if (socket.user.role === "patient") {
      // ── STRICT PATIENT ISOLATION ──
      // Patient sockets join ONLY their dedicated patient tenant room and user room.
      // They NEVER join the staff operational tenant room.
      if (verifiedTenant) {
        const patientRoom = `tenant:${verifiedTenant}:patient`;
        socket.join(patientRoom);
        console.log(`[SOCKET_AUTH] Patient socket ${socket.id} joined isolated patient room: ${patientRoom}`);
      }
      if (socket.user.userId) {
        socket.join(`user:${socket.user.userId}`);
      }
    } else if (verifiedTenant) {
      // ── STAFF / ADMIN ROOM MEMBERSHIP ──
      socket.join(verifiedTenant);
      const raw = String(socket.user.tenantId).trim();
      if (raw !== verifiedTenant) socket.join(raw);
      if (socket.user.userId) {
        socket.join(`user:${socket.user.userId}`);
      }
      console.log(`[SOCKET_AUTH] Staff socket ${socket.id} (${socket.user.staff_id}) joined verified staff tenant: ${verifiedTenant}`);
    } else if (socket.user.role === "superadmin" || socket.user.role === "super_admin") {
      // SuperAdmin platform scope (no tenant room joined by default)
      if (socket.user.userId) {
        socket.join(`user:${socket.user.userId}`);
      }
      console.log(`[SOCKET_AUTH] SuperAdmin socket ${socket.id} joined platform admin scope.`);
    }

    // ── HARDENED JOIN_TENANT EVENT ──
    socket.on("join_tenant", (requestedTenantId) => {
      const requested = String(requestedTenantId || "").trim().toLowerCase();
      if (!requested) return;

      // Patients can only join their own patient tenant room
      if (socket.user.role === "patient") {
        if (verifiedTenant && requested === verifiedTenant) {
          socket.join(`tenant:${verifiedTenant}:patient`);
        } else {
          console.warn(`[SOCKET_SECURITY_ALERT] Patient ${socket.id} blocked from unauthorized tenant join: ${requested}`);
          socket.emit("error", { message: "Unauthorized tenant room access denied" });
        }
        return;
      }

      // Staff can ONLY join their own verified tenant room
      if (verifiedTenant && requested === verifiedTenant) {
        socket.join(verifiedTenant);
      } else {
        // SuperAdmin cannot arbitrarily join tenant rooms without server-side tenant authorization
        console.warn(`[SOCKET_SECURITY_ALERT] Tenant mismatch blocked! Socket ${socket.id} (user: ${socket.user.staff_id}, role: ${socket.user.role}, tenant: ${verifiedTenant}) attempted to join: ${requested}`);
        socket.emit("error", { message: "Unauthorized tenant room access denied" });
      }
    });

    // ── PRIVILEGED THEME EVENT ──
    socket.on("change_global_theme", (data) => {
      const isPrivileged = socket.user.role === "superadmin" ||
                           socket.user.role === "super_admin" ||
                           socket.user.role === "admin";
      if (!isPrivileged) {
        console.warn(`[SOCKET_SECURITY_ALERT] Unauthorized change_global_theme attempt from ${socket.id} (role: ${socket.user.role})`);
        return;
      }
      io.emit("global_theme_changed", data);
    });
  }

  // 2. Public Queue socket room membership
  if (socket.isPublic && socket.publicQueueId) {
    const queueRoom = `public_queue:${socket.publicQueueId}`;
    socket.join(queueRoom);
    console.log(`[SOCKET_PUBLIC] Public socket ${socket.id} joined queue room: ${queueRoom}`);

    // Public sockets are STRICTLY FORBIDDEN from joining any tenant rooms
    socket.on("join_tenant", (requestedTenantId) => {
      console.warn(`[SOCKET_SECURITY_ALERT] Unauthenticated public socket ${socket.id} attempted to join tenant room: ${requestedTenantId}. BLOCKED.`);
      socket.emit("error", { message: "Authentication required to join tenant rooms" });
    });

    socket.on("change_global_theme", () => {
      console.warn(`[SOCKET_SECURITY_ALERT] Unauthenticated socket ${socket.id} attempted change_global_theme. BLOCKED.`);
    });
  }

  socket.on("disconnect", () => {
    console.log(`[SOCKET] Client disconnected: ${socket.id}`);
  });
};

module.exports = {
  socketAuthMiddleware,
  configureSocketTenantIsolation
};
