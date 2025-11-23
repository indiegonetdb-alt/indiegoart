// backend-customer/controllers/RewardController.js
const db = require("../config/database");

// ======================================================
// ?? GET COIN BALANCE
// ======================================================
exports.getCoinBalance = async (req, res) => {
  try {
    const clientId = req.client.id;

    const [client] = await db.query(
      "SELECT coin, full_name, level FROM client WHERE id = ?",
      [clientId]
    );

    if (client.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Client tidak ditemukan",
      });
    }

    // Get coin value from rules
    const [rules] = await db.query(
      "SELECT coin_value FROM coin_rules LIMIT 1"
    );

    const coinValue = rules.length > 0 ? rules[0].coin_value : 800;
    const coinBalance = client[0].coin || 0;
    const rupiahValue = coinBalance * coinValue;

    res.json({
      success: true,
      data: {
        coin_balance: coinBalance,
        coin_value: coinValue,
        rupiah_value: rupiahValue,
        client_name: client[0].full_name,
        level: client[0].level,
      },
    });
  } catch (err) {
    console.error("? Error getCoinBalance:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil saldo coin",
      error: err.message,
    });
  }
};

// ======================================================
// ?? GET COIN HISTORY
// ======================================================
exports.getCoinHistory = async (req, res) => {
  try {
    const clientId = req.client.id;
    const { limit = 50, offset = 0 } = req.query;

    const [history] = await db.query(
      `SELECT 
        ch.*,
        o.order_code,
        o.total as order_total
       FROM coin_history ch
       LEFT JOIN orders o ON ch.order_id = o.id
       WHERE ch.client_id = ?
       ORDER BY ch.created_at DESC
       LIMIT ? OFFSET ?`,
      [clientId, parseInt(limit), parseInt(offset)]
    );

    const [total] = await db.query(
      "SELECT COUNT(*) as count FROM coin_history WHERE client_id = ?",
      [clientId]
    );

    res.json({
      success: true,
      data: history,
      total: total[0].count,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (err) {
    console.error("? Error getCoinHistory:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil riwayat coin",
      error: err.message,
    });
  }
};

// ======================================================
// ?? CALCULATE COIN DISCOUNT (Preview)
// ======================================================
exports.calculateCoinDiscount = async (req, res) => {
  try {
    const clientId = req.client.id;
    const { coins_to_use, total_order } = req.body;

    if (!coins_to_use || !total_order) {
      return res.status(400).json({
        success: false,
        message: "coins_to_use dan total_order wajib diisi",
      });
    }

    // Get client coin balance
    const [client] = await db.query(
      "SELECT coin FROM client WHERE id = ?",
      [clientId]
    );

    if (client.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Client tidak ditemukan",
      });
    }

    const currentCoin = client[0].coin || 0;

    // Get coin rules
    const [rules] = await db.query("SELECT * FROM coin_rules LIMIT 1");

    if (rules.length === 0) {
      return res.status(500).json({
        success: false,
        message: "Aturan coin belum dikonfigurasi",
      });
    }

    const rule = rules[0];

    // Validation
    if (coins_to_use > currentCoin) {
      return res.status(400).json({
        success: false,
        message: `Coin tidak cukup. Saldo Anda: ${currentCoin} coin`,
      });
    }

    if (total_order < rule.min_transaction_for_use) {
      return res.status(400).json({
        success: false,
        message: `Minimal transaksi untuk pakai coin: Rp ${rule.min_transaction_for_use.toLocaleString(
          "id-ID"
        )}`,
      });
    }

    // Determine max coin based on transaction amount
    let maxCoin;
    if (total_order >= rule.min_transaction_high) {
      maxCoin = rule.max_coin_high;
    } else {
      maxCoin = rule.max_coin_mid;
    }

    if (coins_to_use > maxCoin) {
      return res.status(400).json({
        success: false,
        message: `Maksimal coin yang bisa digunakan: ${maxCoin} coin untuk transaksi ini`,
        max_coin: maxCoin,
      });
    }

    // Calculate discount
    const discountAmount = coins_to_use * rule.coin_value;
    const finalTotal = total_order - discountAmount;

    res.json({
      success: true,
      data: {
        coins_used: coins_to_use,
        coin_value: rule.coin_value,
        discount_amount: discountAmount,
        original_total: total_order,
        final_total: Math.max(0, finalTotal),
        remaining_coin: currentCoin - coins_to_use,
        max_coin_allowed: maxCoin,
      },
    });
  } catch (err) {
    console.error("? Error calculateCoinDiscount:", err);
    res.status(500).json({
      success: false,
      message: "Gagal menghitung diskon coin",
      error: err.message,
    });
  }
};

// ======================================================
// ?? GET MY VOUCHERS
// ======================================================
exports.getMyVouchers = async (req, res) => {
  try {
    const clientId = req.client.id;

    const [vouchers] = await db.query(
      `SELECT 
        cv.*,
        vr.description,
        vr.discount_amount,
        vr.discount_percent,
        vr.max_discount,
        vr.min_transaction,
        vr.start_date,
        vr.end_date,
        vr.is_active
       FROM client_vouchers cv
       JOIN voucher_rules vr ON cv.voucher_code = vr.voucher_code
       WHERE cv.client_id = ? AND cv.is_used = 0
       ORDER BY cv.obtained_at DESC`,
      [clientId]
    );

    // Filter only active and valid date vouchers
    const now = new Date();
    const validVouchers = vouchers.filter((v) => {
      if (!v.is_active) return false;
      if (v.start_date && new Date(v.start_date) > now) return false;
      if (v.end_date && new Date(v.end_date) < now) return false;
      return true;
    });

    res.json({
      success: true,
      data: validVouchers,
      count: validVouchers.length,
    });
  } catch (err) {
    console.error("? Error getMyVouchers:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil voucher",
      error: err.message,
    });
  }
};

// ======================================================
// ?? CLAIM VOUCHER
// ======================================================
exports.claimVoucher = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const clientId = req.client.id;
    const { voucher_code } = req.body;

    if (!voucher_code) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Kode voucher wajib diisi",
      });
    }

    // Check if voucher exists and active
    const [voucher] = await connection.query(
      `SELECT * FROM voucher_rules 
       WHERE voucher_code = ? AND is_active = 1`,
      [voucher_code]
    );

    if (voucher.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Voucher tidak ditemukan atau sudah tidak aktif",
      });
    }

    const voucherData = voucher[0];

    // Check date validity
    const now = new Date();
    if (voucherData.start_date && new Date(voucherData.start_date) > now) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Voucher belum bisa digunakan",
      });
    }

    if (voucherData.end_date && new Date(voucherData.end_date) < now) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Voucher sudah kadaluarsa",
      });
    }

    // Check if already claimed by this client
    const [existing] = await connection.query(
      `SELECT COUNT(*) as count FROM client_vouchers 
       WHERE client_id = ? AND voucher_code = ?`,
      [clientId, voucher_code]
    );

    if (existing[0].count > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Anda sudah mengklaim voucher ini sebelumnya",
      });
    }

    // Check max_usage_total (total users)
    if (voucherData.max_usage_total) {
      const [totalUsers] = await connection.query(
        `SELECT COUNT(DISTINCT client_id) as count 
         FROM client_vouchers 
         WHERE voucher_code = ?`,
        [voucher_code]
      );

      if (totalUsers[0].count >= voucherData.max_usage_total) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Voucher sudah mencapai batas maksimal penggunaan",
        });
      }
    }

    // Insert voucher to client
    await connection.query(
      `INSERT INTO client_vouchers (client_id, voucher_code, obtained_from)
       VALUES (?, ?, 'claim')`,
      [clientId, voucher_code]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Voucher berhasil diklaim!",
      data: {
        voucher_code: voucher_code,
        description: voucherData.description,
      },
    });
  } catch (err) {
    await connection.rollback();
    console.error("? Error claimVoucher:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengklaim voucher",
      error: err.message,
    });
  } finally {
    connection.release();
  }
};

// ======================================================
// ? VALIDATE VOUCHER FOR ORDER
// ======================================================
exports.validateVoucher = async (req, res) => {
  try {
    const clientId = req.client.id;
    const { voucher_code, total_order, payment_method } = req.body;

    if (!voucher_code || !total_order || !payment_method) {
      return res.status(400).json({
        success: false,
        message: "voucher_code, total_order, dan payment_method wajib diisi",
      });
    }

    // Check if client owns this voucher
    const [clientVoucher] = await db.query(
      `SELECT * FROM client_vouchers 
       WHERE client_id = ? AND voucher_code = ? AND is_used = 0`,
      [clientId, voucher_code]
    );

    if (clientVoucher.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Voucher tidak ditemukan atau sudah digunakan",
      });
    }

    // Get voucher rules
    const [voucher] = await db.query(
      `SELECT * FROM voucher_rules 
       WHERE voucher_code = ? AND is_active = 1`,
      [voucher_code]
    );

    if (voucher.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Voucher tidak valid atau sudah tidak aktif",
      });
    }

    const voucherData = voucher[0];

    // Check date validity
    const now = new Date();
    if (voucherData.start_date && new Date(voucherData.start_date) > now) {
      return res.status(400).json({
        success: false,
        message: "Voucher belum bisa digunakan",
      });
    }

    if (voucherData.end_date && new Date(voucherData.end_date) < now) {
      return res.status(400).json({
        success: false,
        message: "Voucher sudah kadaluarsa",
      });
    }

    // Check minimum transaction
    if (total_order < voucherData.min_transaction) {
      return res.status(400).json({
        success: false,
        message: `Minimal transaksi untuk voucher ini: Rp ${voucherData.min_transaction.toLocaleString(
          "id-ID"
        )}`,
      });
    }

    // Check payment method
    const allowedMethods = voucherData.payment_method
      ? voucherData.payment_method.split(",").map((m) => m.trim())
      : [];

    if (allowedMethods.length > 0 && !allowedMethods.includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: `Voucher ini hanya berlaku untuk: ${allowedMethods.join(", ")}`,
      });
    }

    // Check usage limit per client
    const [usageCount] = await db.query(
      `SELECT COUNT(*) as count FROM voucher_history 
       WHERE client_id = ? AND voucher_code = ?`,
      [clientId, voucher_code]
    );

    if (usageCount[0].count >= voucherData.max_usage_per_client) {
      return res.status(400).json({
        success: false,
        message: `Anda sudah mencapai batas penggunaan voucher ini (${voucherData.max_usage_per_client}x)`,
      });
    }

    // Calculate discount
    let discountAmount = 0;

    if (voucherData.discount_percent) {
      discountAmount = (total_order * voucherData.discount_percent) / 100;
      if (voucherData.max_discount && discountAmount > voucherData.max_discount) {
        discountAmount = voucherData.max_discount;
      }
    } else if (voucherData.discount_amount) {
      discountAmount = voucherData.discount_amount;
    }

    const finalTotal = Math.max(0, total_order - discountAmount);

    res.json({
      success: true,
      message: "Voucher valid!",
      data: {
        voucher_code: voucher_code,
        description: voucherData.description,
        discount_amount: discountAmount,
        original_total: total_order,
        final_total: finalTotal,
        discount_type: voucherData.discount_percent
          ? `${voucherData.discount_percent}%`
          : `Rp ${voucherData.discount_amount?.toLocaleString("id-ID")}`,
      },
    });
  } catch (err) {
    console.error("? Error validateVoucher:", err);
    res.status(500).json({
      success: false,
      message: "Gagal memvalidasi voucher",
      error: err.message,
    });
  }
};

// ======================================================
// ?? GET AVAILABLE VOUCHERS (Public - untuk claim)
// ======================================================
exports.getAvailableVouchers = async (req, res) => {
  try {
    const clientId = req.client.id;

    // Get all active vouchers
    const [vouchers] = await db.query(
      `SELECT * FROM voucher_rules 
       WHERE is_active = 1 
       AND (start_date IS NULL OR start_date <= CURDATE())
       AND (end_date IS NULL OR end_date >= CURDATE())
       ORDER BY created_at DESC`
    );

    // Check which ones client already has
    const [clientVouchers] = await db.query(
      `SELECT voucher_code FROM client_vouchers WHERE client_id = ?`,
      [clientId]
    );

    const ownedCodes = clientVouchers.map((v) => v.voucher_code);

    const availableVouchers = vouchers.map((v) => ({
      ...v,
      already_claimed: ownedCodes.includes(v.voucher_code),
    }));

    res.json({
      success: true,
      data: availableVouchers,
      count: availableVouchers.length,
    });
  } catch (err) {
    console.error("? Error getAvailableVouchers:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil voucher tersedia",
      error: err.message,
    });
  }
};

module.exports = exports;