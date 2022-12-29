import { Injectable } from '@nestjs/common'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import * as MOCKED_RESPONSE from '../../public/data/projects.json'

@Injectable()
export class ProjectsService {
	/*
	 * TODO:
	 * Mount the Collab Filesystem
	 */
	constructor() {}

	/*
	 * TODO:
	 * 1. Create a new group within iam.ebrains.eu
   * 2. Add the owner as admin to the group
	 * 3. Create a new folder in the Collab Filesystem
	 */
	create(createProjectDto: CreateProjectDto) {
		return 'This action adds a new project'
	}

  findAll() {
    return MOCKED_RESPONSE
	}

  /*
  * TODO:
  * 1. Find all projects where the user is a member at iam.ebrains.eu
  */
  findUserProjects(userId: string) {
    return MOCKED_RESPONSE.filter(p => p.status === 'active')
  }

	findOne(id: number) {
		return `This action returns a #${id} project`
	}

	update(id: number, updateProjectDto: UpdateProjectDto) {
		return `This action updates a #${id} project`
	}

	remove(id: number) {
		return `This action removes a #${id} project`
	}
}
