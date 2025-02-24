import { Logger } from '@nestjs/common'
import { AnyEventObject, assign, createMachine } from 'xstate'
import { backendConfig, httpService } from './remote-app.service'
import {
	ContainerAction,
	ContainerContext,
	ContainerState,
	ContainerStateMachine,
	ContainerType
} from './remote-app.types'

const toParams = data =>
	Object.keys(data)
		.map(key => `${key}=${encodeURIComponent(data[key])}`)
		.join('&')

const logger = new Logger('Container Machine')

export const invokeRemoteContainer = (
	context: ContainerContext,
	event: AnyEventObject
) => {
	const { type: action } = event
	const { id, userId, type, parentId, groupIds, workspace } = context

	const startApp =
		action === ContainerAction.START && type === ContainerType.APP

	// TODO: remove group- prefix which comes probably from an addition in sociallogin plugin
	const params =
		type === ContainerType.APP
			? {
					sid: parentId,
					aid: id,
					hipuser: userId,
					action,
					...(startApp && {
						nc: context.dataSource.fsUrl,
						ab: context.dataSource.authUrl,
						gf: JSON.stringify(
							context.dataSource.groupFolders.filter(
								({ label }) => label !== 'tutorial_data'
							)
						)
					}),
					app: context.name
			  }
			: {
					sid: id,
					hipuser: userId,
					action,
					groups: JSON.stringify(
						workspace === 'private' ? groupIds : groupIds.map(g => `group-${g}`)
					)
			  }

	const config = backendConfig(context.computeSource.backendId)
	const url = `${config.url}/control/${type}?${toParams(params)}`

	if (action === ContainerAction.START) logger.debug(url)

	return httpService
		.get(url, {
			headers: {
				Authorization: config.auth,
				'Cache-Control': 'no-cache'
			}
		})
		.toPromise()
		.then(axiosResponse => {
			if (axiosResponse.status === 200 && axiosResponse.data) {
				const data = axiosResponse.data
				const stdout = data?.output?.stdout
				const stderr = data?.output?.stderr
				let nextState: ContainerState

				if (stderr) {
					// API returns stderr || stdout inconsistantly
					// logger.debug(stderr, 'stderr')
					// throw new Error(stderr)
				}

				// logger.debug(data, `invokeRemoteContainer-${id}`)
				// logger.debug(stdout, `invokeRemoteContainer-${id}`)

				switch (true) {
					case /Creating/.test(stderr):
						nextState = ContainerState.LOADING
						break

					case /Stopping/.test(stderr):
						nextState = ContainerState.STOPPING
						break

					case /Paused/.test(stdout):
						nextState = ContainerState.PAUSED
						break

					case /Exited/.test(stdout):
						nextState = ContainerState.EXITED
						break

					case /healthy/.test(stdout):
						nextState = ContainerState.RUNNING
						break

					case /starting/.test(stdout):
					case /unhealthy/.test(stdout):
						nextState = ContainerState.CREATED
						break

					default:
						nextState = ContainerState.UNINITIALIZED
				}

				const nextContext = {
					url: `${data.location.url}`,
					state: nextState,
					error: null
				}

				// logger.debug(nextState, `nextState-${id}`)

				return nextContext
			}

			throw new Error('Container API failed to response')
		})
		.catch(error => {
			const { code, message } = error
			logger.error(error)

			return Promise.reject({ error: { message, code } })
		})
}

export const createContainerMachine = (
	context: ContainerContext
): ContainerStateMachine => {
	return createMachine(
		{
			predictableActionArguments: true,
			id: context.id,
			initial: context.state,
			context,
			states: {
				[ContainerState.UNINITIALIZED]: {
					on: {
						[ContainerAction.START]: ContainerState.CREATED,
						[ContainerAction.REMOTE_STARTED]: {
							target: ContainerState.RUNNING,
							actions: ['updateContext']
						}
					}
				},
				[ContainerState.CREATED]: {
					invoke: {
						id: 'startRemoteServer',
						src: invokeRemoteContainer,
						onDone: {
							target: ContainerState.LOADING,
							actions: ['updateContext']
						},
						onError: {
							target: ContainerState.EXITED,
							actions: ['updateContext']
						}
					}
				},
				[ContainerState.LOADING]: {
					on: {
						[ContainerAction.REMOTE_STARTED]: {
							target: ContainerState.RUNNING,
							actions: 'updateContext'
						},
						[ContainerAction.REMOTE_STOPPED]: {
							target: ContainerState.EXITED,
							actions: 'updateContext'
						}
					}
				},
				[ContainerState.RUNNING]: {
					on: {
						[ContainerAction.REMOTE_STOPPED]: {
							target: ContainerState.EXITED,
							actions: 'updateContext'
						},
						[ContainerAction.STOP]: {
							target: ContainerState.STOPPING,
							actions: 'updateContext'
						},
						[ContainerAction.PAUSE]: {
							target: ContainerState.PAUSING,
							actions: 'updateContext'
						},
						[ContainerAction.RESTART]: {
							target: ContainerState.CREATED,
							actions: 'updateContext'
						}
					}
				},
				[ContainerState.PAUSING]: {
					invoke: {
						id: 'startRemoteServer',
						src: invokeRemoteContainer,
						onDone: {
							target: ContainerState.PAUSED,
							actions: ['updateContext']
						},
						onError: {
							target: ContainerState.EXITED,
							actions: ['updateContext']
						}
					}
				},
				[ContainerState.PAUSED]: {
					on: {
						[ContainerAction.REMOTE_STOPPED]: {
							target: ContainerState.EXITED,
							actions: 'updateContext'
						},
						[ContainerAction.RESUME]: {
							target: ContainerState.RESUMING,
							actions: 'updateContext'
						}
					}
				},
				[ContainerState.RESUMING]: {
					invoke: {
						id: 'startRemoteServer',
						src: invokeRemoteContainer,
						onDone: {
							target: ContainerState.RUNNING,
							actions: ['updateContext']
						},
						onError: {
							target: ContainerState.EXITED,
							actions: ['updateContext']
						}
					}
				},
				[ContainerState.STOPPING]: {
					invoke: {
						id: 'stopRemoteServer',
						src: invokeRemoteContainer,
						onDone: {
							target: ContainerState.EXITED,
							actions: ['updateContext']
						},
						onError: {
							target: ContainerState.RUNNING,
							actions: ['updateContext']
						}
					}
				},
				[ContainerState.EXITED]: {
					on: {
						[ContainerAction.REMOTE_STARTED]: {
							target: ContainerState.RUNNING,
							actions: ['updateContext']
						},
						[ContainerAction.REMOTE_CREATED]: {
							target: ContainerState.LOADING,
							actions: ['updateContext']
						},
						[ContainerAction.DESTROY]: ContainerState.DESTROYED,
						[ContainerAction.RESTART]: ContainerState.CREATED
					}
				},
				[ContainerState.DESTROYED]: {
					invoke: {
						id: 'destroyRemoteServer',
						src: invokeRemoteContainer,
						onDone: {
							target: ContainerState.DESTROYED,
							actions: ['updateContext']
						},
						onError: {
							target: ContainerState.DESTROYED,
							actions: ['updateContext']
						}
					}
				}
			}
		},
		{
			actions: {
				updateContext: assign((context: ContainerContext, event: any) => {
					const { nextContext } = event
					logger.debug(
						`${JSON.stringify(nextContext, null, 2)}`,
						'updateContext'
					)

					return { ...context, ...nextContext }
				})
			}
		}
	)
}
