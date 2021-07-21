import { Injectable, Logger } from '@nestjs/common';
import { interpret } from 'xstate';
import { Interval } from '@nestjs/schedule';
import {
  APIContainersResponse,
  APIContainerResponse,
  ContainerType,
  ContainerAction,
  ContainerState,
  ContainerContext,
  ContainerService,
  WebdavOptions,
} from './remote-app.types';
import {
  createContainerMachine,
  invokeRemoteContainer,
} from './remote-app.container-machine';
import { CacheService } from '../cache/cache.service';

const INTERVAL = 5;

@Injectable()
export class RemoteAppService {
  private readonly logger = new Logger('RemoteAppService');
  private containerServices: ContainerService[] = [];

  constructor(private readonly cacheService: CacheService) {
    this.restoreCachedContainers();
  }

  /**
  * @Description: Persist a container in cache
  * @param container: {ContainerContext}
  * @return:
  */

  private cacheContainer = async ({ container }: {
    container: ContainerContext;
  }): Promise<any> => {
    this.cacheService.set(`container:${container.id}`, JSON.stringify(container));
    this.cacheService.set(`container:${container.id}:state`, container.state);
    this.cacheService.sadd(`containers`, container.id);
  }

  /**
  * @Description: Remove a container from cache
  * @param containerId: {String} Id of the container
  * @return:
  */

  private removeCacheContainer = (containerId) => {
    this.cacheService.del(`container:${containerId}`);
    this.cacheService.del(`container:${containerId}:state`);
    this.cacheService.srem(`containers`, containerId);
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
      containerIds.map(async (containerId) =>
        await this.cacheService.get(`container:${containerId}`)))

    this.containerServices = containers.map(container => {
      const service = interpret(createContainerMachine(container)).start();
      this.handleTransitionFor(service);

      return service;
    })
  };

  /**
   * @Description: Handle state machine state
   * @return:
   */

  private handleTransitionFor = (service: ContainerService) => {
    service.onTransition((state) => {
      if (state.changed) {
        if (state.value === ContainerState.DESTROYED) {
          this.removeService(service);
        } else {
          this.cacheService.set(`container:${service.machine.id}:state`, service.state.context);
        }
      }
    });
  };

  /**
   * @Description: Remove and stop service from curent state and cache
   * @return:
   */

  private removeService = (service: ContainerService) => {
    const servicesToRemove =
      this.containerServices.filter(
        (s) =>
          s.machine.id === service.machine.id ||
          s.state.context.parentId === service.machine.id,
      ) || [];
    servicesToRemove.forEach((s) => s.stop());

    const nextServices =
      this.containerServices.filter(
        (s) =>
          s.machine.id !== service.machine.id &&
          s.state.context.parentId !== service.machine.id,
      ) || [];
    this.containerServices = nextServices;

    this.removeCacheContainer(service.machine.id)
  };

  /**
   * @Description: Poll remote api to update the status of all containers
   * @return:
   */

  @Interval(INTERVAL * 1000)
  pollRemoteState() {
    const services = [...this.containerServices];
    services?.forEach(async (service) => {
      try {
        // this.logger.debug(
        //   `${JSON.stringify(service.state.context, null, 2)}`,
        //   'pollRemoteState',
        // );
        const context = await invokeRemoteContainer(service.state.context, {
          type: ContainerAction.STATUS,
        });
        // this.logger.debug(`${JSON.stringify(context, null, 2)}`, 'pollRemoteState');

        if (context.error) {
          // this.logger.debug(ContainerAction.SYNC_STOPPED, 'pollRemoteState');
          service.send({
            type: ContainerAction.REMOTE_STOPPED,
            data: context,
          });

          return;
        }

        const childApps = this.containerServices.filter(
          (s) => s.state.context.parentId === service.machine.id,
        );

        switch (service.state.context.nextAction) {
          case ContainerAction.STOP:
            if (childApps.length === 0) {
              service.state.context = {
                ...service.state.context,
                nextAction: ContainerAction.DESTROY,
              };
              service.send({
                type: ContainerAction.STOP,
                nextAction: ContainerAction.DESTROY,
              });
            }
            break;

          case ContainerAction.DESTROY:
            if (childApps.length === 0) {
              service.send({ type: ContainerAction.DESTROY });
            }
            break;

          default:
        }

        switch (context.state) {
          case ContainerState.EXITED:
          case ContainerState.UNINITIALIZED:
            if (service.state.context.nextAction === ContainerAction.DESTROY) {
              if (service.state.context.type === ContainerType.APP) {
                service.send({ type: ContainerAction.DESTROY });
              } else if (childApps.length === 0) {
                service.send({
                  type: ContainerAction.STOP,
                  nextAction: ContainerAction.DESTROY,
                });
              }

              break;
            }

            service.send({
              type: ContainerAction.REMOTE_STOPPED,
              data: {
                ...context,
                error: { message: 'Container is not reachable' },
              },
            });
            break;

          case ContainerState.RUNNING:
            // this.logger.debug(ContainerAction.SYNC_STARTED, 'pollRemoteState');
            service.send({
              type: ContainerAction.REMOTE_STARTED,
              data: context,
              error: undefined,
            });
            break;

          case ContainerState.CREATED:
            service.send({
              type: ContainerAction.REMOTE_CREATED,
              data: context,
              error: undefined,
            });
            break;
        }
      } catch (error) {
        // this.logger.debug(
        //   `${service.machine.id} | local: ${
        //     service.state.value
        //   }, ${JSON.stringify(error)}`,
        //   'pollRemoteState',
        // );
        //this.logger.debug(ContainerAction.SYNC_STOPPED, 'pollRemoteState');
        service.send({ type: ContainerAction.REMOTE_STOPPED, data: error });
      }
    });
  }

  /**
   * @Description: Get all containers from state
   * @param: uid {String} id of the user
   * @return Promise<APIContainersResponse>
   */

  async getContainers(uid: string): Promise<APIContainersResponse> {
    // this.logger.log('getServers');
    return {
      data: this.containerServices
        .filter((service) => service.state.context.user === uid)
        .map((service) => {
          const { id, name, user, url, error, type, app, parentId } = service
            .state.context as Partial<ContainerContext & WebdavOptions>;
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
          };
        }),
      error: null,
    };
  }

  /**
   * @Description: Start a new server container for a user
   * @param id {String} The id of the app
   * @param uid {String} The id of the user
   * @return Promise<APIContainersResponse>
   */

  async startSessionWithUserId(
    id: string,
    uid: string,
  ): Promise<APIContainerResponse> {
    // this.logger.log(id, 'startServer');

    // check for existing
    let service = this.containerServices.find((s) => s.machine.id === id);
    if (service) {
      // this.logger.log(`${id} exists`, 'startServer');

      return service.state.context;
    }
    const sessionNamesArray = this.containerServices
      .filter((s) => s.state.context.type === ContainerType.SERVER)
      .filter((s) => s.state.context.user === uid)
      .map((s) => s.state.context.name)
      .map((n) => parseInt(n));
    const sessionNames = sessionNamesArray.length > 0 ? sessionNamesArray : [0];
    const name = `${Math.max(...sessionNames) + 1}`;
    const context: ContainerContext = {
      id,
      name,
      user: uid,
      url: '',
      state: ContainerState.UNINITIALIZED,
      error: null,
      type: ContainerType.SERVER,
    };
    const serverMachine = createContainerMachine(context);
    service = interpret(serverMachine).start();
    this.handleTransitionFor(service);
    // this.logger.log(`${id} ${ContainerAction.START}`, 'startServer');
    service.send({ type: ContainerAction.START });
    this.containerServices.push(service);

    const nextContext: ContainerContext = {
      ...service.state.context,
      state: service.state.value,
    };

    return {
      data: nextContext,
      error: undefined,
    };
  }

  /**
 * @Description: Start a new app container for a user with Webdav folder mounted
 * @param serverId {String} The id of the server
 * @param appId {String} The id of the app
 * @param appName {String} The name of the app to be started
 * @param password {String} The webdav password for the user
 * @return Promise<APIContainersResponse>
 */

  async startAppWithWebdav(
    serverId: string,
    appId: string,
    appName: string,
    password: string,
  ): Promise<APIContainerResponse> {
    // this.logger.log(serverId, 'startApp');

    // check existing server
    const serverService = this.containerServices.find(
      (s) => s.machine.id === serverId,
    );
    if (!serverService) {
      // this.logger.log(`${serverId} exists`, 'startApp');

      return {
        ...serverService.state.context,
        error: { message: 'Server is not ready', code: '' },
      };
    }

    // check for existing
    let appService = this.containerServices.find((s) => s.machine.id === appId);
    if (appService) {
      // this.logger.log(`${serverId} exists`, 'startApp');

      return appService.state.context;
    }

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
      hippass: password,
      nc: process.env.PRIVATE_WEBDAV_URL,
    };
    const machine = createContainerMachine(context);
    appService = interpret(machine).start();
    this.handleTransitionFor(appService);
    // this.logger.log(`${appId} ${ContainerAction.START}`, 'startApp');
    appService.send({ type: ContainerAction.START });
    this.containerServices.push(appService); // TODO, immutable state by reducer

    const nextContext: ContainerContext = {
      ...appService.state.context,
      state: appService.state.value,
    };

    return {
      data: nextContext,
      error: null,
    };
  }

  // async createSessionWithApp(
  //   id: string,
  //   uid: string,
  //   appId: string,
  //   appName: string,
  //   password: string): Promise<void> {
  //   this.startSessionWithUserId(id, uid).catch().then(({ data, error }) => {
  //     const session = data
  //     this.startAppWithWebdav(id, appId, appName, password)
  //   })
  // }

  /**
  * @Description: Destroy server containers and apps sequentially
  * @param id {String} The id of the server
  * @return Promise<APIContainersResponse>
  */

  destroyAppsAndSession(id: string): APIContainerResponse {
    this.logger.log(id, 'destroyAppsAndSession');
    const service = this.containerServices.find((s) => s.machine.id === id);
    const appServices = this.containerServices.filter(
      (s) => s.state.context.parentId === service.machine.id,
    );
    if (!service) {
      return {
        data: undefined,
        error: {
          code: '',
          message: 'Container is not available'
        },
      };
    }

    // remove already exited apps and session
    if (service.state.value === ContainerState.EXITED) {
      appServices.forEach((s) => {
        s.send({ type: ContainerAction.DESTROY });
      });
      service.send({ type: ContainerAction.DESTROY });
    }
    // Stop apps
    else if (appServices.length > 0) {
      // this.logger.log(`${id} alive`, 'destroyServer');
      appServices.forEach((s) => {
        s.send({
          type: ContainerAction.STOP,
          data: { ...s.state.context, nextAction: ContainerAction.DESTROY },
        });
      });
      service.state.context = {
        ...service.state.context,
        nextAction: ContainerAction.STOP,
      };
    }
    // stop service
    else {
      service.send({
        type: ContainerAction.STOP,
        data: {
          ...service.state.context,
          nextAction: ContainerAction.DESTROY,
        },
      });
    }

    const nextContext: ContainerContext = {
      ...service.state.context,
      state: service.state.value,
    };

    return {
      data: nextContext,
      error: undefined,
    };

  }
}
