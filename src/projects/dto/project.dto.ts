import { IsString } from 'class-validator'

export class ProjectDto {
    @IsString()
    readonly id: string

    @IsString()
    readonly name: string

    @IsString()
    readonly description: string

    @IsString()
    readonly logo: string

    @IsString()
    readonly created: string

    @IsString()
    readonly updated: string

    @IsString()
    readonly owner: string // UserDto

    @IsString({each: true})
    readonly members: string[] // UserDto[]
}