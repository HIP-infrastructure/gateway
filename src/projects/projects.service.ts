import { Injectable } from '@nestjs/common'
import { Group, IamService } from 'src/iam/iam.service'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'

interface Project extends Group {
	members?: string[]
	admins?: string[]
}

// FIXME: CHECKIF GROUP EXISTS
const ROOT_PROJECT_GROUP_NAME = 'HIP-Projects'

// FIXME: regex from config
const SERVICE_ACCOUNT = 'service-account-hip_service_dev'

@Injectable()
export class ProjectsService {
	/*
	 * TODO:
	 * Mount the Collab Filesystem
	 */
	constructor(
		private readonly iamService: IamService,
		private readonly nextcloudService: NextcloudService
	) {}

	async create(createProjectDto: CreateProjectDto) {
		try {
			const { title, description, admin } = createProjectDto
			const name = `HIP-${title.toLowerCase().replace(/ /g, '-')}`

			await this.iamService.createGroup(name, title, description)
			await this.iamService.addUserToGroup(name, 'administrator', admin)
			await this.iamService.addUserToGroup(name, 'member', admin)
			return this.iamService.assignGroupToGroup(
				name,
				'member',
				ROOT_PROJECT_GROUP_NAME
			)
		} catch (error) {
			console.error(error)
			throw new Error('Could not create project')
		}
	}

	async findAll(): Promise<Project[]> {
		try {
			const rootProject = await this.iamService.getGroup(
				ROOT_PROJECT_GROUP_NAME
			)

			return rootProject.members.groups
		} catch (error) {
			throw new Error('Could not get projects')
		}
	}

	async findUserProjects(userId: string): Promise<Project[]> {
		try {
			const projects = await this.findAll()
			const userGroups = await this.iamService.getUserGroups(userId)
			const userGroupNames = userGroups.map(g => g.name)

			return projects
				.filter(p => userGroupNames.includes(p.name))
				.map(p => ({
					name: p.name,
					title: p.title,
					description: p.description,
					acceptMembershipRequest: p.acceptMembershipRequest
				}))
		} catch (error) {
			throw new Error('Could not get projects for user')
		}
	}

	async findOne(name: string): Promise<Project> {
		try {
			const group = await this.iamService.getGroup(name)

			return {
				name: group.name,
				title: group.title,
				description: group.description,
				acceptMembershipRequest: group.acceptMembershipRequest,
				members: group.members.users.map(u => u.username),
				admins: group.administrators.users
					.filter(u => u.username !== SERVICE_ACCOUNT)
					.map(u => u.username)
			}
		} catch (error) {
			throw new Error('Could not get project')
		}
	}

	update(id: number, updateProjectDto: UpdateProjectDto) {
		return `This action updates a #${id} project`
	}

	remove(id: number) {
		return `This action removes a #${id} project`
	}

	invite(projectName: string, username: string) {
		return this.iamService.addUserToGroup(projectName, 'member', username)
	}
}
