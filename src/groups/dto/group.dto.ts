import { IsString } from 'class-validator'

export class GroupDto {
    @IsString()
    readonly id: string

    @IsString()
    readonly label: string
}
