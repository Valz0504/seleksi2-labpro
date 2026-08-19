import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/src/generated/prisma/client';
import { getLocalDatabaseUrl } from './server';

const globalDatabase = globalThis as typeof globalThis & {
  appALocalDatabase?: PrismaClient;
};

function createLocalDatabase(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: getLocalDatabaseUrl() }),
  });
}

export function getLocalDatabase(): PrismaClient {
  const database = globalDatabase.appALocalDatabase ?? createLocalDatabase();

  if (process.env.NODE_ENV !== 'production') {
    globalDatabase.appALocalDatabase = database;
  }

  return database;
}
