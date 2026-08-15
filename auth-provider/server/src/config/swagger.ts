import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configureSwagger(app: INestApplication): void {
  const configService = app.get(ConfigService);

  if (!configService.getOrThrow<boolean>('SWAGGER_ENABLED')) {
    return;
  }

  const cookieName = configService.getOrThrow<string>('SSO_COOKIE_NAME');
  const config = new DocumentBuilder()
    .setTitle('Auth Provider API')
    .setDescription(
      'OpenAPI documentation for central authentication, OAuth Authorization Code + PKCE, user information, and the administrator control plane.',
    )
    .setVersion('1.0.0')
    .addCookieAuth(
      cookieName,
      {
        type: 'apiKey',
        in: 'cookie',
        description:
          'Signed HttpOnly central-session cookie issued by the Auth Provider.',
      },
      'centralSession',
    )
    .addBasicAuth(
      {
        type: 'http',
        scheme: 'basic',
        description:
          'Confidential client credentials in the form client_id:client_secret.',
      },
      'clientCredentials',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Opaque access token',
        description: 'Opaque access token issued by POST /token.',
      },
      'accessToken',
    )
    .addTag('System', 'Service identity and health checks.')
    .addTag('Authentication', 'Credential and central-session lifecycle.')
    .addTag(
      'Authorization',
      'Browser-facing authorization code flow with state and PKCE S256.',
    )
    .addTag('Token', 'Back-channel authorization code exchange.')
    .addTag('User information', 'Audience-bound identity lookup.')
    .addTag('Admin users', 'User, password, status, and membership management.')
    .addTag('Admin groups', 'Group lifecycle and access-impact management.')
    .addTag(
      'Admin applications',
      'OAuth client, redirect URI, secret, and policy management.',
    )
    .build();

  const documentFactory = () =>
    SwaggerModule.createDocument(app, config, {
      operationIdFactory: (controllerKey, methodKey) =>
        `${controllerKey}_${methodKey}`,
    });

  SwaggerModule.setup('docs', app, documentFactory, {
    jsonDocumentUrl: 'docs-json',
    yamlDocumentUrl: 'docs-yaml',
    customSiteTitle: 'Auth Provider API Documentation',
    swaggerOptions: {
      displayRequestDuration: true,
      filter: true,
      persistAuthorization: false,
      withCredentials: true,
    },
  });
}
