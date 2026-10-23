// We will create a utility function to catch async errors in our route handlers and pass them to the error handling middleware.

import { Request, Response, NextFunction } from "express";

export const catchAsync = (fn: any) => (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);