import { Request, Response } from "express";

import { catchAsync } from "../../../utils/catchAsync.js";
import { MfaService } from "./mfa.service.js";
import { sendSuccess } from "../../../utils/apiResponse.js";
import { verifyMfaChallenge } from "./mfaChallenge.service.js";

const setupTotpHandler = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.auth!.userId;

    const result =
      await MfaService.setupTotp(userId);

    return sendSuccess(res, result);
  },
);

const verifyTotpHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await MfaService.verifyTotp(
      req.auth!.userId,
      req.body.code,
    );

    return sendSuccess(res, result);
  },
);

const verifyRecoveryCodeHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await MfaService.verifyRecoveryCode(
      req.auth!.userId,
      req.body.recoveryCode,
    );

    return sendSuccess(res, result);
  },
);

const verifyMfaChallengeHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await verifyMfaChallenge({
      ...req.body,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });

    return sendSuccess(res, result);
  },
);

const disableMfaHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await MfaService.disableMfa(
      req.auth!.userId,
      {
        password: req.body.password,
        method: req.body.method,
        code: req.body.code,
      },
      {
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
      },
    );

    return sendSuccess(res, result);
  },
);

const regenerateRecoveryCodesHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await MfaService.regenerateRecoveryCodes(
      req.auth!.userId,
      {
        password: req.body.password,
        code: req.body.code,
      },
      {
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
      },
    );

    return sendSuccess(res, result);
  },
);



export const MfaController = {
  setupTotp: setupTotpHandler,
  verifyTotp: verifyTotpHandler,
  verifyRecoveryCode: verifyRecoveryCodeHandler,
  verifyMfaChallenge: verifyMfaChallengeHandler,
  disableMfa: disableMfaHandler,
  regenerateRecoveryCodes: regenerateRecoveryCodesHandler,
};