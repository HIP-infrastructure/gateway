import { Controller, Get, Param, Request as Req } from '@nestjs/common'
import { Request } from 'express'
import { NextcloudService, User, GroupFolder } from 'src/nextcloud/nextcloud.service'

const isFulfilled = <T,>(
	p: PromiseSettledResult<T>
): p is PromiseFulfilledResult<T> => p.status === 'fulfilled'

const isRejected = <T,>(
	p: PromiseSettledResult<T>
): p is PromiseRejectedResult => p.status === 'rejected'


@Controller('groups')
export class GroupsController {
	constructor(private readonly nextcloudService: NextcloudService) {}

	@Get(':userid')
	async findGroups(@Param('userid') userid: string, @Req() req: Request): Promise<GroupFolder[]> {
		const uid =  await this.nextcloudService.authUserIdFromRequest(req)
		return await this.nextcloudService.groupFoldersForUserId(uid)
	}
}
