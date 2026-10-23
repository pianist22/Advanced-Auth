import { AppError } from "../errors/AppError.js";

const error = new AppError(
  "USER_NOT_FOUND",
  "User not found",
  404,
);

console.log("Name:", error.name);
console.log("Code:", error.code);
console.log("Message:", error.message);
console.log("Status:", error.statusCode);
console.log("Operational:", error.isOperational);