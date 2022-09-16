import { Controller, Get, Param, Request as Req } from '@nestjs/common'
import { Request } from 'express'
import { UsersService } from './users.service'

@Controller('users')
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Get(':userid')
	async findOne(@Param('userid') userid: string, @Req() req: Request) {
		const { cookie, requesttoken } = req.headers
		
		return this.usersService.findOne({ cookie, requesttoken }, userid)
	}
}
