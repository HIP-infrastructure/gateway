import {
	Body,
	Controller,
	Get,
	Logger,
	Param,
	Post,
	Query,
	Put,
	Delete,
	Request as Req
} from '@nestjs/common'
import { Request } from 'express'
import { RemoteAppService } from './remote-app.service'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { ContainerContext } from './remote-app.types'

export type Workspace = 'private' | 'collab'
export type Backend = 'cpu1' | 'gpu1'

const DEFAULT_BACKEND: Backend = 'gpu1'
@Controller('remote-app')
export class RemoteAppController {
	constructor(
		private readonly remoteAppService: RemoteAppService,
		private readonly nextcloudService: NextcloudService
	) {}

	private readonly logger = new Logger('RemoteAppController')

	@Get('/apps')
	availableApps(@Query('backend') backend: Backend = DEFAULT_BACKEND) {
		return this.remoteAppService.availableApps(backend)
	}

	@Get(':id')
	async getContainer(
		@Param('id') id: string,
		@Req() req: Request
	): Promise<ContainerContext> {
		return this.nextcloudService
			.authenticate(req)
			.then(async () => this.remoteAppService.getContainer(id))
	}

	@Get('/')
	async getContainers(
		@Req() req: Request,
		@Query('workspace') workspace: Workspace,
		@Query('userId') userId: string,
		@Query('groupIds') groupIds: string[],
		@Query('isAdmin') isAdmin: boolean
	): Promise<ContainerContext[]> {
		// In case the groupIds is a single group, convert it to an array.
		// groupIds=HIP-101&groupIds=HIP-102 vs &groupIds=HIP-101
		if (typeof groupIds === 'string') {
			groupIds = [groupIds]
		}
		if (!groupIds) groupIds = []

		this.logger.debug(`getContainers: ${workspace} ${userId} ${groupIds} ${isAdmin}`)

		return isAdmin
			? this.nextcloudService
					.authenticate(req)
					.then(() =>
						this.nextcloudService
							.user(userId)
							.then(
								({ groups }) =>
									groups.includes('admin') &&
									this.remoteAppService.getAllContainers()
							)
					)
			: this.nextcloudService
					.authenticate(req)
					.then(async () =>
						this.remoteAppService.getContainers(workspace, userId, groupIds)
					)
	}

	/* Creating a server for the userId and groupId. */
	@Post('/')
	async createServer(
		@Req() req: Request,
		@Body('workspace') workspace: Workspace,
		@Body('userId') userId: string,
		@Body('groupIds') groupIds: string[]
	): Promise<ContainerContext[]> {
		this.logger.debug(
			`/createServer on ${workspace} for ${userId} and ${groupIds.join(', ')}`
		)
		return this.nextcloudService
			.authenticate(req)
			.then(async () =>
				this.remoteAppService.createServer(
					DEFAULT_BACKEND,
					workspace,
					userId,
					groupIds
				)
			)
	}

	@Post(':serverId/:appName')
	async createApp(
		@Req() req: Request,
		@Param('serverId') serverId: string,
		@Param('appName') appName: string,
		@Body('userId') userId: string
	): Promise<ContainerContext[]> {
		this.logger.debug(`/createApp + ${appName} for ${userId} on ${serverId}`)
		return this.nextcloudService
			.authenticate(req)
			.then(async () =>
				this.remoteAppService.createApp(serverId, appName, userId)
			)
	}

	@Delete(':serverId')
	async removeAppsAndServer(
		@Req() req: Request,
		@Param('serverId') serverId: string,
		@Query('force') force: boolean = false
	): Promise<ContainerContext[]> {
		this.logger.debug(`/removeAppsAndSession at ${serverId}`)
		return this.nextcloudService.uid(req).then(async userId => {
			if (force) return this.remoteAppService.forceRemove(serverId)

			return this.remoteAppService.removeAppsAndServer(serverId, userId)
		})
	}

	@Delete(':serverId/:appId')
	async stopApp(
		@Req() req: Request,
		@Param('serverId') serverId: string,
		@Param('appId') appId: string,
		@Body('userId') userId: string
	): Promise<ContainerContext[]> {
		this.logger.debug(`/stopApp ${appId} for ${userId}`)
		return this.nextcloudService.authenticate(req).then(async () => {
			return await this.remoteAppService.stopAppInServer(
				userId,
				serverId,
				appId
			)
		})
	}

	@Put(':serverId')
	async pauseOrResumeAppsAndSession(
		@Req() req: Request,
		@Param('serverId') serverId: string,
		@Body('userId') userId: string,
		@Body('cmd') cmd: string
	): Promise<ContainerContext[]> {
		this.logger.debug(`/pauseOrResumeAppsAndSession  ${cmd} for ${userId}`)
		return this.nextcloudService.authenticate(req).then(async () => {
			if (cmd === 'pause') {
				return this.remoteAppService.pauseAppsAndServer(userId, serverId)
			}

			return this.remoteAppService.resumeAppsAndServer(userId, serverId)
		})
	}
}
