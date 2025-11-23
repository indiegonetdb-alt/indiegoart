// backend-customer/controllers/productController.js
const db = require("../config/database");

/* =========================================================
   GET ALL PRODUCTS (PUBLIC)
========================================================= */
exports.getAllProducts = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        pf.id, 
        pf.product_id, 
        pf.product_name,
        pf.description,
        pf.p,
        pf.l,
        pf.price,
        pf.image,
        pf.is_primary,
        p.name AS base_name, 
        p.kategori,
        p.type, 
        p.unit, 
        p.price AS base_price, 
        p.stock
      FROM product_forcostumer pf
      JOIN products p ON pf.product_id = p.id
      ORDER BY pf.id DESC
    `);

    if (!rows || rows.length === 0) {
      return res.json({ 
        success: true, 
        data: [],
        message: "Belum ada produk tersedia"
      });
    }

    // Format products
    const products = rows.map(r => {
      const P = parseFloat(r.p) || 0;
      const L = parseFloat(r.l) || 0;
      let calculatedPrice = r.base_price || 0;

      // Calculate price for M/M2 unit
      if ((r.unit === "M" || r.unit === "M2") && P > 0 && L > 0) {
        calculatedPrice = P * L * r.base_price;
      }

      const finalPrice = r.price ? r.price : calculatedPrice;

      // Parse images from JSON string
      let images = [];
      if (r.image) {
        try {
          const parsed = JSON.parse(r.image);
          images = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          images = r.image ? [r.image] : [];
        }
      }

      // Format image URLs
      const formattedImages = images.map((img, idx) => {
        let imageUrl = img;
        if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = imageUrl.replace(/^\/+/, '');
          imageUrl = `http://192.168.13.3:5000/${imageUrl}`;
        }
        return {
          id: idx,
          url: imageUrl || 'https://placehold.co/600x400/1e293b/64748b?text=No+Image',
          is_primary: idx === 0 ? 1 : 0
        };
      });

      // Add placeholder if no images
      if (formattedImages.length === 0) {
        formattedImages.push({
          id: 0,
          url: 'https://placehold.co/600x400/1e293b/64748b?text=No+Image',
          is_primary: 1
        });
      }

      return {
        id: r.id,
        product_id: r.product_id,
        name: r.product_name || r.base_name,
        display_name: r.product_name,
        base_name: r.base_name,
        description: r.description || '',
        kategori: r.kategori,
        type: r.type,
        unit: r.unit,
        p: P,
        l: L,
        panjang: P,
        lebar: L,
        price: parseFloat(finalPrice) || 0,
        base_price: parseFloat(r.base_price) || 0,
        stock: parseInt(r.stock) || 0,
        images: formattedImages,
        image_url: formattedImages[0]?.url
      };
    });

    res.json({ 
      success: true, 
      data: products,
      count: products.length
    });

  } catch (err) {
    console.error("❌ Error get products:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal mengambil produk",
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
};

/* =========================================================
   GET PRODUCT BY ID (PUBLIC)
========================================================= */
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(`
      SELECT 
        pf.id, 
        pf.product_id, 
        pf.product_name,
        pf.description,
        pf.p,
        pf.l,
        pf.price,
        pf.image,
        pf.is_primary,
        p.name AS base_name, 
        p.kategori,
        p.type, 
        p.unit, 
        p.price AS base_price, 
        p.stock
      FROM product_forcostumer pf
      JOIN products p ON pf.product_id = p.id
      WHERE pf.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan"
      });
    }

    const r = rows[0];
    const P = parseFloat(r.p) || 0;
    const L = parseFloat(r.l) || 0;
    let calculatedPrice = r.base_price || 0;

    // Calculate price for M/M2 unit
    if ((r.unit === "M" || r.unit === "M2") && P > 0 && L > 0) {
      calculatedPrice = P * L * r.base_price;
    }

    const finalPrice = r.price ? r.price : calculatedPrice;

    // Parse images from JSON string
    let images = [];
    if (r.image) {
      try {
        const parsed = JSON.parse(r.image);
        images = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        images = r.image ? [r.image] : [];
      }
    }

    // Format image URLs
    const formattedImages = images.map((img, idx) => {
      let imageUrl = img;
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = imageUrl.replace(/^\/+/, '');
        imageUrl = `http://192.168.13.3:5000/${imageUrl}`;
      }
      return {
        id: idx,
        url: imageUrl || 'https://placehold.co/600x400/1e293b/64748b?text=No+Image',
        is_primary: idx === 0 ? 1 : 0
      };
    });

    // Add placeholder if no images
    if (formattedImages.length === 0) {
      formattedImages.push({
        id: 0,
        url: 'https://placehold.co/600x400/1e293b/64748b?text=No+Image',
        is_primary: 1
      });
    }

    const product = {
      id: r.id,
      product_id: r.product_id,
      name: r.product_name || r.base_name,
      display_name: r.product_name,
      base_name: r.base_name,
      kategori: r.kategori,
      type: r.type,
      unit: r.unit,
      price: parseFloat(finalPrice) || 0,
      base_price: parseFloat(r.base_price) || 0,
      stock: parseInt(r.stock) || 0,
      description: r.description || '',
      panjang: P,
      lebar: L,
      p: P,
      l: L,
      images: formattedImages,
      image_url: formattedImages[0]?.url
    };

    res.json({
      success: true,
      data: product
    });

  } catch (err) {
    console.error("❌ Error get product by id:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil detail produk",
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
};

module.exports = exports;
