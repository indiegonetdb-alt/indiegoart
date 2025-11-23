// controllers/orderController.js

const db = require('../config/database');

// ====================================================
// GET ORDER STATISTICS (counts per status)
// ====================================================
exports.getOrderStats = async (req, res) => {
  try {
    const clientId = req.client.id;
    
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN payment_status = 'Belum Lunas' THEN 1 ELSE 0 END) as unpaid,
        SUM(CASE WHEN status IN ('Admin', 'Di Desain', 'Proses Desain', 'Operator', 'Proses Cetak', 'Acc Admin', 'Selesai') THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'Dikirim' THEN 1 ELSE 0 END) as shipped,
        SUM(CASE WHEN status = 'Sudah Diambil' THEN 1 ELSE 0 END) as completed
      FROM orders
      WHERE client_id = ?
    `, [clientId]);
    
    res.json({
      success: true,
      data: stats[0]
    });
  } catch (err) {
    console.error('? Error get order stats:', err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil statistik order",
      error: err.message
    });
  }
};

// ====================================================
// GET ORDERS BY STATUS FILTER
// ====================================================
exports.getOrdersByStatus = async (req, res) => {
  try {
    const clientId = req.client.id;
    const { filter } = req.params;
    
    let statusCondition = '';
    
    switch(filter) {
      case 'unpaid':
        statusCondition = "AND o.payment_status = 'Belum Lunas'";
        break;
      case 'processing':
        statusCondition = "AND o.status IN ('Admin', 'Di Desain', 'Proses Desain', 'Operator', 'Proses Cetak', 'Acc Admin', 'Selesai')";
        break;
      case 'shipped':
        statusCondition = "AND o.status = 'Dikirim'";
        break;
      case 'completed':
        statusCondition = "AND o.status = 'Sudah Diambil'";
        break;
      default:
        statusCondition = '';
    }
    
    const [orders] = await db.query(`
      SELECT 
        o.*,
        (
          SELECT COUNT(*) 
          FROM order_items 
          WHERE invoice_id = o.id
        ) AS item_count
      FROM orders o
      WHERE o.client_id = ? ${statusCondition}
      ORDER BY o.created_at DESC
    `, [clientId]);
    
    res.json({
      success: true,
      data: orders
    });
  } catch (err) {
    console.error('? Error get orders by status:', err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar order",
      error: err.message
    });
  }
};

// ====================================================
// GET ALL ORDERS (with optional query filters)
// ====================================================
exports.getAllOrders = async (req, res) => {
  try {
    const clientId = req.client.id;
    const { status, payment_status } = req.query;
    
    let conditions = ['o.client_id = ?'];
    let params = [clientId];
    
    if (status) {
      conditions.push('o.status = ?');
      params.push(status);
    }
    
    if (payment_status) {
      conditions.push('o.payment_status = ?');
      params.push(payment_status);
    }
    
    const whereClause = conditions.join(' AND ');
    
    const [orders] = await db.query(`
      SELECT 
        o.*,
        (
          SELECT COUNT(*) 
          FROM order_items 
          WHERE invoice_id = o.id
        ) AS item_count
      FROM orders o
      WHERE ${whereClause}
      ORDER BY o.created_at DESC
    `, params);
    
    res.json({
      success: true,
      data: orders
    });
  } catch (err) {
    console.error('? Error get all orders:', err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar order",
      error: err.message
    });
  }
};

// ====================================================
// GET ORDER DETAIL BY ID
// ====================================================
exports.getOrderDetail = async (req, res) => {
  try {
    const clientId = req.client.id;
    const { orderId } = req.params;
    
    // Get order - TIDAK ADA KOLOM DESAINER/OPERATOR DI TABEL ORDERS
    const [[orderData]] = await db.query(`
      SELECT 
        o.*,
        c.full_name AS client_full_name,
        c.email AS client_email,
        c.phone AS client_phone,
        admin_user.full_name AS admin_full_name,
        admin_user.username AS admin_username
      FROM orders o
      LEFT JOIN client c ON o.client_id = c.id
      LEFT JOIN users admin_user ON o.admin = admin_user.id
      WHERE o.id = ? AND o.client_id = ?
    `, [orderId, clientId]);
    
    if (!orderData) {
      return res.status(404).json({
        success: false,
        message: "Order tidak ditemukan"
      });
    }
    
    // Get all order items - DESAINER, OPERATOR, ADMIN ADA DI ORDER_ITEMS
    const [items] = await db.query(`
      SELECT 
        oi.*,
        p.name AS product_name_detail,
        p.unit AS product_unit,
        operator_user.full_name AS operator_name,
        operator_user.username AS operator_username,
        desainer_user.full_name AS desainer_name,
        desainer_user.username AS desainer_username,
        admin_user.full_name AS admin_name,
        admin_user.username AS admin_username
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN users operator_user ON oi.operator = operator_user.id
      LEFT JOIN users desainer_user ON oi.desainer = desainer_user.id
      LEFT JOIN users admin_user ON oi.admin = admin_user.id
      WHERE oi.invoice_id = ?
      ORDER BY oi.id
    `, [orderId]);
    
    // Get all order history
    const [history] = await db.query(`
      SELECT *
      FROM order_history
      WHERE order_id = ?
      ORDER BY tanggal ASC, id ASC
    `, [orderId]);
    
    // Get payments
    const [payments] = await db.query(`
      SELECT *
      FROM payments
      WHERE invoice_code = ?
      ORDER BY paid_at DESC
    `, [orderData.invoice_code]);
    
    // RETURN FLATTENED STRUCTURE - merge order fields to root level
    res.json({
      success: true,
      data: {
        ...orderData,  // Flatten all order fields to root
        items,
        history,
        payments
      }
    });
  } catch (err) {
    console.error('? Error get order detail:', err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil detail order",
      error: err.message
    });
  }
};

// ====================================================
// GET COMPLETED HISTORY ("Sudah Diambil")
// ====================================================
exports.getCompletedHistory = async (req, res) => {
  try {
    const clientId = req.client.id;
    
    const [orders] = await db.query(`
      SELECT 
        o.*,
        (
          SELECT COUNT(*) 
          FROM order_items 
          WHERE invoice_id = o.id
        ) AS item_count,
        (
          SELECT GROUP_CONCAT(DISTINCT CONCAT(oi.p, 'x', oi.l) SEPARATOR ', ')
          FROM order_items oi
          WHERE oi.invoice_id = o.id AND oi.p > 0 AND oi.l > 0
        ) AS item_sizes,
        (
          SELECT GROUP_CONCAT(DISTINCT oi.nama_file SEPARATOR ', ')
          FROM order_items oi
          WHERE oi.invoice_id = o.id AND oi.nama_file IS NOT NULL AND oi.nama_file != ''
        ) AS nama_files
      FROM orders o
      WHERE o.client_id = ? AND o.status = 'Sudah Diambil'
      ORDER BY o.created_at DESC
    `, [clientId]);
    
    res.json({
      success: true,
      data: orders
    });
  } catch (err) {
    console.error('? Error get completed history:', err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil riwayat order selesai",
      error: err.message
    });
  }
};

// ====================================================
// GET RATINGS FOR SPECIFIC ORDER
// ====================================================
exports.getOrderRatings = async (req, res) => {
  try {
    const clientId = req.client.id;
    const { orderId } = req.params;
    
    // Verify order exists and belongs to client
    const [[order]] = await db.query(
      `SELECT id FROM orders WHERE id = ? AND client_id = ?`,
      [orderId, clientId]
    );
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order tidak ditemukan"
      });
    }
    
    // Get all ratings for this order
    const [ratings] = await db.query(`
      SELECT 
        orr.id,
        orr.order_id,
        orr.user_id,
        orr.user_type,
        orr.rating,
        orr.comment,
        orr.created_at,
        u.username,
        u.full_name,
        u.role
      FROM order_ratings orr
      JOIN users u ON orr.user_id = u.id
      WHERE orr.order_id = ? AND orr.client_id = ?
    `, [orderId, clientId]);
    
    res.json({
      success: true,
      data: ratings
    });
  } catch (err) {
    console.error('? Error get ratings:', err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data rating",
      error: err.message
    });
  }
};

// ====================================================
// SUBMIT RATING (for admin/desainer/operator)
// ====================================================
exports.submitRating = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const clientId = req.client.id;
    const { order_id, user_type, rating, feedback } = req.body;
    
    console.log('?? Rating request:', { order_id, user_type, rating, clientId });
    
    if (!order_id || !user_type || !rating) {
      return res.status(400).json({
        success: false,
        message: "order_id, user_type, dan rating wajib diisi"
      });
    }

    // Allowed user types: owner, admin, operator, desainer, marketing, kasir
    const allowedTypes = ['owner', 'admin', 'operator', 'desainer', 'marketing', 'kasir'];
    if (!allowedTypes.includes(user_type.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `user_type harus salah satu dari: ${allowedTypes.join(', ')}`
      });
    }
    
    // ? FIXED: ADMIN, DESAINER, DAN OPERATOR SEKARANG SEMUA DIAMBIL DARI ORDER_ITEMS (PAKAI ID)
    const [[order]] = await conn.query(`
      SELECT 
        o.id,
        (
          SELECT DISTINCT oi.admin
          FROM order_items oi
          WHERE oi.invoice_id = o.id AND oi.admin IS NOT NULL
          LIMIT 1
        ) AS admin_id,
        (
          SELECT GROUP_CONCAT(DISTINCT oi.desainer SEPARATOR ',')
          FROM order_items oi
          WHERE oi.invoice_id = o.id AND oi.desainer IS NOT NULL
        ) AS desainer_ids,
        (
          SELECT GROUP_CONCAT(DISTINCT oi.operator SEPARATOR ',')
          FROM order_items oi
          WHERE oi.invoice_id = o.id AND oi.operator IS NOT NULL
        ) AS operator_ids
      FROM orders o
      WHERE o.id = ? AND o.client_id = ?
    `, [order_id, clientId]);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order tidak ditemukan atau bukan milik Anda"
      });
    }

    // Get user based on user_type
    let user = null;
    const userTypeLower = user_type.toLowerCase();

    // ? FIXED: ADMIN JUGA DIAMBIL DARI order_items.admin (ID)
    if (userTypeLower === 'admin' && order.admin_id) {
      [[user]] = await conn.query(
        `SELECT id, full_name, username FROM users WHERE id = ? AND role = 'admin'`,
        [parseInt(order.admin_id)]
      );
    } else if (userTypeLower === 'desainer' && order.desainer_ids) {
      // Get desainer by ID (dari order_items)
      const desainerIds = order.desainer_ids.split(',');
      if (desainerIds.length > 0) {
        [[user]] = await conn.query(
          `SELECT id, full_name, username FROM users 
           WHERE id = ? AND role = 'desainer'`,
          [parseInt(desainerIds[0].trim())]
        );
      }
    } else if (userTypeLower === 'operator' && order.operator_ids) {
      // Get operator by ID (dari order_items)
      const operatorIds = order.operator_ids.split(',');
      if (operatorIds.length > 0) {
        [[user]] = await conn.query(
          `SELECT id, full_name, username FROM users 
           WHERE id = ? AND role = 'operator'`,
          [parseInt(operatorIds[0].trim())]
        );
      }
    } else if (['owner', 'marketing', 'kasir'].includes(userTypeLower)) {
      // Get by role (untuk owner/marketing/kasir yang tidak ada di order table)
      [[user]] = await conn.query(
        `SELECT id, full_name, username FROM users WHERE role = ? LIMIT 1`,
        [userTypeLower]
      );
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        message: `${user_type} belum ditugaskan untuk pesanan ini`
      });
    }

    await conn.beginTransaction();
    
    // Check if rating already exists (untuk tahu apakah ini update atau insert baru)
    const [[existingRating]] = await conn.query(`
      SELECT rating FROM order_ratings 
      WHERE order_id = ? AND user_id = ? AND client_id = ?
    `, [order_id, user.id, clientId]);
    
    const oldRating = existingRating ? existingRating.rating : 0;
    const isUpdate = !!existingRating;
    
    // Insert atau update rating dengan tabel dan kolom yang benar
    await conn.query(`
      INSERT INTO order_ratings (order_id, user_id, client_id, user_type, rating, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE 
        rating = VALUES(rating),
        comment = VALUES(comment),
        created_at = NOW()
    `, [order_id, user.id, clientId, userTypeLower, rating, feedback || null]);
    
    // UPDATE: Update rating statistics di tabel users
    if (isUpdate) {
      // Jika update, kurangi rating lama dan tambah rating baru
      await conn.query(`
        UPDATE users 
        SET 
          rating_total = rating_total - ? + ?,
          rating = CASE 
            WHEN rating_count > 0 THEN (rating_total - ? + ?) / rating_count 
            ELSE 0 
          END
        WHERE id = ?
      `, [oldRating, rating, oldRating, rating, user.id]);
    } else {
      // Jika insert baru, tambah rating_count dan rating_total
      await conn.query(`
        UPDATE users 
        SET 
          rating_total = rating_total + ?,
          rating_count = rating_count + 1,
          rating = (rating_total + ?) / (rating_count + 1)
        WHERE id = ?
      `, [rating, rating, user.id]);
    }
    
    await conn.commit();
    
    console.log('? Rating saved:', { user_type, user_name: user.full_name, rating });
    
    res.json({
      success: true,
      message: `Rating untuk ${user.full_name} berhasil disimpan`,
      data: {
        user_type,
        user_name: user.full_name,
        rating
      }
    });
  } catch (err) {
    await conn.rollback();
    console.error('? Error submit rating:', err);
    res.status(500).json({
      success: false,
      message: "Gagal menyimpan rating",
      error: err.message
    });
  } finally {
    conn.release();
  }
};

// ====================================================
// GET ORDERS THAT NEED RATING (belum lengkap ratingnya)
// ====================================================
exports.getOrdersNeedRating = async (req, res) => {
  try {
    const clientId = req.client.id;
    
    // Get all completed orders
    const [orders] = await db.query(`
      SELECT 
        o.*,
        (
          SELECT COUNT(*) 
          FROM order_items 
          WHERE invoice_id = o.id
        ) AS item_count
      FROM orders o
      WHERE o.client_id = ? AND o.status = 'Sudah Diambil'
      ORDER BY o.created_at DESC
    `, [clientId]);
    
    // Filter orders that don't have complete ratings (3 ratings: admin, desainer, operator)
    const ordersNeedRating = [];
    
    for (const order of orders) {
      // Count existing ratings for this order
      const [[ratingCount]] = await db.query(`
        SELECT COUNT(DISTINCT user_type) as total
        FROM order_ratings
        WHERE order_id = ? AND client_id = ?
      `, [order.id, clientId]);
      
      // If less than 3 ratings (admin, desainer, operator), include this order
      if (ratingCount.total < 3) {
        ordersNeedRating.push(order);
      }
    }
    
    res.json({
      success: true,
      data: ordersNeedRating
    });
  } catch (err) {
    console.error('? Error get orders need rating:', err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar pesanan yang perlu rating",
      error: err.message
    });
  }
};