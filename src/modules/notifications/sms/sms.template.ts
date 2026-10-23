
export const buildPhoneVerificationMessage = (
  otp: string,
  expiresInSeconds: number,
): string => {
  const minutes = Math.ceil(expiresInSeconds / 60);

  return `Your verification code is ${otp}. It expires in ${minutes} minutes. Do not share this code with anyone.`;
};
