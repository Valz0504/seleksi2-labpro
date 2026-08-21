import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { CONTROL_PANEL_ADMIN_GROUP_NAME } from '../src/auth/control-panel-access.constants';
import { hashPassword } from '../src/common/security/password';
import { hashSecret } from '../src/common/security/secret';
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

const relyingApplications = [
  {
    name: 'App A',
    groupName: 'app-a-users',
    clientId: requireEnvironmentVariable('APP_A_CLIENT_ID'),
    clientSecret: requireEnvironmentVariable('APP_A_CLIENT_SECRET'),
    redirectUri: requireEnvironmentVariable('APP_A_REDIRECT_URI'),
    launchUrl: requireEnvironmentVariable('APP_A_LAUNCH_URL'),
    logoutNotificationUrl: requireEnvironmentVariable(
      'APP_A_LOGOUT_NOTIFICATION_URL',
    ),
  },
  {
    name: 'App B',
    groupName: 'app-b-users',
    clientId: requireEnvironmentVariable('APP_B_CLIENT_ID'),
    clientSecret: requireEnvironmentVariable('APP_B_CLIENT_SECRET'),
    redirectUri: requireEnvironmentVariable('APP_B_REDIRECT_URI'),
    launchUrl: requireEnvironmentVariable('APP_B_LAUNCH_URL'),
    logoutNotificationUrl: requireEnvironmentVariable(
      'APP_B_LOGOUT_NOTIFICATION_URL',
    ),
  },
] as const;

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const email = 'admin@example.com';
  const existingAdmin = await prisma.user.findUnique({ where: { email } });
  let adminId: string;

  if (!existingAdmin) {
    const admin = await prisma.user.create({
      data: {
        name: 'Admin',
        email,
        passwordHash: await hashPassword(adminPassword),
        status: 'ACTIVE',
      },
    });
    adminId = admin.id;
  } else {
    const admin = await prisma.user.update({
      where: { email },
      data: {
        ...(!existingAdmin.passwordHash.startsWith('$argon2id$')
          ? { passwordHash: await hashPassword(adminPassword) }
          : {}),
      },
    });
    adminId = admin.id;
  }

  const controlPanelAdminGroup = await prisma.group.upsert({
    where: { name: CONTROL_PANEL_ADMIN_GROUP_NAME },
    update: {},
    create: {
      name: CONTROL_PANEL_ADMIN_GROUP_NAME,
      description: 'Users allowed to access the Auth Provider Control Panel',
    },
  });

  await prisma.userGroup.upsert({
    where: {
      userId_groupId: {
        userId: adminId,
        groupId: controlPanelAdminGroup.id,
      },
    },
    update: {},
    create: {
      userId: adminId,
      groupId: controlPanelAdminGroup.id,
    },
  });

  for (const relyingApplication of relyingApplications) {
    const group = await prisma.group.upsert({
      where: { name: relyingApplication.groupName },
      update: {},
      create: {
        name: relyingApplication.groupName,
        description: `Users allowed to access ${relyingApplication.name}`,
      },
    });

    const application = await prisma.application.upsert({
      where: { clientId: relyingApplication.clientId },
      update: {},
      create: {
        name: relyingApplication.name,
        clientId: relyingApplication.clientId,
        clientSecretHash: hashSecret(relyingApplication.clientSecret),
        launchUrl: relyingApplication.launchUrl,
        logoutNotificationUrl: relyingApplication.logoutNotificationUrl,
      },
    });

    await prisma.userGroup.upsert({
      where: {
        userId_groupId: {
          userId: adminId,
          groupId: group.id,
        },
      },
      update: {},
      create: {
        userId: adminId,
        groupId: group.id,
      },
    });

    await prisma.applicationRedirectUri.upsert({
      where: {
        applicationId_redirectUri: {
          applicationId: application.id,
          redirectUri: relyingApplication.redirectUri,
        },
      },
      update: {},
      create: {
        applicationId: application.id,
        redirectUri: relyingApplication.redirectUri,
      },
    });

    await prisma.applicationGroupPolicy.upsert({
      where: {
        applicationId_groupId_effect: {
          applicationId: application.id,
          groupId: group.id,
          effect: 'ALLOW',
        },
      },
      update: {},
      create: {
        applicationId: application.id,
        groupId: group.id,
        effect: 'ALLOW',
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
