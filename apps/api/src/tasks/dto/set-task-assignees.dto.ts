import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

export class SetTaskAssigneesDto {
  // docs/API.md: "Reemplaza el conjunto completo sin permitir cero asignados."
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  assigneeIds!: string[];
}
