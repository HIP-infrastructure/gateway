import { HttpService } from '@nestjs/axios'
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { firstValueFrom } from 'rxjs'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { interpret } from 'xstate'
import { CacheService } from '../cache/cache.service'
import {
	createContainerMachine,
	invokeRemoteContainer,
} from './remote-app.container-machine'
import {
	APIContainerResponse,
	APIContainersResponse,
	ContainerAction,
	ContainerContext,
	ContainerState,
	ContainerType,
	WebdavOptions,
} from './remote-app.types'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

export const httpService = new HttpService()

const INTERVAL = 5
@Injectable()
export class RemoteAppService {
	private readonly logger = new Logger('RemoteAppService')
	private containerServices: any[] = []

	constructor(
		private readonly cacheService: CacheService,
		private readonly nextcloudService: NextcloudService
	) {
		// this.cacheService.flushall()
		this.restoreCachedContainers()
	}

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
					type: ContainerAction.STATUS,
				})

				if (remoteContext.error) {
					// this.logger.debug(JSON.stringify(remoteContext.error, null, 2))
					service.send({
						type: ContainerAction.REMOTE_STOPPED,
						nextContext: remoteContext,
						error: remoteContext.error,
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
					switch (currentContext.nextAction) {
						case ContainerAction.STOP:
							service.send({
								type: ContainerAction.STOP,
								nextContext: {
									...currentContext,
									nextAction: ContainerAction.DESTROY,
									error: undefined,
								},
							})
							break

						default:
					}
				}

				switch (remoteContext.state) {
					case ContainerState.EXITED:
					case ContainerState.UNINITIALIZED:
						// this.logger.debug(remoteContext.state, debugId)
						// finish the sequence of destroying servers and apps
						if (currentContext.nextAction === ContainerAction.DESTROY) {
							service.send({
								type: ContainerAction.DESTROY,
								nextContext: {
									...remoteContext,
									error: undefined,
								},
							})
							break
						}

						service.send({
							type: ContainerAction.REMOTE_STOPPED,
							nextContext: {
								...remoteContext,
								nextAction: ContainerAction.DESTROY,
								error: { message: 'Container is not reachable' },
							},
						})
						break

					case ContainerState.RUNNING:
						service.send({
							type: ContainerAction.REMOTE_STARTED,
							nextContext: {
								...remoteContext,
								error: undefined,
							},
						})
						break

					case ContainerState.CREATED:
						service.send({
							type: ContainerAction.REMOTE_CREATED,
							nextContext: {
								...remoteContext,
								error: undefined,
							},
						})
						break
				}
			} catch (error) {
				service.state.context = {
					...currentContext,
					// ...error,
				}
			}
		})
	}

	async availableApps(): Promise<any> {
		const url = `${process.env.REMOTE_APP_API}/control/app/list`
		const response = httpService.get(url, {
			headers: {
				Authorization: process.env.REMOTE_APP_BASIC_AUTH,
				'Cache-Control': 'no-cache',
			},
		})

		return await firstValueFrom(response)
			.then(r =>
				Object.keys(r.data).map(k => ({
					...r.data[k],
					name: k,
					label: r.data[k].name,
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
	 * @return Promise<APIContainersResponse>
	 */

	async forceRemove(id: string): Promise<APIContainersResponse> {
		this.removeService(id)
		return {
			data: this.containerServices.map(service => {
				const { id, name, user, url, error, type, app, parentId } = service
					.state.context as Partial<ContainerContext & WebdavOptions>
				return {
					id,
					name,
					user,
					url,
					error,
					type,
					app,
					parentId,
					state: service.state.value as ContainerState,
				}
			}),
			error: null,
		}
	}

	/**
	 * @Description: Get all containers from state
	 * @return Promise<APIContainersResponse>
	 */

	async getAllContainers(): Promise<APIContainersResponse> {
		return {
			data:
				this.containerServices.map(service => {
					const { id, name, user, url, error, type, app, parentId } = service
						.state.context as Partial<ContainerContext & WebdavOptions>
					return {
						id,
						name,
						user,
						url,
						error,
						type,
						app,
						parentId,
						state: service.state.value as ContainerState,
					}
				}) ?? [],
			error: null,
		}
	}

	/**
	 * @Description: Get all containers from state
	 * @param: uid {String} id of the user
	 * @return Promise<APIContainersResponse>
	 */

	async getContainers(uid: string): Promise<APIContainersResponse> {
		return {
			data:
				this.containerServices
					.filter(service => service.state.context.user === uid)
					.map(service => {
						const { id, name, user, url, error, type, app, parentId } = service
							.state.context as Partial<ContainerContext & WebdavOptions>
						return {
							id,
							name,
							user,
							url,
							error,
							type,
							app,
							parentId,
							state: service.state.value as ContainerState,
						}
					}) ?? [],
			error: null,
		}
	}

	/**
	 * @Description: Start a new server container for a user
	 * @param id {String} The id of the app
	 * @param uid {String} The id of the user
	 * @return Promise<APIContainersResponse>
	 */

	async startSessionWithUserId(
		id: string,
		uid: string
	): Promise<APIContainerResponse> {
		// check for existing
		let service: any = this.containerServices.find(s => s.machine.id === id)
		if (service) {
			return service.state.context
		}

		const sessionNamesArray = this.containerServices
			.filter(s => s.state.context.type === ContainerType.SERVER)
			.filter(s => s.state.context.user === uid)
			.map(s => s.state.context.name)
			.map(n => parseInt(n))
		const sessionNames = sessionNamesArray.length > 0 ? sessionNamesArray : [0]
		const name = `${Math.max(...sessionNames) + 1}`
		const context: ContainerContext = {
			id,
			name,
			user: uid,
			url: '',
			state: ContainerState.UNINITIALIZED,
			error: null,
			type: ContainerType.SERVER,
		}
		const serverMachine = createContainerMachine(context)
		service = interpret(serverMachine).start()
		this.handleTransitionFor(service)
		service.send({ type: ContainerAction.START })
		this.containerServices.push(service)

		const nextContext: ContainerContext = {
			...service.state.context,
			state: service.state.value,
		}

		return {
			data: nextContext,
			error: undefined,
		}
	}

	/**
	 * @Description: Start a new app container for a user with Webdav folder mounted
	 * @param serverId {String} The id of the server
	 * @param appId {String} The id of the app
	 * @param appName {String} The name of the app to be started
	 * @return Promise<APIContainersResponse>
	 */

	async startApp(
		serverId: string,
		appId: string,
		appName: string,
		userId: string,
		cookie: string,
		requesttoken
	): Promise<APIContainerResponse> {
		// check existing server
		const serverService = this.containerServices.find(
			s => s.machine.id === serverId
		)
		if (!serverService) {
			return {
				...serverService.state.context,
				error: { message: 'Server is not ready', code: '' },
			}
		}

		// check existing app
		let appService: any = this.containerServices.find(
			s => s.machine.id === appId
		)
		if (appService) {
			return appService.state.context
		}

		// get groupfolders mount point
		const groupFolders = await this.nextcloudService.groupFoldersForUserId(
			userId
		)

		const context: ContainerContext & WebdavOptions = {
			id: appId,
			name: appId,
			user: serverService.state.context.user,
			url: '',
			state: ContainerState.UNINITIALIZED,
			error: null,
			type: ContainerType.APP,
			app: appName,
			parentId: serverId,
			nc: process.env.PRIVATE_FS_URL,
			ab: process.env.PRIVATE_FS_AUTH_BACKEND_URL,
			groupFolders: groupFolders.map(({ id, label, path }) => ({
				id,
				label,
				path,
			})),
			cookie,
		}
		const machine = createContainerMachine(context)
		appService = interpret(machine).start()
		this.handleTransitionFor(appService)
		appService.send({ type: ContainerAction.START })
		this.containerServices.push(appService) // TODO, immutable state by reducer

		const nextContext: ContainerContext = {
			...appService.state.context,
			state: appService.state.value,
		}

		return {
			data: nextContext,
			error: null,
		}
	}

	/**
	 * @Description: Stop an app in session
	 * @param serverId {String} The id of the server
	 * @param appId {String} The id of the app
	 * @return Promise<APIContainersResponse>
	 */

	async stopAppInSession(
		serverId: string,
		appId: string
	): Promise<APIContainerResponse> {
		// check existing server
		const service = this.containerServices.find(s => s.machine.id === serverId)

		if (!service) {
			return {
				data: undefined,
				error: {
					code: '',
					message: 'Container is not available',
				},
			}
		}

		let appService = this.containerServices.find(s => s.machine.id === appId)

		appService.send({
			type: ContainerAction.STOP,
			nextContext: {
				...appService.state.context,
				nextAction: ContainerAction.DESTROY,
				error: undefined,
			},
		})

		return {
			data: appService.state.context,
			error: null,
		}
	}

	// /**
	//  * @Description: Start a new app container for a user with Webdav folder mounted
	//  * @param uid {String} The id of the user
	//  * @param appName {String} The name of the app to be started
	//  * @return Promise<APIContainersResponse>
	//  */
	// async startNewSessionAndAppWithWebdav(
	// 	uid: string,
	// 	appName: string,
	// 	cookie: string
	// ): Promise<APIContainerResponse> {
	// 	const id = `session-${Date.now().toString().slice(-3)}`

	// 	const session = await this.startSessionWithUserId(id, uid)
	// 	const appId = `app-${Date.now().toString().slice(-3)}`
	// 	await this.startApp(session.data.id, appId, appName, cookie)

	// 	return { data: session.data, error: session.error }
	// }

	/**
	 * @Description: Destroy server containers and apps sequentially
	 * @param serverId {String} The id of the server
	 * @return Promise<APIContainersResponse>
	 */

	removeAppsAndSession(serverId: string): APIContainerResponse {
		const service = this.containerServices.find(s => s.machine.id === serverId)
		const appServices = this.containerServices.filter(
			s => s.state.context.parentId === service.machine.id
		)
		if (!service) {
			return {
				data: undefined,
				error: {
					code: '',
					message: 'Container is not available',
				},
			}
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
						nextAction: ContainerAction.DESTROY,
					},
				})
			})

			// set the server context, don't send a direct action
			// Will be handled in polling, so server and apps get detroyed sequentially
			// TODO: should not be set directly
			service.state.context = {
				...currentContext,
				nextAction: ContainerAction.STOP,
			}
		}
		// stop service, schedule destroy
		else {
			service.send({
				type: ContainerAction.STOP,
				nextContext: {
					...currentContext,
					nextAction: ContainerAction.DESTROY,
					error: undefined,
				},
			})
		}

		const nextContext: ContainerContext = {
			...currentContext,
			state: service.state.value,
		}

		return {
			data: nextContext,
			error: undefined,
		}
	}

	pauseAppsAndSession(serverId: string) {
		const service = this.containerServices.find(s => s.machine.id === serverId)

		if (!service) {
			return {
				data: undefined,
				error: {
					code: '',
					message: 'Container is not available',
				},
			}
		}

		const currentContext = service.state.context
		service.send({ type: ContainerAction.PAUSE })

		this.containerServices
			.filter(s => s.state.context.parentId === service.machine.id)
			.forEach(s => {
				s.send({ type: ContainerAction.PAUSE })
			})

		const nextContext: ContainerContext = {
			...currentContext,
			state: service.state.value,
		}

		return {
			data: nextContext,
			error: undefined,
		}
	}

	resumeAppsAndSession(serverId: string) {
		const service = this.containerServices.find(s => s.machine.id === serverId)

		if (!service) {
			return {
				data: undefined,
				error: {
					code: '',
					message: 'Container is not available',
				},
			}
		}

		const currentContext = service.state.context
		service.send({ type: ContainerAction.RESUME })

		this.containerServices
			.filter(s => s.state.context.parentId === service.machine.id)
			.forEach(s => {
				s.send({ type: ContainerAction.RESUME })
			})

		const nextContext: ContainerContext = {
			...currentContext,
			state: service.state.value,
		}

		return {
			data: nextContext,
			error: undefined,
		}
	}

	/**
	 * @Description: Handle state machine state
	 * @return:
	 */

	private handleTransitionFor = (service: any) => {
		service.onTransition(state => {
			if (state.changed) {
				if (state.value === ContainerState.DESTROYED) {
					this.removeService(service.machine.id)
				} else {
					this.setCacheContainer({ context: service.state.context })
				}
			}
		})
	}

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
	}

	/**
	 * @Description: Persist a container in cache
	 * @param container: {ContainerContext}
	 * @return:
	 */

	private setCacheContainer = async ({
		context,
	}: {
		context: Partial<ContainerContext & WebdavOptions>
	}): Promise<any> => {
		this.cacheService.set(`container:${context.id}`, context)
		this.cacheService.sadd(`containers`, context.id)
	}

	/**
	 * @Description: Remove a container from cache
	 * @param containerId: {String} Id of the container
	 * @return:
	 */

	private removeCacheContainer = containerId => {
		this.cacheService.del(`container:${containerId}`)
		this.cacheService.srem(`containers`, containerId)
	}

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

		// this.logger.debug(JSON.stringify(containers, null, 2))
		this.containerServices = containers.map(container => {
			const service = interpret(createContainerMachine(container)).start()
			this.handleTransitionFor(service)

			return service
		})
	}
}
