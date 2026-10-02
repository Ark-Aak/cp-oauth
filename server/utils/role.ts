import type { Prisma, User } from '@prisma/client';
import prisma from '~/server/utils/prisma';
import { requireRegistrationEnabled } from '~/server/utils/config';

type RoleTransaction = Prisma.TransactionClient;
const INITIAL_ROLE_LOCK_NAMESPACE = 20260517;
const INITIAL_ROLE_LOCK_KEY = 1;

export async function lockAdminRole(tx: RoleTransaction): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INITIAL_ROLE_LOCK_NAMESPACE}::integer, ${INITIAL_ROLE_LOCK_KEY}::integer)`;
}

async function getInitialUserRole(tx: RoleTransaction): Promise<string> {
    const existingAdmin = await tx.user.findFirst({
        where: { role: 'admin' },
        select: { id: true }
    });

    return existingAdmin ? 'user' : 'admin';
}

export async function createUserWithInitialRole<T extends Prisma.UserCreateArgs>(args: T) {
    return prisma.$transaction(async tx => {
        await lockAdminRole(tx);
        await requireRegistrationEnabled(tx);
        const role = await getInitialUserRole(tx);

        const user = (await tx.user.create({
            ...args,
            data: {
                ...args.data,
                role
            }
        } as Prisma.UserCreateArgs)) as User;

        return user as Prisma.UserGetPayload<T>;
    });
}
