import {
  HttpStatus,
  INestApplication,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Request, Response, NextFunction } from 'express';
import { AppConfigService } from './config/app-config.service.js';
import { ApiException } from './common/exceptions.js';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';

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
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

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
      exceptionFactory: (errors) => {
        const details = errors.flatMap((error) => {
          const constraints = error.constraints ?? {};
          return Object.entries(constraints).map(([code, message]) => ({
            field: error.property,
            code,
            message,
          }));
        });
        return new ApiException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          'The request is invalid.',
          details,
        );
      },
    }),
  );

  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

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
