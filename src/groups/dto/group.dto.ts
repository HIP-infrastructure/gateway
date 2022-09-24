import { IsString } from 'class-validator'

export class GroupDto {
    @IsString()
    readonly id: string

    @IsString()
    readonly label: string

    @IsString()
    readonly pi: string

    @IsString()
    readonly email: string

    @IsString()
    readonly city: string

    @IsString()
    readonly country: string

    @IsString()
    readonly logo: string

    @IsString()
    readonly description: string

    @IsString()
    readonly website: string
}
