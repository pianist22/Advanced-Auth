import type { RequestHandler } from "express";
import type { ZodType } from "zod";

interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export const validateRequest = (
  schemas: ValidationSchemas,
): RequestHandler => {
  return (req, _res, next) => {
    try {
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);

        if (!result.success) {
          next(result.error);
          return;
        }
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);

        if (!result.success) {
          next(result.error);
          return;
        }
      }

      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);

        if (!result.success) {
          next(result.error);
          return;
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};