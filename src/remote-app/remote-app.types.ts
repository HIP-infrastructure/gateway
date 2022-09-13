import { StateMachine, AnyEventObject, Interpreter } from 'xstate'

export type ContainerStateMachine = StateMachine<
	any,
	any,
	AnyEventObject,
	{
		value: any
		context: any
	}
>

export interface APIContainersResponse {
	data: ContainerContext[]
	error: Error
}

export interface APIContainerResponse {
	data: ContainerContext
	error: Error
}

export interface ContainerContext {
	id: string
	name: string
	user: string
	url: string
	state: ContainerState
	nextAction?: ContainerAction
	error: Error | null
	type: ContainerType
	parentId?: string
}

export interface WebdavOptions {
	nc: string
	app: string
	ab: string
	cookie: string
	groupFolders?: {
		name: string
		id: number
		path: string
	}[]
}

export enum ContainerState {
	UNINITIALIZED = 'uninitialized',
	CREATED = 'created',
	LOADING = 'loading',
	RUNNING = 'running',
	PAUSING = 'pausing',
	RESUMING = 'resuming',
	PAUSED = 'paused',
	STOPPING = 'stopping',
	EXITED = 'exited',
	DESTROYED = 'destroyed',
}

export enum ContainerType {
	SERVER = 'server',
	APP = 'app',
}

export enum ContainerAction {
	STATUS = 'status',
	START = 'start',
	STOP = 'stop',
	DESTROY = 'destroy',
	RESTART = 'restart',
	PAUSE = 'pause',
	RESUME = 'resume',
	REMOTE_STARTED = 'sync-started',
	REMOTE_STOPPED = 'sync-stopped',
	REMOTE_PAUSED = 'sync-paused',
	REMOTE_CREATED = 'sync-created',
}

export interface Error {
	code: string
	message: string
}

export type ContainerService = Interpreter<
	any,
	any,
	AnyEventObject,
	{
		value: any
		context: ContainerContext
	}
>
