import { z } from "zod";

import { fileCategories, normalizeOriginalName } from "@/lib/files";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
});

export const fileIdSchema = z.string().cuid();
export const folderIdSchema = z.string().cuid();
export const userIdSchema = z.string().cuid();
export const folderLocationSchema = z.union([z.literal("root"), folderIdSchema]);

export const fileListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  type: z.enum(fileCategories).optional().catch(undefined),
  folderId: folderLocationSchema.optional().catch(undefined),
});

export const folderNameSchema = z
  .string()
  .trim()
  .min(1, "Folder name is required.")
  .max(80, "Folder name must be 80 characters or fewer.")
  .refine((value) => /[^\s\x00-\x1F\x7F]/.test(value), "Folder name is required.")
  .transform(normalizeOriginalName)
  .refine((value) => value.length <= 80, "Folder name must be 80 characters or fewer.");

export const createFolderSchema = z.object({
  name: folderNameSchema,
  parentId: folderLocationSchema.optional(),
});

export const renameFileSchema = z.object({
  originalName: z
    .string()
    .trim()
    .min(1, "File name is required.")
    .max(255, "File name must be 255 characters or fewer.")
    .refine((value) => /[^\s\x00-\x1F\x7F]/.test(value), "File name is required.")
    .refine((value) => {
      const normalizedName = normalizeOriginalName(value);
      return normalizedName !== "upload" || value.toLowerCase() === "upload";
    }, "Enter a valid file name.")
    .transform(normalizeOriginalName)
    .refine((value) => value.length <= 255, "File name must be 255 characters or fewer."),
});

export const editTextFileSchema = z.object({
  content: z.string(),
});

export const moveFileSchema = z.object({
  folderId: folderLocationSchema,
});

export const fileIdsSchema = z.array(fileIdSchema).min(1, "Select at least one file.").max(250, "Select 250 files or fewer.");

export const bulkFilesSchema = z.object({
  fileIds: fileIdsSchema,
});

export const bulkMoveFilesSchema = bulkFilesSchema.extend({
  folderId: folderLocationSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z.string().min(12, "New password must be at least 12 characters."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "New password must be different from the current password.",
    path: ["newPassword"],
  });

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Username is required.")
    .max(40, "Username must be 40 characters or fewer.")
    .regex(/^[a-zA-Z0-9._-]+$/, "Use only letters, numbers, dots, underscores, or hyphens."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const updateUserSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters.").optional(),
    isDisabled: z.boolean().optional(),
  })
  .refine((value) => value.password !== undefined || value.isDisabled !== undefined, {
    message: "Choose a user update.",
  });

export type LoginInput = z.infer<typeof loginSchema>;
