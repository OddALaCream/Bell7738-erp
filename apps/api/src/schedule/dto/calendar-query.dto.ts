import { IsDateString, Matches } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * docs/API.md "Cronograma y calendarios": "Query requerida: from, to; rango
 * máximo definido para evitar consultas excesivas." The max-range check
 * itself lives in ScheduleService (it depends on both values together).
 */
export class CalendarQueryDto {
  @Matches(DATE_ONLY)
  @IsDateString({ strict: true })
  from!: string;

  @Matches(DATE_ONLY)
  @IsDateString({ strict: true })
  to!: string;
}
