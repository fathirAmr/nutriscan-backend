const express = require('express');
const cors = require('cors');
// const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { authenticateAdmin } = require('./middleware/auth');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// 👉 ADD THIS HERE
app.get("/test-db", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT 1 + 1 AS result");
    res.json({ success: true, result: rows[0].result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

function calculateNutritionGrade(nutrition) {
  if (!nutrition) {
    return 'N/A';
  }

  let score = 100; // Mulai dari perfect score
  let negativePoints = 0;
  let positivePoints = 0;
  
  const { calories, protein, fat, carbs, fiber, sugar, sodium } = nutrition;
  
  // ============================================
  // BAGIAN 1: PENGURANGAN SCORE (Kandungan Buruk)
  // ============================================
  
  // 1️⃣ GULA (Sugar) - Faktor PALING PENTING
  // Standar WHO: <5g (baik), 5-10g (sedang), 10-15g (tinggi), >15g (sangat tinggi)
  if (sugar > 25) {
    negativePoints += 40; // Gula EKSTREM tinggi (diabetes risk!)
  } else if (sugar > 15) {
    negativePoints += 35; // Gula sangat tinggi
  } else if (sugar > 10) {
    negativePoints += 25; // Gula tinggi
  } else if (sugar > 5) {
    negativePoints += 12; // Gula sedang
  }
  // sugar ≤5g = OK (tidak dikurangi)
  
  // 2️⃣ LEMAK (Fat)
  // Standar WHO: <3g (rendah lemak), 3-17.5g (sedang), 17.5-30g (tinggi), >30g (sangat tinggi)
  if (fat > 30) {
    negativePoints += 35; // Lemak EKSTREM tinggi
  } else if (fat > 20) {
    negativePoints += 30; // Lemak sangat tinggi
  } else if (fat > 17.5) {
    negativePoints += 20; // Lemak tinggi
  } else if (fat > 10) {
    negativePoints += 10; // Lemak sedang-tinggi
  } else if (fat > 3) {
    negativePoints += 5; // Lemak sedang
  }
  // fat ≤3g = Rendah lemak (tidak dikurangi)
  
  // 3️⃣ LEMAK JENUH (Saturated Fat) - jika ada data
  // Untuk sekarang, kita asumsikan dari total fat
  // Standar: <5% energi = ±5.5g per 100g
  const estimatedSaturatedFat = fat * 0.4; // Asumsi 40% dari total fat
  if (estimatedSaturatedFat > 10) {
    negativePoints += 15; // Lemak jenuh sangat tinggi
  } else if (estimatedSaturatedFat > 5.5) {
    negativePoints += 8; // Lemak jenuh tinggi
  }
  
  // 4️⃣ SODIUM (Garam)
  // Standar WHO: <120mg (rendah), 120-400mg (sedang), 400-600mg (tinggi), >600mg (sangat tinggi)
  if (sodium > 800) {
    negativePoints += 30; // Sodium EKSTREM tinggi
  } else if (sodium > 600) {
    negativePoints += 25; // Sodium sangat tinggi
  } else if (sodium > 400) {
    negativePoints += 15; // Sodium tinggi
  } else if (sodium > 200) {
    negativePoints += 8; // Sodium sedang-tinggi
  } else if (sodium > 120) {
    negativePoints += 3; // Sodium sedang
  }
  // sodium ≤120mg = Rendah sodium (tidak dikurangi)
  
  // 5️⃣ KALORI
  // Standar: <40 kkal (sangat rendah), 40-200 kkal (rendah-sedang), 200-400 kkal (tinggi), >400 kkal (sangat tinggi)
  if (calories > 500) {
    negativePoints += 20; // Kalori EKSTREM tinggi
  } else if (calories > 400) {
    negativePoints += 15; // Kalori sangat tinggi
  } else if (calories > 300) {
    negativePoints += 10; // Kalori tinggi
  } else if (calories > 200) {
    negativePoints += 5; // Kalori sedang-tinggi
  }
  // calories ≤200 = Normal (tidak dikurangi)
  
  // ============================================
  // BAGIAN 2: PENAMBAHAN SCORE (Kandungan Baik)
  // ============================================
  
  // 1️⃣ SERAT (Fiber) - Sangat penting untuk pencernaan
  // Standar: <3g (rendah), 3-6g (cukup), ≥6g (tinggi/baik)
  if (fiber >= 6) {
    positivePoints += 15; // Serat tinggi (sangat baik!)
  } else if (fiber >= 3) {
    positivePoints += 8; // Serat cukup
  } else if (fiber >= 1.5) {
    positivePoints += 3; // Serat ada (minimal)
  }
  // fiber <1.5g = Rendah serat (tidak ditambah)
  
  // 2️⃣ PROTEIN
  // Standar: <5g (rendah), 5-10g (sedang), ≥10g (tinggi)
  if (protein >= 15) {
    positivePoints += 10; // Protein tinggi
  } else if (protein >= 10) {
    positivePoints += 7; // Protein sedang-tinggi
  } else if (protein >= 5) {
    positivePoints += 4; // Protein cukup
  }
  // protein <5g = Rendah protein (tidak ditambah)
  
  // ============================================
  // BAGIAN 3: HITUNG FINAL SCORE
  // ============================================
  
  score = score - negativePoints + positivePoints;
  
  // PENALTY KHUSUS: Jika gula DAN lemak SAMA-SAMA tinggi (produk junk food)
  if (sugar > 15 && fat > 20) {
    score -= 10; // Penalty kombinasi buruk
  }
  
  // PENALTY KHUSUS: Jika gula sangat tinggi DAN serat sangat rendah (tidak seimbang)
  if (sugar > 20 && fiber < 2) {
    score -= 10; // Penalty gula tinggi tanpa serat
  }
  
  // Pastikan score dalam range 0-100
  score = Math.max(0, Math.min(100, score));
  
  // ============================================
  // BAGIAN 4: KONVERSI SCORE KE GRADE
  // ============================================
  
  // Grade system yang lebih ketat:
  if (score >= 85) return 'A';      // 85-100: Sangat Baik (healthy food)
  if (score >= 70) return 'B';      // 70-84: Baik (occasional consumption)
  if (score >= 50) return 'C';      // 50-69: Sedang (limited consumption)
  if (score >= 30) return 'D';      // 30-49: Kurang Baik (rare consumption)
  return 'E';                        // 0-29: Tidak Baik (avoid)
}


// ============================================
// PUBLIC ROUTES (Tidak perlu login)
// ============================================

app.get('/', (req, res) => {
  res.json({ message: 'NutriScan API Running!' });
});

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const [products] = await db.query('SELECT * FROM products ORDER BY name');
    
   
    const productsWithGrades = await Promise.all(
      products.map(async (product) => {
        const [nutrition] = await db.query(
          'SELECT * FROM nutrition WHERE product_id = ?',
          [product.id]
        );
        
        const nutritionData = nutrition[0] || null;
        const calculatedGrade = calculateNutritionGrade(nutritionData);
        
        return {
          ...product,
          health_score: calculatedGrade
        };
      })
    );
    
    res.json({ success: true, data: productsWithGrades });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get product by barcode
app.get('/api/products/barcode/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;
    
    const [products] = await db.query(
      'SELECT * FROM products WHERE barcode = ?',
      [barcode]
    );
    
    if (products.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    const product = products[0];
    
    const [nutrition] = await db.query(
      'SELECT * FROM nutrition WHERE product_id = ?',
      [product.id]
    );
    
    const [ingredients] = await db.query(
      'SELECT ingredient FROM ingredients WHERE product_id = ?',
      [product.id]
    );
    
    const [allergens] = await db.query(
      'SELECT allergen FROM allergens WHERE product_id = ?',
      [product.id]
    );
    
    const [additives] = await db.query(
      'SELECT additive FROM additives WHERE product_id = ?',
      [product.id]
    );
    
    // ⭐ BAGIAN BARU: Hitung grade otomatis
    const nutritionData = nutrition[0] || null;
    const calculatedGrade = calculateNutritionGrade(nutritionData);
    
    const result = {
      ...product,
      health_score: calculatedGrade, // ⭐ Update grade otomatis
      nutrition: nutritionData,
      ingredients: ingredients.map(i => i.ingredient),
      allergens: allergens.map(a => a.allergen),
      additives: additives.map(a => a.additive)
    };
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Search products
app.get('/api/products/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    
    const [products] = await db.query(
      'SELECT * FROM products WHERE name LIKE ? OR brand LIKE ? ORDER BY name',
      [`%${query}%`, `%${query}%`]
    );
    
    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get product detail
app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [products] = await db.query(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );
    
    if (products.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    const product = products[0];
    
    const [nutrition] = await db.query(
      'SELECT * FROM nutrition WHERE product_id = ?',
      [id]
    );
    
    const [ingredients] = await db.query(
      'SELECT ingredient FROM ingredients WHERE product_id = ?',
      [id]
    );
    
    const [allergens] = await db.query(
      'SELECT allergen FROM allergens WHERE product_id = ?',
      [id]
    );
    
    const [additives] = await db.query(
      'SELECT additive FROM additives WHERE product_id = ?',
      [id]
    );
    
    const nutritionData = nutrition[0] || null;
    const calculatedGrade = calculateNutritionGrade(nutritionData);
    
    const result = {
      ...product,
      health_score: calculatedGrade, 
      nutrition: nutritionData,
      ingredients: ingredients.map(i => i.ingredient),
      allergens: allergens.map(a => a.allergen),
      additives: additives.map(a => a.additive)
    };
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Add to scan history
app.post('/api/history', async (req, res) => {
  try {
    const { product_id } = req.body;
    
    await db.query(
      'INSERT INTO scan_history (product_id) VALUES (?)',
      [product_id]
    );
    
    res.json({ success: true, message: 'Added to history' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get scan history
app.get('/api/history', async (req, res) => {
  try {
    const [history] = await db.query(`
      SELECT 
        h.id, 
        h.scanned_at,
        p.* 
      FROM scan_history h
      JOIN products p ON h.product_id = p.id
      ORDER BY h.scanned_at DESC
      LIMIT 10
    `);
    
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Endpoint untuk menghapus semua riwayat
app.delete('/api/history/clear', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM scan_history');
    
    res.json({ 
      success: true, 
      message: 'Semua riwayat berhasil dihapus',
      deleted: result.affectedRows
    });
  } catch (error) {
    console.error('Error clearing history:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal menghapus riwayat: ' + error.message 
    });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('Login attempt:', { username }); // Debug log
    
    // Cari admin di database
    const [admins] = await db.query(
      'SELECT * FROM admins WHERE username = ?',
      [username]
    );
    
    console.log('Admin found:', admins.length); // Debug log
    
    if (admins.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Username atau password salah' 
      });
    }
    
    const admin = admins[0];
    
    // Verifikasi password
    const isValidPassword = (password === admin.password);
    
    console.log('Password valid:', isValidPassword); // Debug log
    
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Username atau password salah' 
      });
    }
    
    // Pastikan JWT_SECRET ada
    const jwtSecret = process.env.JWT_SECRET || 'nutriscan_secret_key_2024_very_secure';
    
    // Generate JWT token
    const token = jwt.sign(
      { adminId: admin.id, username: admin.username },
      jwtSecret,
      { expiresIn: '24h' }
    );
    
    res.json({ 
      success: true, 
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});

// ============================================
// PROTECTED ADMIN ROUTES (Perlu token)
// ============================================

// Create Product
app.post('/api/admin/products', authenticateAdmin, async (req, res) => {
  try {
    const { 
      name, brand, barcode, category, serving_size, 
      nutrition, ingredients, allergens, additives 
    } = req.body;
    
    // Insert product
    const [result] = await db.query(
      'INSERT INTO products (name, brand, barcode, category, serving_size) VALUES (?, ?, ?, ?, ?)',
      [name, brand, barcode, category, serving_size]
    );
    
    const productId = result.insertId;
    
    // Insert nutrition
    if (nutrition) {
      await db.query(
        `INSERT INTO nutrition (product_id, calories, protein, fat, carbs, fiber, sugar, sodium) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [productId, nutrition.calories, nutrition.protein, nutrition.fat, 
         nutrition.carbs, nutrition.fiber, nutrition.sugar, nutrition.sodium]
      );
    }
    
    // Insert ingredients
    if (ingredients && ingredients.length > 0) {
      const ingredientValues = ingredients.map(ing => [productId, ing]);
      await db.query(
        'INSERT INTO ingredients (product_id, ingredient) VALUES ?',
        [ingredientValues]
      );
    }
    
    // Insert allergens
    if (allergens && allergens.length > 0) {
      const allergenValues = allergens.map(all => [productId, all]);
      await db.query(
        'INSERT INTO allergens (product_id, allergen) VALUES ?',
        [allergenValues]
      );
    }
    
    // Insert additives
    if (additives && additives.length > 0) {
      const additiveValues = additives.map(add => [productId, add]);
      await db.query(
        'INSERT INTO additives (product_id, additive) VALUES ?',
        [additiveValues]
      );
    }
    
    res.json({ 
      success: true, 
      message: 'Product created successfully',
      productId 
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update Product
// ============================================
// GANTI endpoint PUT /api/admin/products/:id
// di server.js (sekitar baris 430-500)
// ============================================

// Update Product
app.put('/api/admin/products/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, brand, barcode, category, serving_size,
      nutrition, ingredients, allergens, additives 
    } = req.body;
    
    console.log('📝 Updating product ID:', id);
    console.log('📊 Nutrition data received:', nutrition);
    
    // Update product basic info
    await db.query(
      'UPDATE products SET name = ?, brand = ?, barcode = ?, category = ?, serving_size = ? WHERE id = ?',
      [name, brand, barcode, category, serving_size, id]
    );
    
    // ⭐ FIX: Update nutrition dengan cara yang lebih aman
    await db.query('DELETE FROM nutrition WHERE product_id = ?', [id]);
    if (nutrition && Object.keys(nutrition).length > 0) {
      // Pastikan semua nilai nutrition ada, jika tidak set ke 0
      const nutritionValues = {
        calories: parseFloat(nutrition.calories) || 0,
        protein: parseFloat(nutrition.protein) || 0,
        fat: parseFloat(nutrition.fat) || 0,
        carbs: parseFloat(nutrition.carbs) || 0,
        fiber: parseFloat(nutrition.fiber) || 0,
        sugar: parseFloat(nutrition.sugar) || 0,
        sodium: parseFloat(nutrition.sodium) || 0
      };
      
      await db.query(
        `INSERT INTO nutrition (product_id, calories, protein, fat, carbs, fiber, sugar, sodium) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, nutritionValues.calories, nutritionValues.protein, nutritionValues.fat, 
         nutritionValues.carbs, nutritionValues.fiber, nutritionValues.sugar, nutritionValues.sodium]
      );
      
      console.log('✅ Nutrition updated:', nutritionValues);
    }
    
    // Update ingredients
    await db.query('DELETE FROM ingredients WHERE product_id = ?', [id]);
    if (ingredients && ingredients.length > 0) {
      const ingredientValues = ingredients.map(ing => [id, ing]);
      await db.query(
        'INSERT INTO ingredients (product_id, ingredient) VALUES ?',
        [ingredientValues]
      );
    }
    
    // Update allergens
    await db.query('DELETE FROM allergens WHERE product_id = ?', [id]);
    if (allergens && allergens.length > 0) {
      const allergenValues = allergens.map(all => [id, all]);
      await db.query(
        'INSERT INTO allergens (product_id, allergen) VALUES ?',
        [allergenValues]
      );
    }
    
    // Update additives
    await db.query('DELETE FROM additives WHERE product_id = ?', [id]);
    if (additives && additives.length > 0) {
      const additiveValues = additives.map(add => [id, add]);
      await db.query(
        'INSERT INTO additives (product_id, additive) VALUES ?',
        [additiveValues]
      );
    }
    
    console.log('✅ Product updated successfully');
    
    res.json({ 
      success: true, 
      message: 'Product updated successfully' 
    });
  } catch (error) {
    console.error('❌ Error updating product:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + error.message 
    });
  }
});

// Delete Product
app.delete('/api/admin/products/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete related data first
    await db.query('DELETE FROM nutrition WHERE product_id = ?', [id]);
    await db.query('DELETE FROM ingredients WHERE product_id = ?', [id]);
    await db.query('DELETE FROM allergens WHERE product_id = ?', [id]);
    await db.query('DELETE FROM additives WHERE product_id = ?', [id]);
    await db.query('DELETE FROM scan_history WHERE product_id = ?', [id]);
    
    // Delete product
    await db.query('DELETE FROM products WHERE id = ?', [id]);
    
    res.json({ 
      success: true, 
      message: 'Product deleted successfully' 
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);

});
