// Auth Controller — ข้อ 1 ใน docs/api-spec/api-spec.md
const parseId = require('../utils/parseId');
const { ok, created } = require('../utils/response');
const authService = require('../services/auth.service');
const userService = require('../services/user.service');

// 1.1 GET /api/auth/terms
async function getTerms(req, res) {
  const data = await authService.getTerms();
  ok(res, data);
}

// 1.2 POST /api/auth/register
async function register(req, res) {
  const userAgent = req.headers['user-agent'] || '';
  const data = await authService.register(req.body, req.ip, userAgent);
  created(res, data);
}

// 1.3 POST /api/auth/otp/verify
async function verifyOtp(req, res) {
  const { userId, code } = req.body;
  const userAgent = req.headers['user-agent'] || '';
  const data = await authService.verifyOtp(userId, code, req.ip, userAgent);
  ok(res, data);
}

// 1.4 POST /api/auth/otp/resend
async function resendOtp(req, res) {
  const { userId } = req.body;
  const data = await authService.resendOtp(userId);
  ok(res, data);
}

// 1.5 POST /api/auth/login
async function login(req, res) {
  const { identifier, password } = req.body;
  const userAgent = req.headers['user-agent'] || '';
  const data = await authService.login(identifier, password, req.ip, userAgent);
  ok(res, data);
}

// 1.6 POST /api/auth/logout
async function logout(req, res) {
  const sessionId = req.session ? req.session.id : null;
  const data = await authService.logout(sessionId);
  ok(res, data);
}

// 1.7 GET /api/auth/me
async function getMe(req, res) {
  const data = await userService.getMe(req.user.id);
  ok(res, data);
}

// 1.8 POST /api/auth/email/verify
async function verifyEmail(req, res) {
  const { token } = req.body;
  const data = await authService.verifyEmail(token);
  ok(res, data);
}

// 1.9 POST /api/auth/email/resend
async function resendEmailVerify(req, res) {
  const data = await authService.resendEmailVerify(req.user.id);
  ok(res, data);
}

// 1.10 POST /api/auth/password/forgot
async function forgotPassword(req, res) {
  const { email } = req.body;
  const data = await authService.forgotPassword(email);
  ok(res, data);
}

// 1.11 POST /api/auth/password/reset
async function resetPassword(req, res) {
  const { token, newPassword } = req.body;
  const data = await authService.resetPassword(token, newPassword);
  ok(res, data);
}

// 1.12 POST /api/auth/password/change
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body; // ชื่อช่องตาม api-spec 1.12
  const currentSessionId = req.session ? req.session.id : null;
  const data = await authService.changePassword(req.user.id, currentSessionId, currentPassword, newPassword);
  ok(res, data);
}

// 1.13 GET /api/auth/sessions
async function getSessions(req, res) {
  const currentSessionId = req.session ? req.session.id : null;
  const data = await authService.getSessions(req.user.id, currentSessionId);
  ok(res, data);
}

// 1.14 DELETE /api/auth/sessions/:id
async function revokeSession(req, res) {
  const sessionIdToRevoke = parseId(req.params.id, 'id');
  const data = await authService.revokeSession(req.user.id, sessionIdToRevoke);
  ok(res, data);
}

module.exports = {
  getTerms,
  register,
  verifyOtp,
  resendOtp,
  login,
  logout,
  getMe,
  verifyEmail,
  resendEmailVerify,
  forgotPassword,
  resetPassword,
  changePassword,
  getSessions,
  revokeSession,
};

