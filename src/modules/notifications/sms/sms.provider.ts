
export interface SendSmsInput {
  phoneNumber: string;
  message: string;
}

export interface SmsProvider {
  send(input: SendSmsInput): Promise<void>;
}
