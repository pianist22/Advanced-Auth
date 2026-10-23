import cors from "cors";
import express from "express";
import helmet from "helmet";
import {pinoHttp} from "pino-http";
import { errorHandler } from "./errors/errorHandler.js";
import { logger } from "./lib/logger.js";
import authRoutes from "./modules/auth/auth.routes.js";
import healthRoutes from "./modules/health/health.routes.js";
import { sendSuccess } from "./utils/apiResponse.js";

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  pinoHttp({
    logger,

    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
      }),

      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },

    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) {
        return "error";
      }

      if (res.statusCode >= 400) {
        return "warn";
      }

      return "info";
    },

    customSuccessMessage: (req, res) => {
      return `${req.method} ${req.url} - ${res.statusCode}`;
    },

    customErrorMessage: (req, res) => {
      return `${req.method} ${req.url} - ${res.statusCode}`;
    },
  }),
);

// Routes for the Application 
app.use("/health", healthRoutes);
app.use("/api/v1/auth",authRoutes);



app.get("/", (_req, res) => {
  return sendSuccess(res, {
    message: "Advanced Authentication Platform API",
  });
});

// app.get("/test-error", (_req, _res) => {
//   throw new AppError(
//     "TEST_ERROR",
//     "This is a test application error",
//     400,
//   );
// });

// app.get("/test-unknown-error", (_req, _res) => {
//   throw new Error("Something unexpected happened");
// });

// app.get("/test-success", (_req, res) => {
//   return sendSuccess(res, {
//     message: "Success response is working",
//     timestamp: new Date().toISOString(),
//   });
// });

// app.get("/test-created", (_req, res) => {
//   return sendSuccess(
//     res,
//     {
//       message: "Resource created",
//     },
//     201,
//   );
// });

// const testSchema = z.object({
//   body: z.object({
//     name: z.string().min(3),
//     email: z.email(),
//   }),
// });
// app.post(
//   "/test-validation",
//   validateRequest({body:testSchema}),
//   (_req, res) => {
//     return sendSuccess(res, {
//       message: "Validation successful",
//     });
//   },
// );


// Middleware for handling errors
app.use(errorHandler);

