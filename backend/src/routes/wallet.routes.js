// Wallet Route  — ข้อ 7 ใน docs/api-spec/api-spec.md
const express = require('express');
const { asyncHandler } = require('../utils/response');
const { requireAuth, requireRole } = require('../middlewares/auth');
const walletController = require('../controllers/wallet.controller');

const router = express.Router();

// 7.1 ดูยอดเงินคงเหลือและยอดรอรับ (member)
router.get('/', requireAuth, requireRole('member'), asyncHandler(walletController.getWallet));

// 7.2 ดูประวัติธุรกรรม (member)
router.get('/transactions', requireAuth, requireRole('member'), asyncHandler(walletController.getTransactions));

module.exports = router;

