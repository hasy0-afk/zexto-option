const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Try multiple possible env variable names
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
    
    if (!uri) {
      console.log('❌ MongoDB URI not found in environment variables!');
      console.log('Checked: MONGODB_URI, MONGO_URI, DATABASE_URL');
      process.exit(1);
    }
    
    console.log('🔌 Connecting to MongoDB...');
    
    const conn = await mongoose.connect(uri);
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    console.log('❌ MongoDB Error:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
