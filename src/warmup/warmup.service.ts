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
    this.logger.debug(`onApplicationBootstrap`)

    try {
      await this.projectsService.createRootContainerProjectsGroup()
    } catch (error) {
      this.logger.error(error) 
    }

    try {
      await this.projectsService.createProjectsAdminsGroup()
    } catch (error) {
      this.logger.error('409 IS OK, createProjectsAdminsGroup', error)
    }
  }
}
