import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateBroadcastDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message!: string;
}
