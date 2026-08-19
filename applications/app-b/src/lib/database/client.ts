import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/src/generated/prisma/client';
import { getLocalDatabaseUrl } from './server';

const globalDatabase = globalThis as typeof globalThis & {
  appBLocalDatabase?: PrismaClient;
};

function createLocalDatabase(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: getLocalDatabaseUrl() }),
  });
}

export function getLocalDatabase(): PrismaClient {
  const database = globalDatabase.appBLocalDatabase ?? createLocalDatabase();

  if (process.env.NODE_ENV !== 'production') {
    globalDatabase.appBLocalDatabase = database;
  }

  return database;
}
