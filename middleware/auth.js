const jwt = require('jsonwebtoken');

const authenticateAdmin = (req, res, next) => {
  try {
    // Ambil token dari header
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token tidak ditemukan' 
      });
    }
    
    // Pastikan JWT_SECRET ada
    const jwtSecret = process.env.JWT_SECRET || 'nutriscan_secret_key_2024_very_secure';
    
    // Verifikasi token
    const decoded = jwt.verify(token, jwtSecret);
    req.adminId = decoded.adminId;
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    return res.status(401).json({ 
      success: false, 
      message: 'Token tidak valid' 
    });
  }
};

module.exports = { authenticateAdmin };