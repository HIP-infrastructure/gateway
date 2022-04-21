import { Logger } from '@nestjs/common'
import { AnyEventObject, assign, createMachine } from 'xstate'
import { httpService } from './remote-app.service'
import {
	ContainerAction, ContainerContext, ContainerState,
	ContainerStateMachine, ContainerType, WebdavOptions
} from './remote-app.types'


const toParams = data =>
	Object.keys(data)
		.map(key => `${key}=${encodeURIComponent(data[key])}`)
		.join('&')

const logger = new Logger('Container Machine')

export const invokeRemoteContainer = (
	context: ContainerContext & WebdavOptions,
	event: AnyEventObject
) => {
	const { type: action } = event
	const { id, user, type, parentId } = context

	const startApp =
		action === ContainerAction.START && type === ContainerType.APP

	const params =
		type === ContainerType.APP
			? {
				sid: parentId,
				aid: id,
				hipuser: user,
				action,
				...(startApp && { nc: context.nc }),
				...(startApp && { hippass: context.hippass }),
				app: context.app,
			}
			: {
				sid: id,
				hipuser: user,
				action,
			}

	const url = `${process.env.REMOTE_APP_API}/control/${type}?${toParams(params)}`

	// if (id === debugId) {
	logger.debug(url, `invokeRemoteContainer-${id}`)
	// }


	return httpService
		.get(url, {
			headers: {
				Authorization: process.env.REMOTE_APP_BASIC_AUTH,
				'Cache-Control': 'no-cache',
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
					error: null,
				}

				// logger.debug(nextState, `nextState-${id}`)

				return nextContext
			}

			throw new Error('Container API failed to response')
		})
		.catch(error => {
			const { code, message } = error
			console.log(error)
			return Promise.reject({ error: { message, code } })
		})
}

export const createContainerMachine = (
	context: ContainerContext
): ContainerStateMachine => {
	return createMachine(
		{
			id: context.id,
			initial: context.state,
			context,
			states: {
				[ContainerState.UNINITIALIZED]: {
					on: {
						[ContainerAction.START]: ContainerState.CREATED,
						[ContainerAction.REMOTE_STARTED]: {
							target: ContainerState.RUNNING,
							actions: ['updateContext'],
						},
					},
				},
				[ContainerState.CREATED]: {
					invoke: {
						id: 'startRemoteServer',
						src: invokeRemoteContainer,
						onDone: {
							target: ContainerState.LOADING,
							actions: ['updateContext'],
						},
						onError: {
							target: ContainerState.EXITED,
							actions: ['updateContext'],
						},
					},
				},
				[ContainerState.LOADING]: {
					on: {
						[ContainerAction.REMOTE_STARTED]: {
							target: ContainerState.RUNNING,
							actions: 'updateContext',
						},
						[ContainerAction.REMOTE_STOPPED]: {
							target: ContainerState.EXITED,
							actions: 'updateContext',
						},
					},
				},
				[ContainerState.RUNNING]: {
					on: {
						[ContainerAction.REMOTE_STOPPED]: {
							target: ContainerState.EXITED,
							actions: 'updateContext',
						},
						[ContainerAction.STOP]: {
							target: ContainerState.STOPPING,
							actions: 'updateContext',
						},
						[ContainerAction.PAUSE]: {
							target: ContainerState.PAUSING,
							actions: 'updateContext',
						},
						[ContainerAction.RESTART]: {
							target: ContainerState.CREATED,
							actions: 'updateContext',
						},
					},
				},
				[ContainerState.PAUSING]: {
					invoke: {
						id: 'startRemoteServer',
						src: invokeRemoteContainer,
						onDone: {
							target: ContainerState.PAUSED,
							actions: ['updateContext'],
						},
						onError: {
							target: ContainerState.EXITED,
							actions: ['updateContext'],
						},
					},
				},
				[ContainerState.PAUSED]: {
					on: {
						[ContainerAction.REMOTE_STOPPED]: {
							target: ContainerState.EXITED,
							actions: 'updateContext',
						},
						[ContainerAction.RESUME]: {
							target: ContainerState.RESUMING,
							actions: 'updateContext',
						},
					},
				},
				[ContainerState.RESUMING]: {
					invoke: {
						id: 'startRemoteServer',
						src: invokeRemoteContainer,
						onDone: {
							target: ContainerState.RUNNING,
							actions: ['updateContext'],
						},
						onError: {
							target: ContainerState.EXITED,
							actions: ['updateContext'],
						},
					},
				},
				[ContainerState.STOPPING]: {
					invoke: {
						id: 'stopRemoteServer',
						src: invokeRemoteContainer,
						onDone: {
							target: ContainerState.EXITED,
							actions: ['updateContext'],
						},
						onError: {
							target: ContainerState.RUNNING,
							actions: ['updateContext'],
						},
					},
				},
				[ContainerState.EXITED]: {
					on: {
						[ContainerAction.REMOTE_STARTED]: {
							target: ContainerState.RUNNING,
							actions: ['updateContext'],
						},
						[ContainerAction.REMOTE_CREATED]: {
							target: ContainerState.LOADING,
							actions: ['updateContext'],
						},
						[ContainerAction.DESTROY]: ContainerState.DESTROYED,
						[ContainerAction.RESTART]: ContainerState.CREATED,
					},
				},
				[ContainerState.DESTROYED]: {
					invoke: {
						id: 'destroyRemoteServer',
						src: invokeRemoteContainer,
						onDone: {
							target: ContainerState.DESTROYED,
							actions: ['updateContext'],
						},
						onError: {
							target: ContainerState.DESTROYED,
							actions: ['updateContext'],
						},
					},
				},
			},
		},
		{
			actions: {
				updateContext: assign((context: ContainerContext, event) => {
					const { nextContext } = event
					logger.log(`${JSON.stringify(nextContext, null, 2)}`, 'updateContext')

					return { ...context, ...nextContext }
				}),
			},
		}
	)
}
