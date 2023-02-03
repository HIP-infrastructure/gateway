import {
	Controller,
	Get,
	Post,
	Body,
	Patch,
	Param,
	Delete,
	Query
} from '@nestjs/common'
import { ProjectsService } from './projects.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import { Project } from './entities/project.entity'

@Controller('projects')
export class ProjectsController {
	constructor(private readonly projectsService: ProjectsService) {}

	@Post()
	create(@Body() createProjectDto: CreateProjectDto) {
		return this.projectsService.create(createProjectDto)
	}

	@Get()
	findAll(@Query('userId') userId?: string): Promise<Project[]> {
		if (userId) return this.projectsService.findUserProjects(userId)

		return this.projectsService.findAll()
	}

	@Get(':name')
	findOne(@Param('name') name: string): Promise<Project> {
		return this.projectsService.findOne(name)
	}

	@Patch(':id')
	update(@Param('id') id: string, @Body() updateProjectDto: UpdateProjectDto) {
		return this.projectsService.update(+id, updateProjectDto)
	}

	@Delete(':id')
	remove(@Param('id') id: string) {
		return this.projectsService.remove(+id)
	}

	@Post(':name/invite/:userId')
	invite(@Param('name') name: string, @Param() userId: string) {
		return this.projectsService.invite(name, userId)
	}
}
