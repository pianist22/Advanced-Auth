import type { Response } from "express";

interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode = 200,
): Response<SuccessResponse<T>> => {
  return res.status(statusCode).json({
    success: true,
    data,
  });
};