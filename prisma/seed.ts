import "dotenv/config";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcrypt";

import { PrismaClient } from "../lib/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set.");
}

const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const username = process.env.DEFAULT_ADMIN_USERNAME ?? "admin";
  const password = process.env.DEFAULT_ADMIN_PASSWORD ?? "picloud-dev-password";

  if (password.length < 8) {
    throw new Error("DEFAULT_ADMIN_PASSWORD must be at least 8 characters.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash },
  });

  console.log(`Seeded default user: ${username}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
