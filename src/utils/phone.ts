import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

import { AppError } from "../errors/AppError.js";
import { ERROR_CODES } from "../errors/errorCodes.js";

export const normalizePhoneNumber = (
  phoneNumber: string,
  defaultCountry: CountryCode = "IN",
): string => {
  const parsedPhoneNumber =
    parsePhoneNumberFromString(
      phoneNumber,
      defaultCountry,
    );

  if (!parsedPhoneNumber) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Invalid phone number",
      400,
    );
  }

  if (!parsedPhoneNumber.isValid()) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Invalid phone number",
      400,
    );
  }

  return parsedPhoneNumber.number;
};