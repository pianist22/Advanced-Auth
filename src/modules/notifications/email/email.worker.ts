import { Worker } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { Resend } from "resend";

import { env } from "../../../config/env.js";
import { logger } from "../../../lib/logger.js";
import { EMAIL_QUEUE_NAME } from "./email.queue.js";
import type { VerificationEmailJob } from "./email.queue.js";
import {
  isEmailVerificationTokenValid,
} from "../../auth/emailVerification.service.js";

const connection: ConnectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  ...(env.REDIS_PASSWORD
    ? { password: env.REDIS_PASSWORD }
    : {}),
  maxRetriesPerRequest: null,
};

const worker = new Worker<VerificationEmailJob>(
  EMAIL_QUEUE_NAME,
  async (job) => {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
      throw new Error(
        "Email delivery is not configured.",
      );
    }

    const resend = new Resend(env.RESEND_API_KEY);

    const { email, token } = job.data;

    const tokenIsValid =
      await isEmailVerificationTokenValid(token);

    if (!tokenIsValid) {
      logger.warn(
        {
          jobId: job.id,
          emailType: job.name,
        },
        "Skipping expired email verification job",
      );

      return;
    }

    const result = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: email,
      subject: "Verify your email address",
      text: [
        "Welcome!",
        "",
        "Use the verification token below to verify your email.",
        "",
        token,
        "",
        "This token expires in 15 minutes and can only be used once.",
      ].join("\n"),
      html: `
        <h2>Verify your email address</h2>
        <p>Use the following token to verify your email:</p>
        <p>
          <code style="font-size: 18px; word-break: break-all;">
            ${token}
          </code>
        </p>
        <p>This token expires in 15 minutes and can only be used once.</p>
      `,
    });

    if (result.error) {
      throw new Error(
        `Email provider rejected the request: ${result.error.message}`,
      );
    }

    logger.info(
      {
        jobId: job.id,
        emailType: job.name,
      },
      "Verification email accepted by provider",
    );
  },
  {
    connection,
    concurrency: 5,
  },
);

worker.on("failed", (job, error) => {
  logger.error(
    {
      jobId: job?.id,
      error: error.message,
    },
    "Email delivery job failed",
  );
});

worker.on("error", (error) => {
  logger.error(
    { error: error.message },
    "Email worker error",
  );
});

logger.info("Email worker started");

export default worker;