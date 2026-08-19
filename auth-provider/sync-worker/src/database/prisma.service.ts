import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly enabled: boolean;

  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');

    super({
      adapter: new PrismaPg({ connectionString }),
    });
    this.enabled = configService.getOrThrow<boolean>(
      'SYNC_WORKER_CONSUMER_ENABLED',
    );
  }

  async onModuleInit(): Promise<void> {
    if (this.enabled) {
      await this.$connect();
    }
  }

  async close(): Promise<void> {
    if (this.enabled) {
      await this.$disconnect();
    }
  }
}
