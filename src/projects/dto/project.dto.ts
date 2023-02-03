import { IsString } from 'class-validator'

export class ProjectDto {
    @IsString()
    readonly name: string

    @IsString()
    readonly title: string

    @IsString()
    readonly description: string

    @IsString()
    readonly created: string

    @IsString()
    readonly updated: string

    @IsString({each: true})
    readonly admins: string[] // UserDto[]

    @IsString({each: true})
    readonly members: string[] // UserDto[]
}