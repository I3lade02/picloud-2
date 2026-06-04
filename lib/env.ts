import "server-only";

import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters."),
  UPLOAD_DIR: z.string().default("./storage/uploads"),
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(52_428_800),
  DEFAULT_ADMIN_USERNAME: z.string().default("admin"),
  DEFAULT_ADMIN_PASSWORD: z.string().min(8).default("picloud-dev-password"),
});

export const env = envSchema.parse(process.env);
