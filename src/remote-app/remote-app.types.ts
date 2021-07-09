import { StateMachine, AnyEventObject, Interpreter } from 'xstate';

export type ContainerStateMachine = StateMachine<any, any, AnyEventObject, {
    value: any;
    context: any;
}>

export interface APIContainersResponse {
    data: ContainerContext[];
    error: Error;
}

export interface APIContainerResponse {
    data: ContainerContext;
    error: Error;
}

export interface ContainerContext {
    id: string;
    name: string;
    user: string;
    password?: string;
    url: string;
    state: ContainerState;
    nextAction?: ContainerAction;
    error: Error | null;
    type: ContainerType;
    parentId?: string;
}

export interface ContainerOptions {
    hippass: string;
    nc: string;
    app: string;
}

export enum ContainerState {
    UNINITIALIZED = 'uninitialized',
    CREATED = 'created',
    LOADING = 'loading',
    RUNNING = 'running',
    STOPPING = 'stopping',
    EXITED = 'exited',
    DESTROYED = 'destroyed'
}

export enum ContainerType {
    SERVER = 'server',
    APP = 'app'
}

export enum ContainerAction {
    STATUS = 'status',
    START = 'start',
    STOP = 'stop',
    DESTROY = 'destroy',
    RESTART = 'restart',
    REMOTE_STARTED = 'sync-started',
    REMOTE_STOPPED = 'sync-stopped',
    REMOTE_CREATED = 'sync-created'
}

export interface Error {
    code: string;
    message: string;
}

export type ContainerService = Interpreter<any, any, AnyEventObject, {
    value: any;
    context: ContainerContext;
}>