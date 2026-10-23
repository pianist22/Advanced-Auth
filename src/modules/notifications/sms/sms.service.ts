
import { smsQueue } from "./sms.queue.js";
import type { PhoneOtpJob } from "./sms.queue.js";

export const enqueuePhoneVerificationSms = async (
  data: PhoneOtpJob,
): Promise<void> => {
  await smsQueue.add("phone-verification", data);
};
