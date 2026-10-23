import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import type { Prisma } from "@prisma/client";
import type {
  CreateAuditLogInput,
} from "./auditLog.types.js";

export class AuditLogService {
  static async log(input: CreateAuditLogInput): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: input.userId,
          event: input.event,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      logger.error(
        {
          err: error,
          auditEvent: input.event,
          userId: input.userId,
        },
        "Failed to create audit log",
      );
    }
  }
}