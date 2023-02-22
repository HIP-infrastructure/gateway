import {
	Controller,
	Get,
	Post,
	Body,
	Patch,
	Param,
	Delete,
	Query,
	Request as Req,
	Logger
} from '@nestjs/common'
import { Request } from 'express'

import { Project, ProjectsService } from './projects.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'

@Controller('projects')
export class ProjectsController {
	private readonly logger = new Logger('ProjectsController');

	constructor(
		private readonly projectsService: ProjectsService,
		private readonly nextcloudService: NextcloudService
	) {}

	@Get()
	findAll() {
		this.logger.debug(`findAll()`)
		return this.projectsService.findAll()
	}

	@Get('forUser/:userId')
	findUserProjects(@Param('userId') userId: string): Promise<Project[]> {
		this.logger.debug(`findUserProjects(${userId})`)
		return this.projectsService.findUserProjects(userId)
	}

	@Get(':projectName')
	findOne(@Param('projectName') projectName: string): Promise<Project> {
		this.logger.debug(`findOne(${projectName})`)
		return this.projectsService.findOne(projectName)
	}

	@Post()
	create(@Body() createProjectDto: CreateProjectDto) {
		this.logger.debug(`create(${JSON.stringify(createProjectDto)})`)
		return this.projectsService.create(createProjectDto)
	}

	// @Patch(':id')
	// update(@Param('id') id: string, @Body() updateProjectDto: UpdateProjectDto) {
	// 	return this.projectsService.update(+id, updateProjectDto)
	// }

	@Delete(':projectName')
	remove(@Param('projectName') projectName: string, @Req() req: Request) {
		this.logger.debug(`remove(${projectName})`)
		return this.nextcloudService.uid(req).then(userId => {
			return this.projectsService.remove(projectName, userId)
		})
	}

	@Post(':projectName/addUser/:username/')
	addUser(
		@Param('projectName') projectName: string,
		@Param('username') username: string,
		@Req() req: Request
	) {
		this.logger.debug(`addUser(${projectName}, ${username})`)
		return this.nextcloudService.uid(req).then(() => {
			return this.projectsService.addUserToProject(username, projectName)
		})
	}

	@Get(':projectName/files')
	files(
		@Param('projectName') projectName: string,
		@Query('path') path: string,
		@Req() req: Request
	) {
		return this.nextcloudService.uid(req).then(userId => {
			this.logger.debug(`files(${projectName}, ${path}, ${userId})`)
			return this.projectsService.files(projectName, path, userId)
		})
	}
}
