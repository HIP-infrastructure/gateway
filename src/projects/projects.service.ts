import { HttpService } from '@nestjs/axios'
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as jetpack from 'fs-jetpack'
import { CacheService } from 'src/cache/cache.service'
import { Group, IamService } from 'src/iam/iam.service'
import { BIDSDataset, ToolsService } from 'src/tools/tools.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { ImportDocumentDto } from './dto/import-document.dto'
import { ImportSubjectDto } from './dto/import-subject.dto'
const userIdLib = require('userid')
const chownr = require('chownr')

interface FileMetadata {
	name: string
	size: number
	fullPath: string
	created: string
	updated: string
	md5Hash: string
	contentType: string
	contentEncoding: string
}

export interface Project extends Group {
	isMember?: boolean
	members?: string[]
	admins?: string[]
}

const CACHE_KEY_PROJECTS = 'projects'

@Injectable()
export class ProjectsService {
	private readonly logger = new Logger(ProjectsService.name)
	private dataUserId: number
	private PROJECTS_GROUP: string // Holds all HIP projects as sub groups
	private PROJECTS_ADMINS_GROUP: string // Holds members allowed to create HIP projects

	constructor(
		private readonly iamService: IamService,
		private readonly httpService: HttpService,
		private readonly cacheService: CacheService,
		private readonly configService: ConfigService,
		private readonly toolsService: ToolsService
	) {
		const uid = this.configService.get<string>('instance.dataUser')
		const id = parseInt(userIdLib.uid(uid), 10)
		this.dataUserId = id

		const suffix = this.configService.get<string>('collab.suffix')
		this.PROJECTS_GROUP = `HIP-${suffix}-projects`
		this.PROJECTS_ADMINS_GROUP = `HIP-${suffix}-projects-admin-group`

	}

	/* The `chownr` function changes recursively the ownership of a file or directory specified by the `path` parameter
to the user and group specified by `this.dataUserId`. This is used in the `createUserFolder`
function to change the ownership of the user's folder in the collab workspace to the data user. */
	private async chown(path: string) {
		this.logger.debug(`${path} ownership changed to ${this.dataUserId}`)
		return await chownr(path, this.dataUserId, this.dataUserId, error => {
			if (error) throw error
		})
	}

	/* It creates a folder for the user in the collab workspace. */
	private async createUserFolder(userId: string) {
		this.logger.debug(`createUserFolder: userId=${userId}`)
		const userFolder = `${this.configService.get(
			'collab.mountPoint'
		)}/${userId}`

		jetpack
			.dir(userFolder, { empty: false })
			.dir(`${userFolder}/files`, { empty: false })
		await this.chown(userFolder)

		return jetpack.inspectTree(userFolder)
	}

	public async isProjectsAdmin(userId) {
		this.logger.debug(`isProjectsAdmin: userId=${userId}`)
		// const cachedAdmin = await this.cacheService.get(`${CACHE_KEY_PROJECTS}:${userId}:isAdmin`)

		// if (cachedAdmin) return cachedAdmin

		try {
			const user = await this.iamService.getUser(userId)
			console.log(JSON.stringify(user, null, 2))

			return user['hasProjectsAdminRole'] === true
			// const group = await this.iamService.getGroupListsByRole(
			// 	this.PROJECTS_ADMINS_GROUP,
			// 	'member'
			// )

			// const isAdmin = group.users.map(u => u.username).includes(userId)
			// await this.cacheService.set(`${CACHE_KEY_PROJECTS}:${userId}:isAdmin`, true, 10 * 50)

			// return isAdmin
		} catch (error) {
			this.logger.error(error)
			throw error
		}
	}

	public async userIsProjectAdmin(projectName, userId) {
		try {
			const group = await this.iamService.getGroupListsByRole(
				projectName,
				'administrator'
			)
			const isAdmin = group.users.map(u => u.username).includes(userId)
			if (!isAdmin)
				throw new HttpException(
					`${userId} is not an admin.`,
					HttpStatus.FORBIDDEN
				)

			return userId
		} catch (error) {
			this.logger.error(error)
			throw error
		}
	}

	async findAll(userId: string, full = false): Promise<Project[]> {
		this.logger.debug(`findAll: userId=${userId} full=${full}`)

	// 	try {
			const projects = await this.iamService.getGroups()
	// 		const groups = rootProject.members.groups
	// 		let fullgroups = []
	// 		for (const g of groups) {
	// 			fullgroups.push(await this.iamService.getGroup(g.name))
	// 		}

	// 		const projects = fullgroups.map(p => ({
	// 			name: p.name,
	// 			title: p.name,
	// 			description: p.description,
	// 			acceptMembershipRequest: p.acceptMembershipRequest,
	// 			members: p.members.users.map(u => u.username),
	// 			admins: p.administrators.users.map(u => u.username)
	// 		}))

			return projects.map(p => ({
				...p,
				title: p.name
			}))
	// 	} catch (error) {
	// 		this.logger.error(error)
	// 		throw error
	// 	}
	}

	async findProjectsForUser(
		userId: string
	): Promise<Project[]> {
		try {
			const projects = await this.iamService.getUserGroups(userId)
			console.log(JSON.stringify(projects))
			// const rootProject = await this.iamService.getGroup(this.PROJECTS_GROUP)

			const nextProjects =  projects.map(p => ({
				...p,
				title: p.name,

			}))

			console.log(nextProjects)

			return nextProjects

			// const groups = rootProject.members.groups
			// let fullgroups = []
			// for (const g of groups) {
			// 	fullgroups.push(await this.iamService.getGroup(g.name))
			// }

			// const projects = fullgroups.filter(g => [...g.members.users, ...g.administrators.users].map(g => g.username)
			// 	.includes(userId)).map(p => ({
			// 		isMember: true,
			// 		name: p.name,
			// 		title: p.title,
			// 		description: p.description,
			// 		acceptMembershipRequest: p.acceptMembershipRequest,
			// 		members: p.members.users.map(u => u.username),
			// 		admins: p.administrators.users.map(u => u.username)
			// 	}))
			// return projects
		} catch (error) {
			throw new Error('Could not get project')
		}
	}

	async findOne(
		projectName: string,
		// userId: string
	): Promise<Project & { dataset: BIDSDataset }> {
		try {
			const group: any = await this.iamService.getGroup(projectName)
			console.log(JSON.stringify(group, null, 2))
			const dataset = await this.cacheService.get(
				`${CACHE_KEY_PROJECTS}:${projectName}:dataset`
			)

			return {
				...group,
				name: group.title,
				isMember: true,
				dataset
			}

			// return {
			// 	name: group.title,
			// 	title: group.title,
			// 	description: group.description,
			// 	acceptMembershipRequest: true,
			// 	members: group.members.users.map(u => u.username),
			// 	admins: group.administrators.users.map(u => u.username),
			// 	isMember: [...group.members.users, ...group.administrators.users]
			// 		.map(g => g.username)
			// 		.includes(userId),
			// 	dataset
			// }
		} catch (error) {
			throw new Error('Could not get project')
		}
	}

	async create(createProjectDto: CreateProjectDto) {
		this.logger.debug(
			`create createProjectDto=${JSON.stringify(createProjectDto)}`
		)

		try {
			const { title, description, adminId } = createProjectDto
			const name = `HIP-${title.replace(/[^a-zA-Z0-9]+/g, '-')}`

			// create group on iam
			const { data } = await this.iamService.createGroup(
				name,
				title,
				description,
				adminId,
			)

			// create user folder on collab workspace if it doesn't exist
			try {
				await this.createUserFolder(adminId)
			} catch (error) {
				console.log(error)
			}

			// create group folder on collab workspace
			const groupfolderPath = `${this.configService.get('collab.mountPoint')}/__groupfolders`
			const projectPath = `${groupfolderPath}/${name}`

			jetpack.dir(projectPath)
			await this.chown(groupfolderPath)

			// create project structure
			this.toolsService
				.createProjectDataset(projectPath, createProjectDto)
				.then(dataset => {
					this.logger.debug(`create dataset=${JSON.stringify(dataset)}`)

					// TODO: record dataset in a database
					this.cacheService.set(
						`${CACHE_KEY_PROJECTS}:${name}:dataset`,
						dataset
					)
				})
			// this.setProjectsCacheFor(adminId, null)
			return this.findProjectsForUser(adminId)
		} catch (error) {
			this.logger.debug(error)
			throw error
		}
	}

	// update(projectName: number, updateProjectDto: UpdateProjectDto) {
	// 	return `This action updates a #${projectName} project`
	// }

	async remove(projectName: string, adminId: string) {
		this.logger.debug(`remove(${projectName}, ${adminId})`)
		return this.iamService.deleteGroup(projectName).then(async () => {
			// this.setProjectsCacheFor(adminId, null)

			return this.findProjectsForUser(adminId)
		}).catch(error => {
			this.logger.error(error)
			throw error
		})
	}

	async addUserToProject(userId: string, projectName: string) {
		this.logger.debug(`addUserToProject(${userId}, ${projectName})`)
		try {
			await this.createUserFolder(userId)
		} catch (error) {
			this.logger.debug('userFolder exists')
		}
		try {
			await this.iamService.addUserToGroup(userId, 'member', projectName)
			// await this.refreshProjectsCache(projectName)

			return this.findOne(projectName)
		} catch (error) {
			this.logger.debug(error)
			throw error
		}
	}

	async removeUserFromProject(userId: string, projectName: string) {
		this.logger.debug(`removeUserFromProject(${userId}, ${projectName})`)

		try {
			await this.iamService.removeUserFromGroup(userId, 'member', projectName)
			// await this.refreshProjectsCache(projectName)

			return this.findOne(projectName)
		} catch (error) {
			this.logger.debug(error)
			throw error
		}
	}

	public async importBIDSSubject(
		userId: string,
		importSubjectDto: ImportSubjectDto,
		projectName: string
	) {
		this.logger.debug(
			`importBIDSSubject(${userId}, ${JSON.stringify(
				importSubjectDto
			)} ${projectName})`
		)
		try {
			const projectPath = `${this.configService.get(
				'collab.mountPoint'
			)}/__groupfolders/${projectName}`
			const dataset = await this.toolsService.importBIDSSubjectToProject(
				userId,
				importSubjectDto,
				projectPath
			)
			this.cacheService.set(
				`${CACHE_KEY_PROJECTS}:${projectName}:dataset`,
				dataset
			)

			return 'Success'
		} catch (error) {
			this.logger.debug(error)
			throw error
		}
	}

	public async importDocument(
		userId: string,
		importDocumentDto: ImportDocumentDto,
		projectName: string
	) {
		try {
			this.logger.debug(`importDocument(${userId}, ${JSON.stringify(importDocumentDto)})`)

			const projectPath = `${process.env.COLLAB_MOUNT}/__groupfolders/${projectName}`
			const targetFileNameBits = importDocumentDto.sourceFilePath.split('/')
			const targetFileName = targetFileNameBits[targetFileNameBits.length - 1]
			await this.toolsService.importDocumentToProject(
				userId,
				importDocumentDto.sourceFilePath.replace('/GROUP_FOLDER', ''),
				projectPath,
				`${importDocumentDto.targetDirPath}/${targetFileName}`
			)

			return 'Success'
		} catch (error) {
			this.logger.debug(error)
			throw error
		}
	}

	public async metadataTree(
		userId: string,
		projectName: string,
		path?: string
	) {
		this.logger.debug(
			`metadataTree: name=${projectName}, path=${path} userId=${userId} `
		)

		try {
			const projectPath = `${process.env.COLLAB_MOUNT}/__groupfolders/${projectName}`
			const rootPath = `${projectPath}/${path ? path : ''}`
			this.logger.debug(`rootPath=${rootPath}`)
			const content = jetpack.inspectTree(rootPath, {
				relativePath: true,
				times: true
			})
			this.logger.debug(`content=${JSON.stringify(content)}`)

			return content
		} catch (error) {
			this.logger.debug(error)
			throw error
		}
	}

	/* It creates a group called `HIP-Projects` and adds the platform admins to it. 
	This group is used to hold all HIP projects as sub groups. */
	public async createProjectsGroup() {
		this.logger.debug(`createProjectsGroup ${this.PROJECTS_GROUP}`)

		const project = await this.iamService.createGroup(
			this.PROJECTS_GROUP,
			this.PROJECTS_GROUP,
			'Holds all HIP projects as sub groups'
		)
		console.log(project)

		// const admins = this.configService.get('iam.platformAdmins')
		for (const adminId of ['nicedexter', 'keyfloak']) {
			const user = await this.iamService.addUserToGroup(
				adminId,
				'administrator',
				this.PROJECTS_GROUP
			)
			console.log(user)
		}

	}

	/* It creates a group called `HIP-Projects-admins` and adds the platform admins to it.
	 * This group is used to give users access to administrate HIP projects, i.e. create new projects,
	 * by adding them to the group `HIP-Projects-admins` as member.
	 */
	public async createAdminGroup() {
		this.logger.debug(`createAdminGroup ${this.PROJECTS_ADMINS_GROUP}`)
		try {
			await this.iamService.createGroup(
				this.PROJECTS_ADMINS_GROUP,
				this.PROJECTS_ADMINS_GROUP,
				'Gives members access to administrate HIP projects'
			)
			const admins = this.configService.get('iam.platformAdmins')
			for (const adminId of admins) {
				await this.iamService.addUserToGroup(
					adminId,
					'administrator',
					this.PROJECTS_ADMINS_GROUP
				)
			}
		} catch (error) {
			this.logger.error(error)
			throw error
		}
	}
}
