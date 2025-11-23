// backend-customer/controllers/authController.js
const db = require("../config/database");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

const JWT_SECRET = process.env.JWT_SECRET || "indiego_art_secret_key_2025_very_secure_change_in_production";
const JWT_EXPIRE = process.env.JWT_EXPIRE || "7d";
const BASE_URL = process.env.BASE_URL || "http://192.168.13.3:5002";

/* =========================================================
   REGISTER CLIENT
========================================================= */
exports.registerClient = async (req, res) => {
  try {
    const { full_name, username, email, phone, address, password, level } = req.body;

    if (!full_name || !username || !password) {
      return res.status(400).json({
        success: false,
        message: "full_name, username, dan password wajib diisi",
      });
    }

    // Check if username already exists
    const [exists] = await db.query(
      "SELECT id FROM client WHERE username = ? LIMIT 1", 
      [username]
    );

    if (exists.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Username sudah digunakan" 
      });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Insert new client
    await db.query(
      `INSERT INTO client 
       (full_name, username, email, phone, address, level, password, role, status, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'client', 'active', 1, NOW())`,
      [
        full_name.trim(), 
        username.trim(), 
        email || null, 
        phone || null, 
        address || null, 
        level || "Topas", 
        hashed
      ]
    );

    console.log("✅ New client registered:", username);
    res.status(201).json({ 
      success: true, 
      message: "Pendaftaran berhasil! Silakan login." 
    });

  } catch (err) {
    console.error("❌ registerClient error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal mendaftar client", 
      error: err.message 
    });
  }
};

/* =========================================================
   LOGIN CLIENT
========================================================= */
exports.loginClient = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Username/email dan password wajib diisi" 
      });
    }

    // Find client by username or email
    const [rows] = await db.query(
      `SELECT * FROM client 
       WHERE (username = ? OR email = ?) 
       AND role = 'client' 
       AND status = 'active'
       LIMIT 1`,
      [username, username]
    );

    const client = rows[0];
    if (!client) {
      return res.status(400).json({ 
        success: false, 
        message: "Client tidak ditemukan" 
      });
    }

    // Verify password
    const match = await bcrypt.compare(password, client.password);
    if (!match) {
      return res.status(400).json({ 
        success: false, 
        message: "Password salah" 
      });
    }

    // Update last login
    await db.query(
      "UPDATE client SET last_login = NOW() WHERE id = ?", 
      [client.id]
    );

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: client.id, 
        username: client.username, 
        email: client.email, 
        full_name: client.full_name, 
        role: "client" 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRE }
    );

    // Remove password from response
    delete client.password;
    client.avatarUrl = client.avatar ? `${BASE_URL}${client.avatar}` : null;

    console.log("✅ Client logged in:", client.username);
    res.json({ 
      success: true, 
      data: { token, client } 
    });

  } catch (err) {
    console.error("❌ loginClient error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal login client", 
      error: err.message 
    });
  }
};

/* =========================================================
   GET PROFILE CLIENT
========================================================= */
exports.getProfile = async (req, res) => {
  try {
    const clientId = req.client?.id;

    if (!clientId) {
      return res.status(401).json({ 
        success: false, 
        message: "Authentication required" 
      });
    }

    const [rows] = await db.query(
      `SELECT id, username, full_name, email, phone, address, level, avatar, 
              coin, status, last_login, created_at, updated_at
       FROM client 
       WHERE id = ? AND role = 'client' AND deleted_at IS NULL
       LIMIT 1`,
      [clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Profile client tidak ditemukan" 
      });
    }

    const client = rows[0];
    client.avatarUrl = client.avatar ? `${BASE_URL}${client.avatar}` : null;

    console.log("✅ Profile loaded:", client.username);
    res.json({ 
      success: true, 
      data: client 
    });

  } catch (err) {
    console.error("❌ getProfile error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal mengambil profil client", 
      error: err.message 
    });
  }
};

/* =========================================================
   UPDATE PROFILE CLIENT (dengan upload avatar)
========================================================= */
exports.updateProfile = async (req, res) => {
  try {
    const clientId = req.client?.id;

    if (!clientId) {
      return res.status(401).json({ 
        success: false, 
        message: "Authentication required" 
      });
    }

    const { full_name, username, email, phone, address, level, password } = req.body;

    const updates = [];
    const values = [];

    // Handle avatar upload - delete old avatar if new one uploaded
    if (req.file) {
      const [[oldData]] = await db.query(
        "SELECT avatar FROM client WHERE id = ?", 
        [clientId]
      );

      if (oldData && oldData.avatar) {
        const oldPath = path.join(__dirname, "..", oldData.avatar);
        fs.unlink(oldPath, (err) => {
          if (err) console.warn("⚠️ Gagal hapus avatar lama:", err.message);
        });
      }

      const newAvatarPath = `/uploads/avatar/${req.file.filename}`;
      updates.push("avatar = ?");
      values.push(newAvatarPath);
    }

    // Add other fields to update
    if (full_name) { 
      updates.push("full_name = ?"); 
      values.push(full_name.trim()); 
    }
    
    if (username) { 
      updates.push("username = ?"); 
      values.push(username.trim()); 
    }
    
    if (email) { 
      updates.push("email = ?"); 
      values.push(email.trim()); 
    }
    
    if (phone !== undefined) { 
      updates.push("phone = ?"); 
      values.push(phone ? phone.trim() : ""); 
    }
    
    if (address) { 
      updates.push("address = ?"); 
      values.push(address.trim()); 
    }
    
    if (level) { 
      updates.push("level = ?"); 
      values.push(level); 
    }
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push("password = ?");
      values.push(hashedPassword);
    }

    if (updates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Tidak ada data untuk diperbarui" 
      });
    }

    // Execute update query
    const sql = `UPDATE client SET ${updates.join(", ")}, updated_at = NOW() WHERE id = ?`;
    values.push(clientId);
    await db.query(sql, values);

    // Get updated profile
    const [[updated]] = await db.query(
      "SELECT id, full_name, username, email, phone, address, level, avatar FROM client WHERE id = ?",
      [clientId]
    );

    updated.avatarUrl = updated.avatar ? `${BASE_URL}${updated.avatar}` : null;

    console.log("✅ Profile updated:", updated.username);
    res.json({ 
      success: true, 
      message: "Profil berhasil diperbarui", 
      data: updated 
    });

  } catch (err) {
    console.error("❌ updateProfile error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal update profil client", 
      error: err.message 
    });
  }
};

/* =========================================================
   GET WALLET INFO (Coin & Voucher)
========================================================= */
exports.getWalletInfo = async (req, res) => {
  try {
    const clientId = req.client?.id;

    if (!clientId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const [[wallet]] = await db.query(
      `SELECT coin, voucher FROM client WHERE id = ? AND deleted_at IS NULL`,
      [clientId]
    );

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Data wallet tidak ditemukan"
      });
    }

    res.json({
      success: true,
      data: {
        coin: wallet.coin || 0,
        voucher: wallet.voucher || ""
      }
    });

  } catch (err) {
    console.error("❌ Error getWalletInfo:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data wallet",
      error: err.message
    });
  }
};

module.exports = exports;
