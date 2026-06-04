-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_File" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "extension" TEXT,
    "path" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    "folderId" TEXT,
    CONSTRAINT "File_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "File_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_File" ("createdAt", "extension", "id", "mimeType", "originalName", "path", "size", "storedName", "updatedAt", "userId") SELECT "createdAt", "extension", "id", "mimeType", "originalName", "path", "size", "storedName", "updatedAt", "userId" FROM "File";
DROP TABLE "File";
ALTER TABLE "new_File" RENAME TO "File";
CREATE UNIQUE INDEX "File_storedName_key" ON "File"("storedName");
CREATE INDEX "File_userId_idx" ON "File"("userId");
CREATE INDEX "File_folderId_idx" ON "File"("folderId");
CREATE INDEX "File_originalName_idx" ON "File"("originalName");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Folder_userId_idx" ON "Folder"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Folder_userId_name_key" ON "Folder"("userId", "name");
