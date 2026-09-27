import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppConfigService } from './config/app-config.service.js';

/**
 * Shared app configuration applied both by the real bootstrap (main.ts) and
 * by e2e tests, so tests exercise the same prefix/versioning/validation
 * behaviour as production.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfigService);

  // Caddy is the only reverse proxy in front of the API (see
  // docker-compose.yml); trusting exactly one hop means X-Forwarded-* is
  // honored from Caddy but not from an arbitrary client claiming to be one.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.enableCors({ origin: config.app.webOrigin, credentials: true });

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();

  // docs/SECURITY.md: "No exponer Swagger UI públicamente sin una decisión
  // operativa" — V1's decision is to only ever serve it outside production.
  if (!config.app.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Startup ERP API').setVersion('1').build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }
}
