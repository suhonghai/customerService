import { IsString, MinLength, MaxLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(50)
  newPassword!: string;
}
