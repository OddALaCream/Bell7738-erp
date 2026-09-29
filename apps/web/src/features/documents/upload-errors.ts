import { ApiError } from '@/lib/api-types';

export interface UploadFailure {
  message: string;
  /** Worth offering "Reintentar": the file itself was fine, the attempt failed. */
  retryable: boolean;
}

/** Turns the API's rejection of an upload into a per-file, human explanation. */
export function describeUploadFailure(error: unknown): UploadFailure {
  if (!(error instanceof ApiError)) {
    return { message: 'No se pudo subir el archivo.', retryable: true };
  }
  switch (error.status) {
    case 0:
      return { message: 'Se perdió la conexión con el servidor.', retryable: true };
    case 403:
      return { message: 'No tienes permiso para subir documentos a este proyecto.', retryable: false };
    case 404:
      return { message: 'El proyecto ya no existe o no tienes acceso.', retryable: false };
    case 413:
      return { message: 'El archivo supera el tamaño máximo permitido por el servidor.', retryable: false };
    case 415:
      return {
        message: 'El servidor no admite este tipo de archivo, o su contenido no coincide con su extensión.',
        retryable: false,
      };
    case 429:
      return { message: 'Demasiados intentos. Espera un momento y vuelve a intentarlo.', retryable: true };
    default:
      return {
        message: error.status >= 500 ? 'El servidor no pudo procesar el archivo.' : error.message,
        retryable: error.status >= 500,
      };
  }
}
