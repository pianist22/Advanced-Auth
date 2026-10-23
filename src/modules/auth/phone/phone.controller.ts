import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { AppError } from "../../../errors/AppError.js";
import { ERROR_CODES } from "../../../errors/errorCodes.js";
import { addPhoneNumber, requestPhoneVerificationOtp, verifyPhoneNumber } from "./phone.service.js";

const addPhoneNumberController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.auth) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        "Authentication required",
        401,
      );
    }

    const phone = await addPhoneNumber({
      userId: req.auth.userId,
      phoneNumber: req.body.phoneNumber,
    });

    return res.status(201).json({
      success: true,
      data: {
        phone,
      },
    });
  } catch (error) {
    next(error);
  }
};

const requestPhoneVerificationOtpController = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.auth) {
        throw new AppError(
          ERROR_CODES.UNAUTHORIZED,
          "Authentication required",
          401,
        );
      }

      const result =
        await requestPhoneVerificationOtp(
          req.auth.userId,
        );

      return res.status(200).json({
        success: true,
        data: {
          message: "Phone number verification OTP sent successfully",
          phoneId: result.phoneId,
          phoneNumber: result.phoneNumber,
          expiresInSeconds:
            result.expiresInSeconds,
          // otp: result.otp, // Include the OTP in the response for testing purposes  
        },
      });
    } catch (error) {
      next(error);
    }
  };

const verifyPhoneNumberController = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.auth) {
        throw new AppError(
          ERROR_CODES.UNAUTHORIZED,
          "Authentication required",
          401,
        );
      }

      const phone =
        await verifyPhoneNumber({
          userId: req.auth.userId,
          otp: req.body.otp,
        });

      return res.status(200).json({
        success: true,
        data: {
          phone,
        },
      });
    } catch (error) {
      next(error);
    }
  };

export const PhoneController = {
  addPhoneNumber: addPhoneNumberController,
  requestPhoneVerificationOtp: requestPhoneVerificationOtpController,
  verifyPhoneNumber: verifyPhoneNumberController,
};