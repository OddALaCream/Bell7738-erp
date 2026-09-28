import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema.js';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.configService.get(key, { infer: true });
  }

  get app() {
    return {
      nodeEnv: this.get('NODE_ENV'),
      isProduction: this.get('NODE_ENV') === 'production',
      port: this.get('PORT'),
      logLevel: this.get('LOG_LEVEL'),
      baseUrl: this.get('APP_BASE_URL'),
      webOrigin: this.get('WEB_ORIGIN'),
      timeZone: this.get('APP_TIME_ZONE'),
    };
  }

  get database() {
    return {
      url: this.get('DATABASE_URL'),
    };
  }

  get auth() {
    return {
      accessTokenSecret: this.get('JWT_ACCESS_SECRET'),
      refreshTokenSecret: this.get('JWT_REFRESH_SECRET'),
      refreshTokenHashSecret: this.get('REFRESH_TOKEN_HASH_SECRET'),
      accessTokenTtl: this.get('ACCESS_TOKEN_TTL'),
      refreshTokenTtl: this.get('REFRESH_TOKEN_TTL'),
      cookieSecure: this.get('COOKIE_SECURE') ?? this.app.isProduction,
      invitationTtlHours: this.get('INVITATION_TTL_HOURS'),
    };
  }

  get projects() {
    return {
      endingSoonDays: this.get('PROJECTS_ENDING_SOON_DAYS'),
    };
  }

  get owner() {
    return {
      email: this.get('OWNER_EMAIL'),
      password: this.get('OWNER_PASSWORD'),
      firstName: this.get('OWNER_FIRST_NAME'),
      lastName: this.get('OWNER_LAST_NAME'),
    };
  }

  get storage() {
    return {
      root: this.get('STORAGE_ROOT'),
      maxUploadBytes: this.get('MAX_UPLOAD_BYTES'),
      allowedExtensions: new Set(this.get('DOCUMENT_ALLOWED_EXTENSIONS')),
    };
  }

  get smtp() {
    const host = this.get('SMTP_HOST');
    const port = this.get('SMTP_PORT');
    const user = this.get('SMTP_USER');
    const password = this.get('SMTP_PASSWORD');
    const from = this.get('SMTP_FROM');
    const enabled = Boolean(host && port && user && password && from);
    return {
      enabled,
      host,
      port,
      secure: this.get('SMTP_SECURE') ?? true,
      user,
      password,
      from,
    };
  }

  get webPush() {
    const publicKey = this.get('VAPID_PUBLIC_KEY');
    const privateKey = this.get('VAPID_PRIVATE_KEY');
    const subject = this.get('VAPID_SUBJECT');
    const enabled = Boolean(publicKey && privateKey && subject);
    return { enabled, publicKey, privateKey, subject };
  }
}
