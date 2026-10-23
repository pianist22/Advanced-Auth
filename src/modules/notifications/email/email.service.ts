import { env } from "../../../config/env.js";
import { emailQueue } from "./email.queue.js";

export const enqueueVerificationEmail = async (
  email: string,
  token: string,
): Promise<void> => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error(
      "Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.",
    );
  }

  await emailQueue.add(
    "email-verification",
    {
      email,
      token,
    },
  );
};