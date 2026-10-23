import { prisma } from "../lib/prisma.js";
import { createAuthenticationSession } from "../modules/auth/session.service.js";

const testAuthenticationSession = async (): Promise<void> => {
  try {
    const user = await prisma.user.findFirst();

    if (!user) {
      throw new Error(
        "No user found. Create a user through signup first.",
      );
    }

    const result =
      await createAuthenticationSession({
        userId: user.id,
        userAgent: "Test Browser",
        ipAddress: "127.0.0.1",
      });

    console.log("Session created:");
    console.log({
      sessionId: result.sessionId,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    console.error("Authentication session test failed");
    console.error(error);

    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

await testAuthenticationSession();