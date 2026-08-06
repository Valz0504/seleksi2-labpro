import 'dotenv/config';
import { randomBytes, scrypt } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not defined`);
  }

  return value;
}

const connectionString = requireEnvironmentVariable('DATABASE_URL');
const adminPassword = requireEnvironmentVariable('SEED_ADMIN_PASSWORD');

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);

  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1 }, (error, key) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(
        [
          'scrypt',
          '16384',
          '8',
          '1',
          salt.toString('base64url'),
          key.toString('base64url'),
        ].join('$'),
      );
    });
  });
}

async function main() {
  const email = 'admin@example.com';
  const existingAdmin = await prisma.user.findUnique({ where: { email } });

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: 'Admin',
        email,
        passwordHash: await hashPassword(adminPassword),
        status: 'ACTIVE',
      },
    });
  } else if (existingAdmin.passwordHash === 'temporary-hash') {
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash: await hashPassword(adminPassword),
      },
    });
  }

  console.log('Seed completed');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
