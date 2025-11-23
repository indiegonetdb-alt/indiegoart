const db = require("../config/database");

// ======================================================
// GET /api/customer/banners ? Banner untuk aplikasi customer
// ======================================================
exports.getActiveBanners = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, title, description, image_url FROM banners ORDER BY id DESC"
    );

    const fullBanners = rows.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      image_url: `http://192.168.13.3:5000/${b.image_url}`,
    }));

    res.json({ success: true, data: fullBanners });
  } catch (err) {
    console.error("? getActiveBanners:", err);
    res.status(500).json({ success: false, message: "Gagal memuat banner" });
  }
};
