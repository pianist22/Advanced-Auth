import { Router } from "express";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { AuthController } from "./auth.controller.js";
import { loginSchema, refreshTokenSchema, resendVerificationSchema, revokeSessionSchema, signupSchema, verifyEmailSchema } from "./auth.validation.js";


import {
  authenticate,
} from "../../middlewares/authenticate.js";
import { PhoneController } from "./phone/phone.controller.js";
import { addPhoneSchema, requestPhoneVerificationOtpSchema, verifyPhoneSchema } from "./phone/phone.validation.js";
import { forgotPasswordSchema, resetPasswordSchema } from "./passwordReset/passwordReset.validation.js";
import { MfaController } from "./mfa/mfa.controller.js";
import { disableMfaSchema, regenerateRecoveryCodesSchema, verifyMfaChallengeSchema, verifyRecoveryCodeSchema, verifyTotpSchema } from "./mfa/mfa.validation.js";


const router = Router();

router.post(
  "/signup",
  validateRequest({
    body: signupSchema,
  }),
  AuthController.signup,
);


router.post(
  "/email/verify",
  validateRequest({
    body: verifyEmailSchema,
  }),
  AuthController.verifyEmail,
);

router.post(
  "/email/resend",
  validateRequest({
    body: resendVerificationSchema,
  }),
  AuthController.resendEmailVerification,
);

router.post(
  "/login",
  validateRequest({
    body: loginSchema,
  }),
  AuthController.login,
);

router.post(
  "/refresh",
  validateRequest({
    body: refreshTokenSchema,
  }),
  AuthController.refresh,
);

router.post(
  "/logout",
  authenticate,
  AuthController.logout,
);

router.get(
  "/sessions",
  authenticate,
  AuthController.getSessions,
);

router.post(
  "/sessions/revoke-others",
  authenticate,
  AuthController.revokeOtherSessions,
);

router.delete(
  "/sessions/:sessionId",
  authenticate,
  validateRequest({
    params: revokeSessionSchema,
  }),
  AuthController.revokeSession,
);

router.post(
  "/logout-all",
  authenticate,
  AuthController.logoutAll,
);

router.post(
  "/phone",
  authenticate,
  validateRequest({
    body: addPhoneSchema,
  }),
  PhoneController.addPhoneNumber,
);

router.post(
  "/phone/verify/request",
  authenticate,
  validateRequest({
    body: requestPhoneVerificationOtpSchema,
  }),
  PhoneController.requestPhoneVerificationOtp,
);

router.post(
  "/phone/verify",
  authenticate,
  validateRequest({
    body: verifyPhoneSchema,
  }),
  PhoneController.verifyPhoneNumber,
);

router.post(
  "/password/forgot",
  validateRequest({
    body: forgotPasswordSchema,
  }),
  AuthController.forgotPassword,
);

router.post(
  "/password/reset",
  validateRequest({
    body: resetPasswordSchema,
  }),
  AuthController.resetPassword,
);

router.post(
  "/mfa/totp/setup",
  authenticate,
  MfaController.setupTotp,
);

router.post(
  "/mfa/totp/verify",
  authenticate,
  validateRequest({
    body: verifyTotpSchema,
  }),
  MfaController.verifyTotp,
);

router.post(
  "/mfa/recovery/verify",
  authenticate,
  validateRequest({
    body: verifyRecoveryCodeSchema,
  }),
  MfaController.verifyRecoveryCode,
);

router.post(
  "/mfa/challenge/verify",
  validateRequest({
    body: verifyMfaChallengeSchema,
  }),
  MfaController.verifyMfaChallenge,
);

router.post(
  "/mfa/disable",
  authenticate,
  validateRequest({
    body: disableMfaSchema,
  }),
  MfaController.disableMfa,
);

router.post(
  "/mfa/recovery/regenerate",
  authenticate,
  validateRequest({
    body: regenerateRecoveryCodesSchema,
  }),
  MfaController.regenerateRecoveryCodes,
);

export default router;