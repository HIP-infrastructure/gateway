import {
  Injectable,
  Logger,
  HttpService,
  OnApplicationShutdown,
} from '@nestjs/common';
import { interpret } from 'xstate';
import { Interval } from '@nestjs/schedule';
import {
  APIContainersResponse,
  APIContainerResponse,
  ContainerType,
  ContainerAction,
  ContainerState,
  ContainerStateMachine,
  ContainerContext,
  Error,
  ContainerService,
  ContainerOptions,
} from './remote-app.types';
import {
  createContainerMachine,
  invokeRemoteContainer,
} from './remote-app.container-machine';

const fs = require('fs');
const USER = { hipuser: 'hipuser', sid: 'myserver' };

const CONTAINERS_FILE = 'servers';
const INTERVAL = 5;

// TODO:
// database state management:
// websockets
// Reducers for immutable state

@Injectable()
export class RemoteAppService implements OnApplicationShutdown {
  private readonly logger = new Logger('RemoteAppService');
  private containerServices: ContainerService[] = [];

  constructor(private httpService: HttpService) {
    fs.readFile(CONTAINERS_FILE, 'utf8', (err, data) => {
      //if (err) throw err;
      if (!err && data) {
        try {
          const containers: ContainerContext[] = JSON.parse(data) || [];
          this.restoreState({ containers });
        } catch (e) {
          // this.logger.log(e, 'readFile')
        }
      }
    });
  }

  /**
   * State Management
   * @param {ContainerContext[]} containers
   * @returns void
   */

  saveState = ({ containers }: { containers?: ContainerContext[] }) => {
    // // this.logger.log(JSON.stringify({ containers }), 'saveState')

    if (containers) {
      fs.writeFile(CONTAINERS_FILE, JSON.stringify(containers), () => {
        // this.logger.log('writeFile done')
      });
    }
  };

  private restoreState = ({
    containers,
  }: {
    containers?: ContainerContext[];
  }) => {
    // // this.logger.log(JSON.stringify({ containers }), 'restoreMachines')
    if (containers) {
      this.containerServices =
        containers.map((server) => {
          const service = interpret(createContainerMachine(server)).start();
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
        this.logger.log(
          `${service.state.context.name} ${service.state.context.id} ${state.value}`,
          'onTransition',
        );

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

  // TODO: Reduce immutable state
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

  onApplicationShutdown(signal: string) {
    this.containerServices.forEach((s) => s.stop());
    const containers = this.containerServices.map((s) => s.state.context);
    // this.logger.log(containers)
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
        const nextContext = await invokeRemoteContainer(service.state.context, {
          type: ContainerAction.STATUS,
        });
        // this.logger.debug(`${JSON.stringify({ nextContext })}`, 'pollRemoteState');
        this.logger.debug(
          `${service.state.context.name} - ${service.machine.id} | local: ${service.state.value}, remote: ${nextContext.state}, nextAction: ${service.state.context.nextAction}`,
          'pollRemoteState',
        );

        if (nextContext.error) {
          // this.logger.debug(ContainerAction.SYNC_STOPPED, 'pollRemoteState');
          service.send({
            type: ContainerAction.REMOTE_STOPPED,
            data: nextContext,
          });

          return;
        }

        switch (nextContext.state) {
          case ContainerState.EXITED:
          case ContainerState.UNINITIALIZED:
            if (service.state.context.nextAction === ContainerAction.DESTROY) {
              const childApps = this.containerServices.filter(
                (s) => s.state.context.parentId === service.machine.id,
              );
              if (service.state.context.type === ContainerType.APP) {
                service.send({ type: ContainerAction.DESTROY });
              } else if (childApps.length === 0) {
                service.send({ type: ContainerAction.DESTROY });
              }
              break;
            }

            service.send({
              type: ContainerAction.REMOTE_STOPPED,
              data: {
                ...nextContext,
                error: { message: 'Container is not reachable' },
              },
            });
            break;

          case ContainerState.RUNNING:
            // this.logger.debug(ContainerAction.SYNC_STARTED, 'pollRemoteState');
            service.send({
              type: ContainerAction.REMOTE_STARTED,
              data: nextContext,
              error: undefined,
            });
            break;

          case ContainerState.CREATED:
            service.send({
              type: ContainerAction.REMOTE_CREATED,
              data: nextContext,
              error: undefined,
            });
            break;
        }
      } catch (error) {
        this.logger.debug(
          `${service.machine.id} | local: ${
            service.state.value
          }, ${JSON.stringify(error)}`,
          'pollRemoteState',
        );
        //this.logger.debug(ContainerAction.SYNC_STOPPED, 'pollRemoteState');
        service.send({ type: ContainerAction.REMOTE_STOPPED, data: error });
      }
    });
  }

  async getServers(uid: string): Promise<APIContainersResponse> {
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

  async startServer(id: string): Promise<APIContainerResponse> {
    // this.logger.log(id, 'startServer');

    // check for existing
    let service = this.containerServices.find((s) => s.machine.id === id);
    if (service) {
      // this.logger.log(`${id} exists`, 'startServer');

      return service.state.context;
    }
    const sessionNamesArray = this.containerServices
      .filter((s) => s.state.context.type === ContainerType.SERVER)
      .map((s) => s.state.context.name)
      .map((n) => parseInt(n));
    const sessionNames = sessionNamesArray.length > 0 ? sessionNamesArray : [0];
    const name = `${Math.max(...sessionNames) + 1}`;
    const context: ContainerContext = {
      id,
      name,
      user: USER.hipuser,
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

  async startServerWithUserId(
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

  async destroyServer(id: string): Promise<APIContainerResponse> {
    this.logger.log(id, 'destroyServer');
    const service = this.containerServices.find((s) => s.machine.id === id);
    const appServices = this.containerServices.filter(
      (s) => s.state.context.parentId === service.machine.id,
    );
    if (service) {
      if (service.state.value === ContainerState.EXITED) {
        appServices.forEach((s) => {
          s.send({ type: ContainerAction.DESTROY });
        });
        service.send({ type: ContainerAction.DESTROY });
      } else {
        this.logger.log(`${id} alive`, 'destroyServer');
        appServices.forEach((s) => {
          s.send({
            type: ContainerAction.STOP,
            data: { ...s.state.context, nextAction: ContainerAction.DESTROY },
          });
        });
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

  async restartServer(id: string): Promise<APIContainerResponse> {
    // this.logger.log(id, 'restartServer');
    const service = this.containerServices.find((s) => s.machine.id === id);
    if (service) {
      // this.logger.log(`${id} ${ContainerAction.RESTART}`, 'restartServer');
      service.send({ type: ContainerAction.RESTART });

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

  async stopServer(id: string): Promise<APIContainerResponse> {
    // this.logger.log(id, 'stopServer');
    const service = this.containerServices.find((s) => s.machine.id === id);
    if (service) {
      // this.logger.log(`${id} ${ContainerAction.STOP}`, 'stopServer');
      service.send({ type: ContainerAction.STOP });

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

  async startAppWithWebdav(
    serverId: string,
    appId: string,
    appName: string,
    password: string,
  ): Promise<APIContainerResponse> {
    // this.logger.log(serverId, 'startApp');

    // check existing server
    let serverService = this.containerServices.find(
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

  async startApp(
    serverId: string,
    appId: string,
    appName: string,
  ): Promise<APIContainerResponse> {
    // this.logger.log(serverId, 'startApp');

    // check existing server
    let serverService = this.containerServices.find(
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
      hippass: serverService.state.context.password,
      nc: process.env.COLLAB_WEBDAV_URL,
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
}
