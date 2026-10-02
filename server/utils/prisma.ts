import { PrismaClient } from '@prisma/client';

const infrastructure = globalThis as typeof globalThis & { cpOAuthPrisma?: PrismaClient };
const prisma = infrastructure.cpOAuthPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') infrastructure.cpOAuthPrisma = prisma;

export default prisma;
