import type { z } from "zod";
import { loginSchema, signupSchema } from "./auth.validation.js";

export type SignupInput = z.infer<typeof signupSchema>;

export type LoginInput = z.infer<typeof loginSchema>;