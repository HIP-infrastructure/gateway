import { IsString } from 'class-validator'

export class UserDto {
	@IsString()
	readonly id: string

	@IsString()
	readonly lastLogin: string

	// @IsString()
	// readonly quota: string

	@IsString()
	readonly email: string

	@IsString()
	readonly displayname: string

	@IsString({ each: true })
	readonly groups: string[]
}
