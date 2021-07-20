import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
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
  ContainerOptions,
} from './remote-app.types';
import {
  createContainerMachine,
  invokeRemoteContainer,
} from './remote-app.container-machine';
import { CacheService } from '../cache/cache.service';

const INTERVAL = 5;

// TODO:
// websockets
// Reducers for immutable state

@Injectable()
export class RemoteAppService implements OnApplicationShutdown {
  private readonly logger = new Logger('RemoteAppService');
  private containerServices: ContainerService[] = [];

  constructor(private readonly cacheService: CacheService) {
    this.cacheService.get('containers').then((containers) => {
      this.restoreState({ containers });
    });
  }

  /**
   * State Management
   * @param {ContainerContext[]} containers
   * @returns void
   */

  // https://dev.to/bnevilleoneill/state-management-pattern-in-javascript-sharing-data-across-components-2gkj
  dispatch = (action, state, nextState) => {
    switch (action) {
      case 'CREATE':
        state = nextState;
        break;
      case 'KILL':
        state = nextState;
        break;

      default:
        state = nextState;
    }
    return state;
  };

  saveState = async ({
    containers,
  }: {
    containers: ContainerContext[];
  }): Promise<any> => {
    this.cacheService.setContainers(containers);
    this.cacheService.set('containers', containers);
  };

  private restoreState = ({
    containers,
  }: {
    containers?: ContainerContext[];
  }) => {
    // // this.logger.log(JSON.stringify({ containers }), 'restoreMachines')
    if (containers) {
      this.containerServices =
        containers.map((container) => {
          const service = interpret(createContainerMachine(container)).start();
          this.handleTransitionFor(service);

          return service;
        }) || [];
    }
  };

  /**
   * Reducer
   * @param {ContainerService} service
   * @returns void
   */

  private handleTransitionFor = (service: ContainerService) => {
    service.onTransition((state) => {
      if (state.changed) {
        // this.logger.log(
        //   `${JSON.stringify(state.context, null, 2)}`,
        //   'onTransition',
        // );

        if (state.value === ContainerState.DESTROYED) {
          this.removeService(service);
        } else {
          const containers: ContainerContext[] = this.containerServices.map(
            (s) => ({ ...s.state.context, state: state.value }),
          );
          this.saveState({ containers });
        }
      }
    });
  };

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
    const containers = nextServices.map((s) => ({
      ...s.state.context,
      state: s.state.value,
    }));

    this.saveState({ containers });
  };

  onApplicationShutdown() {
    this.containerServices.forEach((s) => s.stop());
    const containers = this.containerServices.map((s) => s.state.context);
    this.saveState({ containers });
  }

  /**
   * Reconciliating remote api state and local servers/app
   * @param void
   * @returns void
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

  async getContainers(uid: string): Promise<APIContainersResponse> {
    // this.logger.log('getServers');
    return {
      data: this.containerServices
        .filter((service) => service.state.context.user === uid)
        .map((service) => {
          const { id, name, user, url, error, type, app, parentId } = service
            .state.context as Partial<ContainerContext & ContainerOptions>;
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

    const context: ContainerContext & ContainerOptions = {
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
  //   }

  //   )

  // }

  async destroyAppsAndSession(id: string): Promise<APIContainerResponse> {
    this.logger.log(id, 'destroyAppsAndSession');
    const service = this.containerServices.find((s) => s.machine.id === id);
    const appServices = this.containerServices.filter(
      (s) => s.state.context.parentId === service.machine.id,
    );
    if (service) {
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
}
