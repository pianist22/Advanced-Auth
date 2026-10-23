import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { env } from "../../../config/env.js";

export const EMAIL_QUEUE_NAME = "email-delivery";

const connection: ConnectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  ...(env.REDIS_PASSWORD
    ? { password: env.REDIS_PASSWORD }
    : {}),
  maxRetriesPerRequest: null,
};

export interface VerificationEmailJob {
  email: string;
  token: string;
}

export const emailQueue =
  new Queue<VerificationEmailJob>(EMAIL_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });

  