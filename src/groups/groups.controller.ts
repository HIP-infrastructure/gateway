import { Controller, Get, Param, Request as Req } from '@nestjs/common'
import { Request } from 'express'
import { NextcloudService, User } from 'src/nextcloud/nextcloud.service'

const isFulfilled = <T,>(
	p: PromiseSettledResult<T>
): p is PromiseFulfilledResult<T> => p.status === 'fulfilled'

const isRejected = <T,>(
	p: PromiseSettledResult<T>
): p is PromiseRejectedResult => p.status === 'rejected'


@Controller('groups')
export class GroupsController {
	constructor(private readonly nextcloudService: NextcloudService) {}

	@Get(':groupid/users')
	async findOne(@Param('groupid') groupid: string, @Req() req: Request): Promise<User[]> {
		return await this.nextcloudService.authenticate(req).then(async () => {
			const userids = await this.nextcloudService.usersForGroup(groupid)
			const requests = userids.map(uid => this.nextcloudService.user(uid))
			
			const results = await Promise.allSettled(requests)
			const users = results.filter(isFulfilled).map(p => p.value).filter(u => u.enabled)
			// const rejectedReasons = results.filter(isRejected).map(p => p.reason)

			return users
		})
	}
}
