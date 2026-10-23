
import { Worker } from "bullmq";
import type { ConnectionOptions } from "bullmq";

import { env } from "../../../config/env.js";
import { logger } from "../../../lib/logger.js";
import {
  SMS_QUEUE_NAME,
  type PhoneOtpJob,
} from "./sms.queue.js";
import { mockSmsProvider } from "./mockSms.provider.js";
import { buildPhoneVerificationMessage } from "./sms.template.js";

const connection: ConnectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  ...(env.REDIS_PASSWORD
    ? { password: env.REDIS_PASSWORD }
    : {}),
  maxRetriesPerRequest: null,
};

const smsWorker = new Worker<PhoneOtpJob>(
  SMS_QUEUE_NAME,
  async (job) => {
    const { phoneNumber, otp, expiresInSeconds } = job.data;

    const message = buildPhoneVerificationMessage(
      otp,
      expiresInSeconds,
    );

    await mockSmsProvider.send({
      phoneNumber,
      message,
    });

    logger.info(
      { jobId: job.id, notificationType: "phone-verification" },
      "SMS job processed",
    );
  },
  { connection },
);

smsWorker.on("failed", (job, error) => {
  logger.error(
    { jobId: job?.id, err: error },
    "SMS job failed",
  );
});

smsWorker.on("error", (error) => {
  logger.error({ err: error }, "SMS worker error");
});

logger.info(
  { queueName: SMS_QUEUE_NAME },
  "SMS worker started",
);

async function shutdown(): Promise<void> {
  await smsWorker.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
