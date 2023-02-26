import { HttpService } from '@nestjs/axios'
import {
	Injectable,
	Logger,
	NotFoundException,
	ServiceUnavailableException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Interval } from '@nestjs/schedule'
import { firstValueFrom } from 'rxjs'
import { uniq } from 'src/common/utils/shared.utils'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { interpret } from 'xstate'
import { CacheService } from '../cache/cache.service'
import {
	createContainerMachine,
	invokeRemoteContainer
} from './remote-app.container-machine'
import { BackendId, WorkspaceType } from './remote-app.controller'
import {
	ContainerAction,
	ContainerContext,
	ContainerState,
	ContainerType,
	ResponseContext
} from './remote-app.types'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

export const httpService = new HttpService()

export const backendConfig = (backendId: BackendId) => {
	const url =
		backendId === 'cpu1'
			? process.env.REMOTE_APP_API
			: process.env.COLLAB_REMOTE_APP_API

	const auth =
		backendId === 'cpu1'
			? process.env.REMOTE_APP_BASIC_AUTH
			: process.env.COLLAB_REMOTE_APP_BASIC_AUTH

	return { url, auth }
}

export const fsConfig = (workspace: WorkspaceType) => {
	const url =
		workspace === 'private'
			? process.env.PRIVATE_FS_URL
			: process.env.COLLAB_FS_URL
	const authurl =
		workspace === 'private'
			? process.env.PRIVATE_FS_AUTH_BACKEND_URL
			: process.env.COLLAB_FS_AUTH_BACKEND_URL

	return { url, authurl }
}

const INTERVAL = Number(process.env.POLLING_INTERVAL) || 5
@Injectable()
export class RemoteAppService {
	private readonly logger = new Logger('RemoteAppService');
	private containerServices: any[] = [];

	constructor(
		private readonly cacheService: CacheService,
		private readonly nextcloudService: NextcloudService,
		private readonly configService: ConfigService
	) {
		// this.cacheService.flushall()
		this.restoreCachedContainers()
	}

	/**
	 * @Description: Handle state machine state
	 * @return:
	 */

	private handleTransitionFor = (service: any) => {
		service.onTransition(state => {
			if (state.changed) {
				if (state.value === ContainerState.DESTROYED) {
					if (state.context.type === ContainerType.APP) {
						this.removeService(service.machine.id)
					} else {
						this.stopService(service.machine.id)
					}
				} else {
					this.setCacheContainer({ context: service.state.context })
				}
			}
		})
	};

	/**
	 * @Description: Remove and stop service and its apps services
	 * from curent state and cache when ContainerState.DESTROYED
	 * @return:
	 */

	private removeService = (id: string) => {
		const servicesToRemove =
			this.containerServices.filter(
				s => s.machine.id === id || s.state.context.parentId === id
			) || []
		servicesToRemove.forEach(s => {
			s.stop()
			this.removeCacheContainer(s.machine.id)
		})

		const nextServices =
			this.containerServices.filter(
				s => s.machine.id !== id && s.state.context.parentId !== id
			) || []
		this.containerServices = nextServices
		this.removeCacheContainer(id)
	};

	private stopService = (id: string) => {
		const servicesToStop =
			this.containerServices.filter(
				s => s.machine.id === id || s.state.context.parentId === id
			) || []
		servicesToStop.forEach(s => {
			s.stop()
		})
	};

	/**
	 * @Description: Persist a container in cache
	 * @param container: {ContainerContext}
	 * @return:
	 */

	private setCacheContainer = async ({
		context
	}: {
		context: Partial<ContainerContext>
	}): Promise<any> => {
		this.cacheService.set(`container:${context.id}`, context)
		this.cacheService.sadd(`containers`, context.id)
	};

	/**
	 * @Description: Remove a container from cache
	 * @param containerId: {String} Id of the container
	 * @return:
	 */

	private removeCacheContainer = containerId => {
		this.cacheService.del(`container:${containerId}`)
		this.cacheService.srem(`containers`, containerId)
	};

	/**
	 * @Description: Restore all containers in cache to services
	 * @return:
	 */

	private restoreCachedContainers = async () => {
		const containerIds = await this.cacheService.smembers('containers')
		if (!containerIds) {
			this.containerServices = []
		}

		const containers: ContainerContext[] = await Promise.all(
			containerIds.map(
				async containerId =>
					await this.cacheService.get(`container:${containerId}`)
			)
		)

		this.containerServices = containers.map(container => {
			const service = interpret(createContainerMachine(container)).start()
			this.handleTransitionFor(service)

			return service
		})
	};

	/**
	 * @Description: Poll remote api to update the status of all containers
	 * @return:
	 */

	@Interval(INTERVAL * 1000)
	pollRemoteState() {
		this.containerServices?.forEach(async service => {
			const currentContext = service.state.context
			try {
				const remoteContext = await invokeRemoteContainer(currentContext, {
					type: ContainerAction.STATUS
				})

				if (remoteContext.error) {
					service.send({
						type: ContainerAction.REMOTE_STOPPED,
						nextContext: remoteContext,
						error: remoteContext.error
					})

					return
				}

				const childApps = this.containerServices.filter(
					s => s.state.context.parentId === service.machine.id
				)

				// Destroy server sequence
				// Remove if there is no more apps inside
				if (
					childApps.length === 0 &&
					currentContext.type === ContainerType.SERVER
				) {
					if (currentContext.nextAction === ContainerAction.STOP) {
						service.send({
							type: ContainerAction.STOP,
							nextContext: {
								...currentContext,
								nextAction: ContainerAction.DESTROY,
								error: undefined
							}
						})
					}
				}

				switch (remoteContext.state) {
					case ContainerState.EXITED:
					case ContainerState.UNINITIALIZED:
						// finish the sequence of destroying servers and apps
						if (currentContext.nextAction === ContainerAction.DESTROY) {
							service.send({
								type: ContainerAction.DESTROY,
								nextContext: {
									...remoteContext,
									error: undefined
								}
							})
							break
						}

						service.send({
							type: ContainerAction.REMOTE_STOPPED,
							nextContext: {
								...remoteContext,
								nextAction: ContainerAction.DESTROY,
								error: { message: 'Container is not reachable' }
							}
						})
						break

					case ContainerState.RUNNING:
						service.send({
							type: ContainerAction.REMOTE_STARTED,
							nextContext: {
								...remoteContext,
								error: undefined
							}
						})
						break

					case ContainerState.CREATED:
						service.send({
							type: ContainerAction.REMOTE_CREATED,
							nextContext: {
								...remoteContext,
								error: undefined
							}
						})
						break
				}
			} catch (error) {
				service.state.context = {
					...currentContext
					// ...error,
				}
			}
		})
	}

	async availableApps(backendId: BackendId): Promise<any> {
		const config = backendConfig(backendId)
		const url = `${config.url}/control/app/list`
		const response = httpService.get(url, {
			headers: {
				Authorization: config.auth,
				'Cache-Control': 'no-cache'
			}
		})

		return await firstValueFrom(response)
			.then(r =>
				Object.keys(r.data).map(k => ({
					...r.data[k],
					name: k,
					label: r.data[k].name
				}))
			)
			.catch(error => {
				const e = error.toJSON()
				this.logger.error(e)

				// Return Service unavailable rather than backend login issue
				//if (e.status) throw new HttpException(e.message, e.status)
				throw new ServiceUnavailableException(e.message)
			})
	}

	/**
	 * @Description: Force Remove container from DB
	 * @param: id {String} id of the container
	 * @return Promise<ContainerContext[]>
	 */

	async forceRemove(id: string): Promise<ResponseContext[]> {
		this.removeService(id)
		return this.containerServices.map(service => {
			const { id, name, userId, groupIds, url, error, type, parentId, workspace } =
				service.state.context
			return {
				id,
				name,
				userId,
				groupIds,
				url,
				error,
				type,
				parentId,
				state: service.state.value as ContainerState,
				workspace,
			}
		})
	}

	/**
	 * @Description: Get all containers from state
	 * @return Promise<ContainerContext>
	 */

	async getAllContainers(): Promise<ResponseContext[]> {
		return (
			this.containerServices
				.map(service => {
					const { id, name, userId, groupIds, url, error, type, parentId, workspace } =
						service.state.context
					return {
						id,
						name,
						userId,
						groupIds,
						url,
						error,
						type,
						parentId,
						state: service.state.value as ContainerState,
						workspace
					}
				}) ?? []
		)
	}

	/**
	 * @Description: Get container from state
	 * @param: id {String} id of the service
	 * @return ContainerContext[]
	 */

	getContainer(id: string): ResponseContext {
		const service = this.containerServices.find(
			service => service.state.context.id === id
		)

		if (!service) throw new NotFoundException('Container not found')

		const { name, userId, groupIds, url, error, type, parentId, workspace } =
			service.state.context

		const pathId = url.split('/').slice(-2, -1) || ''
		const path = encodeURIComponent(`/session/${pathId}/`)

		return {
			id,
			name,
			userId,
			groupIds,
			url: `${url}?path=${path}`,
			error,
			type,
			parentId,
			state: service.state.value as ContainerState,
			workspace
		}
	}

	/**
	 * @Description: Get all containers from state
	 * @param: uid {String} id of the user
	 * @return ContainerContext[]
	 */

	getContainers(workspace: WorkspaceType, userId: string, groupIds: string[]): ResponseContext[] {
		this.logger.debug(`Get containers for ${userId} and group ${groupIds} in ${workspace} workspace`)
		return (
			this.containerServices
				.filter(service => workspace === 'private'
					? service.state.context.userId === userId && service.state.context.workspace === workspace
					: service.state.context.groupIds?.some(id => groupIds.includes(id))
				)
				.map(service => {
					const { id, name, userId, groupIds, url, error, type, parentId, workspace } =
						service.state.context

					return {
						id,
						name,
						userId,
						groupIds,
						url,
						error,
						type,
						parentId,
						state: service.state.value as ContainerState,
						workspace
					}
				}) ?? []
		)
	}

	/**
	 * @Description: Start a new server container for a user
	 * @param serverId {String} The id of the app
	 * @param userId {String} The id of the user
	 * @return Promise<APIContainersResponse>
	 */

	async createServer(
		backendId: BackendId,
		workspace: WorkspaceType,
		userId: string,
		groupIds: string[],
	): Promise<ResponseContext[]> {
		const serverId = uniq()
		let groupFolders: ContainerContext['dataSource']['groupFolders']
		let oidcGroupIds: string[]

		if (workspace === 'private') {
			oidcGroupIds = await this.nextcloudService.oidcGroupsForUser(userId)
			groupFolders = await this.nextcloudService.groupFoldersForUserId(userId)

		} else {
			oidcGroupIds = groupIds
			groupFolders = groupIds.map(group => ({
				id: 1,
				label: group,
				path: `__groupfolders/${group}`
			}))
		}


		// Forge a name for the container
		// That's pretty stupid btw, FIXME
		const sessionNamesArray = this.containerServices
			.filter(s => s.state.context.type === ContainerType.SERVER)
			.filter(s => s.state.context.userId === userId)
			.map(s => s.state.context.name)
			.map(n => parseInt(n))
		const sessionNames = sessionNamesArray.length > 0 ? sessionNamesArray : [0]
		const name = `${Math.max(...sessionNames) + 1}`
		const config = fsConfig(workspace)

		const context: ContainerContext = {
			id: serverId,
			name,
			userId,
			groupIds: oidcGroupIds,
			url: '',
			state: ContainerState.UNINITIALIZED,
			error: null,
			type: ContainerType.SERVER,
			workspace,
			dataSource: {
				fsUrl: config.url,
				authUrl: config.authurl,
				groupFolders
			},
			computeSource: {
				backendId
			},
		}

		const serverMachine = createContainerMachine(context)
		const service = interpret(serverMachine).start()
		this.handleTransitionFor(service)
		service.send({ type: ContainerAction.START })
		this.containerServices.push(service)

		return this.getContainers(workspace, userId, groupIds)
	}

	/**
	 * @Description: Start a new app container for a user with Webdav folder mounted
	 * @param serverId {String} The id of the server
	 * @param appId {String} The id of the app
	 * @param appName {String} The name of the app to be started
	 * @return Promise<ContainerContext[]>
	 */

	async createApp(
		serverId: string,
		appName: string,
		userId: string,
	): Promise<ResponseContext[]> {
		this.logger.debug(`createApp ${serverId}, ${appName} ${userId}`)

		const serverService = this.containerServices.find(
			s => s.machine.id === serverId
		)

		if (!serverService) {
			return {
				...serverService.state.context,
				error: { message: 'Server is not ready', code: '' }
			}
		}

		// check if an existing app already exists on that server
		const serviceWithSameApp: any = this.containerServices.find(
			s => s.state.context.parentId === serverService.id &&
				s.state.context.name === appName
		)

		if (serviceWithSameApp) {
			return serviceWithSameApp.state.context
		}

		const appId = uniq('app')
		const { groupIds,
			workspace,
			dataSource,
			computeSource
		} = serverService.state.context


		const context: ContainerContext = {
			id: appId,
			name: appName,
			userId,
			url: '',
			state: ContainerState.UNINITIALIZED,
			error: null,
			type: ContainerType.APP,
			parentId: serverId,
			groupIds,
			workspace,
			dataSource,
			computeSource
		}

		const machine = createContainerMachine(context)
		const appService = interpret(machine).start()
		this.handleTransitionFor(appService)
		appService.send({ type: ContainerAction.START })
		this.containerServices.push(appService) // TODO, immutable state by reducer

		return this.getContainers(workspace, userId, groupIds)
	}

	/**
	 * @Description: Stop an app in session
	 * @param serverId {String} The id of the server
	 * @param appId {String} The id of the app
	 * @return Promise<ContainerContext[]>
	 */

	async stopAppInServer(
		userId: string,
		serverId: string,
		appId: string
	): Promise<ResponseContext[]> {
		// check existing server
		const service = this.containerServices.find(s => s.machine.id === serverId)

		if (!service) {
			throw new Error('Container is not available')
		}

		let appService = this.containerServices.find(s => s.machine.id === appId &&
			s.state.context.userId === userId)

		appService.send({
			type: ContainerAction.STOP,
			nextContext: {
				...appService.state.context,
				nextAction: ContainerAction.DESTROY,
				error: undefined
			}
		})

		return this.getContainers(appService.state.context.workspace, userId, service.state.context.groupIds)
	}

	/**
	 * @Description: Destroy server containers and apps sequentially
	 * @param serverId {String} The id of the server
	 * @return ContainerContext[]
	 */

	removeAppsAndServer(serverId: string, userId: string): ResponseContext[] {
		const service = this.containerServices.find(s => s.machine.id === serverId)
		const appServices = this.containerServices.filter(
			s => s.state.context.parentId === service.machine.id &&
				s.state.context.userId === userId
		)
		if (!service) {
			throw new Error('Container is not available')
		}

		const currentContext = service.state.context
		// stale: remove already exited apps and session
		if (service.state.value === ContainerState.EXITED) {
			appServices.forEach(s => {
				s.send({ type: ContainerAction.DESTROY })
			})
			service.send({ type: ContainerAction.DESTROY })
		}
		// Stop child apps, schedule a destroy with next
		// Schedule a stop server with nextAction
		else if (appServices.length > 0) {
			appServices.forEach(s => {
				s.send({
					type: ContainerAction.STOP,
					error: undefined,
					nextContext: {
						...s.state.context,
						nextAction: ContainerAction.DESTROY
					}
				})
			})

			// set the server context, don't send a direct action
			// Will be handled in polling, so server and apps get detroyed sequentially
			// TODO: should not be set directly
			service.state.context = {
				...currentContext,
				nextAction: ContainerAction.STOP
			}
		}
		// stop service, schedule destroy
		else {
			service.send({
				type: ContainerAction.STOP,
				nextContext: {
					...currentContext,
					nextAction: ContainerAction.DESTROY,
					error: undefined
				}
			})
		}

		return this.getContainers(currentContext.workspace, userId, currentContext.groupIds)
	}

	pauseAppsAndServer(userId: string, serverId: string): ResponseContext[] {
		const service = this.containerServices.find(s => s.machine.id === serverId &&
			s.state.context.userId === userId)

		if (!service) {
			throw new Error('Container is not available')
		}

		service.send({ type: ContainerAction.PAUSE })
		this.containerServices
			.filter(s => s.state.context.parentId === service.machine.id)
			.forEach(s => {
				s.send({ type: ContainerAction.PAUSE })
			})

		return this.getContainers(service.state.context.workspace, userId, service.state.context.groupIds)
	}

	resumeAppsAndServer(userId: string, serverId: string): ResponseContext[] {
		const service = this.containerServices.find(s => s.machine.id === serverId &&
			s.state.context.userId === userId)

		if (!service) {
			throw new Error('Container is not available')
		}

		service.send({ type: ContainerAction.RESUME })

		this.containerServices
			.filter(s => s.state.context.parentId === service.machine.id)
			.forEach(s => {
				s.send({ type: ContainerAction.RESUME })
			})

		return this.getContainers(service.state.context.workspace, userId, service.state.context.groupIds)
	}
}
