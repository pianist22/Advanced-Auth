import { Prisma } from "@prisma/client";

import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../errors/AppError.js";
import { ERROR_CODES } from "../../../errors/errorCodes.js";
import { normalizePhoneNumber } from "../../../utils/phone.js";
import { hashValue } from "../auth.utils.js";
import {
  OTP_PURPOSE,
  OTP_RESEND_COOLDOWN_SECONDS,
} from "../otp/otp.constants.js";
import { enqueuePhoneVerificationSms } from "../../notifications/sms/sms.service.js";

import {
  createOtp,
  verifyOtp,
} from "../otp/otp.service.js";

import {
  getOtpCooldownKey,
  getOtpRedisKey,
} from "../otp/otp.utils.js";
import { redis } from "../../../lib/redis.js";
import { AUDIT_EVENTS } from "../../audit/auditLog.types.js";
import { AuditLogService } from "../../audit/auditLog.service.js";

interface AddPhoneNumberInput {
  userId: string;
  phoneNumber: string;
}


export const addPhoneNumber = async ({
  userId,
  phoneNumber,
}: AddPhoneNumberInput) => {
  const normalizedPhone =
    normalizePhoneNumber(phoneNumber);

  const existingPhone =
    await prisma.phoneNumber.findUnique({
      where: {
        phoneNumber: normalizedPhone,
      },
      select: {
        id: true,
        userId: true,
      },
    });

  if (existingPhone) {
    throw new AppError(
      ERROR_CODES.PHONE_ALREADY_EXISTS,
      "Phone number is already associated with an account",
      409,
    );
  }

  try {
    const phone =
      await prisma.phoneNumber.create({
        data: {
          userId,
          phoneNumber: normalizedPhone,
          verifiedAt: null,
        },
        select: {
          id: true,
          phoneNumber: true,
          verifiedAt: true,
          createdAt: true,
        },
      });

    await AuditLogService.log({
      userId,
      event: AUDIT_EVENTS.PHONE_ADDED,
      metadata: {
        phoneId: phone.id,
      },
    });

    return phone;
  } catch (error) {
    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AppError(
        ERROR_CODES.PHONE_ALREADY_EXISTS,
        "Phone number is already associated with an account",
        409,
      );
    }

    throw error;
  }
};

export const requestPhoneVerificationOtp = async (
  userId: string,
) => {
  const phone = await prisma.phoneNumber.findFirst({
    where: {
      userId,
      // isPrimary: true,
    },
    select: {
      id: true,
      phoneNumber: true,
      verifiedAt: true,
    },
  });

  if (!phone) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      "Phone number not found",
      404,
    );
  }

  if (phone.verifiedAt) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Phone number is already verified",
      400,
    );
  }

  const normalizedPhone = normalizePhoneNumber(
    phone.phoneNumber,
  );

  const cooldownKey = getOtpCooldownKey(
    OTP_PURPOSE.PHONE_VERIFICATION,
    normalizedPhone,
  );

  const cooldownExists = await redis.exists(
    cooldownKey,
  );

  if (cooldownExists) {
    await AuditLogService.log({
      userId,
      event: AUDIT_EVENTS.OTP_RATE_LIMITED,
      metadata: {
        purpose: OTP_PURPOSE.PHONE_VERIFICATION,
      },
    });
    throw new AppError(
      ERROR_CODES.RATE_LIMITED,
      "Please wait before requesting another OTP",
      429,
    );
  }

  const { otp, expiresInSeconds } = await createOtp({
    purpose: OTP_PURPOSE.PHONE_VERIFICATION,
    phoneNumber: normalizedPhone,
  });

  try {
    await enqueuePhoneVerificationSms({
      phoneNumber: normalizedPhone,
      otp,
      expiresInSeconds,
    });
  } catch (error) {
    // Remove the newly generated OTP so it cannot be used
    // when its delivery could not be queued.
    await redis.del(
      getOtpRedisKey(
        OTP_PURPOSE.PHONE_VERIFICATION,
        normalizedPhone,
      ),
    );

    throw error;
  }

  await redis.set(
    cooldownKey,
    "1",
    "EX",
    OTP_RESEND_COOLDOWN_SECONDS,
  );

  await AuditLogService.log({
    userId,
    event: AUDIT_EVENTS.OTP_REQUESTED,
  });


  return {
    phoneId: phone.id,
    phoneNumber: normalizedPhone,
    expiresInSeconds,
    otp
  };
};

export const verifyPhoneNumber = async ({
  userId,
  otp,
}: {
  userId: string;
  otp: string;
}) => {
  const phone =
    await prisma.phoneNumber.findFirst({
      where: {
        userId,
        // isPrimary: true,
      },
      select: {
        id: true,
        phoneNumber: true,
        verifiedAt: true,
      },
    });

  if (!phone) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      "Phone number not found",
      404,
    );
  }

  if (phone.verifiedAt) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Phone number is already verified",
      400,
    );
  }

  const normalizedPhone =
    normalizePhoneNumber(
      phone.phoneNumber,
    );

  /*
   * Verify OTP without consuming it yet.
   */
  try {
    await verifyOtp({
      purpose:
        OTP_PURPOSE.PHONE_VERIFICATION,

      phoneNumber: normalizedPhone,

      otp,
    });
  } catch (error) {
    await AuditLogService.log({
      userId,
      event: AUDIT_EVENTS.OTP_VERIFICATION_FAILED,
      metadata: {
        purpose: OTP_PURPOSE.PHONE_VERIFICATION,
        phoneId: phone.id,
      },
    });

    throw error;
  }

  /*
   * Mark phone verified.
   */
  const updatedPhone =
    await prisma.phoneNumber.update({
      where: {
        id: phone.id,
      },
      data: {
        verifiedAt: new Date(),
      },
      select: {
        id: true,
        phoneNumber: true,
        // isPrimary: true,
        verifiedAt: true,
      },
    });

  await AuditLogService.log({
    userId,
    event: AUDIT_EVENTS.PHONE_VERIFIED,
    metadata: {
      phoneId: updatedPhone.id,
    },
  });

  return updatedPhone;
};