
import type {
  SendSmsInput,
  SmsProvider,
} from "./sms.provider.js";

export const mockSmsProvider: SmsProvider = {
  async send({ phoneNumber, message }: SendSmsInput): Promise<void> {
    // Development-only simulation: no real SMS is sent.
    // Do not log the OTP or the message containing it.
    console.info("[Mock SMS] Delivery simulated", {
      phoneNumber,
      messageType: "phone-verification",
    });
  },
};
