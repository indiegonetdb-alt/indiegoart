// backend-customer/controllers/clientController.js
// 📋 CONTROLLER INI HANYA UNTUK CRUD CLIENT (ADMIN FUNCTIONS)
// 🔐 Auth functions sudah dipindah ke authController.js

const db = require("../config/database");
const BASE_URL = process.env.BASE_URL || "http://192.168.13.3:5002";

/* =========================================================
   GET ALL CLIENTS (ADMIN)
========================================================= */
exports.getAllClients = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, full_name, username, email, phone, address, level, avatar,
              coin, status, is_active, last_login, created_at
       FROM client 
       WHERE role = 'client' AND deleted_at IS NULL
       ORDER BY created_at DESC`
    );

    // Add full avatar URL
    rows.forEach(r => {
      r.avatarUrl = r.avatar ? `${BASE_URL}${r.avatar}` : null;
    });

    res.json({ 
      success: true, 
      data: rows,
      count: rows.length 
    });

  } catch (err) {
    console.error("❌ getAllClients error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal mengambil data client", 
      error: err.message 
    });
  }
};

/* =========================================================
   GET CLIENT BY ID (ADMIN)
========================================================= */
exports.getClientById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, full_name, username, email, phone, address, level, avatar, 
              coin, status, is_active, last_login, created_at, updated_at
       FROM client 
       WHERE id = ? AND role = 'client' AND deleted_at IS NULL`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Client tidak ditemukan" 
      });
    }

    const client = rows[0];
    client.avatarUrl = client.avatar ? `${BASE_URL}${client.avatar}` : null;

    res.json({ 
      success: true, 
      data: client 
    });

  } catch (err) {
    console.error("❌ getClientById error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal mengambil client", 
      error: err.message 
    });
  }
};

/* =========================================================
   UPDATE CLIENT (ADMIN)
========================================================= */
exports.updateClient = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, phone, address, status, level } = req.body;

    // Check if client exists
    const [exists] = await db.query(
      "SELECT id FROM client WHERE id = ? AND role = 'client' AND deleted_at IS NULL",
      [id]
    );

    if (exists.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Client tidak ditemukan"
      });
    }

    // Update client data
    await db.query(
      `UPDATE client 
       SET full_name = ?, email = ?, phone = ?, address = ?, status = ?, level = ?, updated_at = NOW()
       WHERE id = ? AND role = 'client'`,
      [full_name, email, phone, address, status, level, id]
    );

    console.log("✅ Client updated by admin:", id);
    res.json({ 
      success: true, 
      message: "Client berhasil diperbarui" 
    });

  } catch (err) {
    console.error("❌ updateClient error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal memperbarui client", 
      error: err.message 
    });
  }
};

/* =========================================================
   DELETE CLIENT (SOFT DELETE - ADMIN)
========================================================= */
exports.deleteClient = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if client exists
    const [exists] = await db.query(
      "SELECT id FROM client WHERE id = ? AND role = 'client' AND deleted_at IS NULL",
      [id]
    );

    if (exists.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Client tidak ditemukan"
      });
    }

    // Soft delete (set deleted_at)
    await db.query(
      "UPDATE client SET deleted_at = NOW() WHERE id = ? AND role = 'client'", 
      [id]
    );

    console.log("✅ Client deleted by admin:", id);
    res.json({ 
      success: true, 
      message: "Client berhasil dihapus" 
    });

  } catch (err) {
    console.error("❌ deleteClient error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal menghapus client", 
      error: err.message 
    });
  }
};

module.exports = exports;
