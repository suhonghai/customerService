import { IsArray, IsInt, ArrayMinSize } from 'class-validator';

export class AssignMenusDto {
  @IsArray()
  @ArrayMinSize(0)
  @IsInt({ each: true })
  menuIds!: number[];
}
