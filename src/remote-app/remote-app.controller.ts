import {
	Body,
	Controller,
	Get,
	HttpStatus,
	Logger,
	Param,
	Post,
	Query,
	Put,
	Delete,
	Request as Req,
	Response as Res,
	HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RemoteAppService } from './remote-app.service';
import { NextcloudService } from 'src/nextcloud/nextcloud.service';
import { ContainerContext } from './remote-app.types';

export type Domain = 'center' | 'project';
@Controller('remote-app')
export class RemoteAppController {
	constructor(
		private readonly remoteAppService: RemoteAppService,
		private readonly nextcloudService: NextcloudService
	) { }

	private readonly logger = new Logger('RemoteAppController');

	@Get('/apps')
	availableApps(@Query('domain') domain: Domain = 'center') {
		return this.remoteAppService.availableApps(domain);
	}

	@Get('/containers/:id')
	async getContainer(
		@Param('id') id: string,
		@Req() req: Request,
	): Promise<ContainerContext> {
		return this.nextcloudService
			.authenticate(req)
			.then(async () => this.remoteAppService.getContainer(id));
	}

	@Get('/containers')
	async getContainers(
		@Query('userId') userId: string,
		@Req() req: Request,
		@Query('domain') domain: Domain = 'center',
	): Promise<ContainerContext[]> {
		return this.nextcloudService
			.authenticate(req)
			.then(async () => this.remoteAppService.getContainers(userId, domain));
	}

	@Get('/admin/containers')
	async getAdminContainers(
		@Query('userId') userId: string,
		@Req() req: Request,
		@Query('domain') domain: Domain = 'center'
	): Promise<ContainerContext[]> {
		this.logger.debug(`/getAdminContainers for ${userId}`);
		return this.nextcloudService.authenticate(req).then(async () => {
			const { groups } = await this.nextcloudService.user(userId);
			if (groups.includes('admin')) {
				return this.remoteAppService.getAllContainers(domain);
			}

			return this.remoteAppService.getContainers(userId, domain);
		});
	}

	@Post('/containers')
	async createSession(
		@Body('userId') userId: string,
		@Body('sessionId') sessionId: string,
		@Req() req: Request,
		@Query('domain') domain: Domain = 'center',
	): Promise<ContainerContext[]> {
		this.logger.debug(`/startSessionWithUserId for ${userId}`);
		return this.nextcloudService
			.authenticate(req)
			.then(async () =>
				this.remoteAppService.startSessionWithUserId(sessionId, userId, domain)
			);
	}

	@Post('/containers/:sessionId/apps')
	async createApp(
		@Param('sessionId') sessionId: string,
		@Body('appName') appName: string,
		@Body('appId') appId: string,
		@Body('userId') userId: string,
		@Req() req: Request,
	): Promise<ContainerContext[]> {
		this.logger.debug(`/createApp + ${appName} for ${userId}`);
		return this.nextcloudService
			.authenticate(req)
			.then(async () =>
				this.remoteAppService.startApp(sessionId, appId, appName, userId)
			);
	}

	@Delete('/containers/:sessionId/apps/:appId')
	async stopApp(
		@Param('sessionId') sessionId: string,
		@Param('appId') appId: string,
		@Body('userId') userId: string,
		@Req() req: Request,
	) {
		this.logger.debug(`/stopApp ${appId} for ${userId}`);
		return this.nextcloudService.authenticate(req).then(async () => {
			return await this.remoteAppService.stopAppInSession(
				userId,
				sessionId,
				appId
			);
		});
	}

	@Delete('/containers/:sessionId')
	async removeAppsAndSession(
		@Param('sessionId') sessionId: string,
		@Body('userId') userId: string,
		@Req() req: Request
	) {
		this.logger.debug(`/removeAppsAndSession at ${sessionId} for ${userId}`);
		return this.nextcloudService.authenticate(req).then(async () => {
			return this.remoteAppService.removeAppsAndSession(sessionId, userId);
		});
	}

	@Put('/containers/:sessionId')
	async pauseOrResumeAppsAndSession(
		@Param('sessionId') sessionId: string,
		@Body('userId') userId: string,
		@Body('cmd') cmd: string,
		@Req() req: Request,
	) {
		this.logger.debug(`/pauseOrResumeAppsAndSession  ${cmd} for ${userId}`);
		return this.nextcloudService.authenticate(req).then(async () => {
			if (cmd === 'pause') {
				return this.remoteAppService.pauseAppsAndSession(userId, sessionId);
			} else if (cmd === 'resume') {
				return this.remoteAppService.resumeAppsAndSession(userId, sessionId);
			}

			return HttpStatus.NOT_FOUND;
		});
	}

	@Delete('/containers/force/:sessionId')
	async forceRemove(
		@Param('sessionId') sessionId: string,
		@Req() req: Request,
	) {
		this.logger.debug(`/forceRemove for ${sessionId}`);
		return this.nextcloudService.authenticate(req).then(async () => {
			return this.remoteAppService.forceRemove(sessionId);
		});
	}
}
