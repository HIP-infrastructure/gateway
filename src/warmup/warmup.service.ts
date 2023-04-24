import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ProjectsService } from 'src/projects/projects.service'

@Injectable()
export class WarmupService implements OnApplicationBootstrap {
	private readonly logger = new Logger(WarmupService.name)

  constructor(
    private readonly projectsService: ProjectsService
  ) {
  }

  async onApplicationBootstrap() {
    this.logger.debug(`createProjectsGroup`)

    try {
      await this.projectsService.createProjectsGroup()
    } catch (error) {
      this.logger.warn('WARMUP SERVICE: createProjectsGroup, Error 409 IS OK', error)
    }

    try {
      await this.projectsService.createAdminGroup()
    } catch (error) {
      this.logger.warn('WARMUP SERVICE: createAdminGroup, Error 409 IS OK', error)
    }
  }
}
