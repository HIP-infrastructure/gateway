import { HttpService } from '@nestjs/axios'
import { HttpException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { spawn } from 'child_process'
import { catchError, firstValueFrom } from 'rxjs'
import { CacheService } from 'src/cache/cache.service'
import { Group, IamEbrainsService } from 'src/iam-ebrains/iam-ebrains.service'
import { NextcloudService } from 'src/nextcloud/nextcloud.service'
import { CreateProjectDto } from './dto/create-project.dto'

const { NodeSSH } = require('node-ssh')

export interface Project extends Group {
	members?: string[]
	admins?: string[]
}

// FIXME: CHECKIF GROUP EXISTS
const ROOT_PROJECT_GROUP_NAME = 'HIP-Projects'

@Injectable()
export class ProjectsService {
	private readonly logger = new Logger(ProjectsService.name)
	private readonly ssh: any
	private readonly authBackendUsername: string
	private readonly authBackendPassword: string
	private readonly authBackendUrl: string
	private readonly authFSUrl: string
	private readonly authDockerFsCert: string

	constructor(
		private readonly iamService: IamEbrainsService,
		private readonly nextcloudService: NextcloudService,
		private readonly httpService: HttpService,
		private readonly cacheService: CacheService,
		private readonly configService: ConfigService
	) {
		this.ssh = new NodeSSH()
		this.authBackendUsername = this.configService.get(
			'collab.authBackendUsername'
		)
		this.authBackendPassword = this.configService.get(
			'collab.authBackendPassword'
		)
		this.authBackendUrl = this.configService.get('collab.authBackendUrl')
		this.authFSUrl = this.configService.get('collab.authFSUrl')
		this.authDockerFsCert = this.configService.get('collab.authDockerFsCert')
	}

	async create(createProjectDto: CreateProjectDto) {
		try {
			const { title, description, adminId } = createProjectDto
			const name = `HIP-${title.toLowerCase().replace(/ /g, '-')}`

			await this.iamService.createGroup(name, title, description)
			await this.iamService.addUserToGroup(name, 'administrator', adminId)
			await this.iamService.addUserToGroup(name, 'member', adminId)
			await this.iamService.assignGroupToGroup(
				name,
				'member',
				ROOT_PROJECT_GROUP_NAME
			)

			this.ssh
				.connect({
					host: process.env.COLLAB_SSH_HOST,
					username: process.env.COLLAB_SSH_USER,
					privateKey: process.env.COLLAB_SSH_PRIVATE_KEY
				})
				.then(() => {
					this.ssh
						.execCommand(`mkdir -p ${process.env.COLLAB_FILESYSTEM}/${name}`)
						.then(result => {
							this.logger.debug(`STDOUT: ${result.stdout}`)
							this.logger.debug(`STDERR: ${result.stderr}`)
						})
				})

			await this.cacheService.del(`userProjects:${adminId}`)
		} catch (error) {
			console.error(error)
			throw new HttpException(error.response.description, error.response.status)
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
		this.logger.debug(`findUserProjects(${userId})`)
		// const cached = await this.cacheService.get(`userProjects:${userId}`)
		// if (cached) {
		// 	this.logger.debug(`findUserProjects(${userId}) - cached`)
		// 	return cached
		// }
		try {
			const projects = await this.findAll()
			const userGroups = await this.iamService.getUserGroups(userId)
			const userGroupNames = userGroups.map(g => g.name)

			const userProjects = projects
				.filter(p => userGroupNames.includes(p.name))
				.map(p => ({
					name: p.name,
					title: p.title,
					description: p.description,
					acceptMembershipRequest: p.acceptMembershipRequest
				}))

			// this.cacheService.set(`userProjects:${userId}`, userProjects, 3600)

			return userProjects
		} catch (error) {
			throw new Error('Could not get projects for user')
		}
	}

	async findOne(projectName: string): Promise<Project> {
		try {
			const group = await this.iamService.getGroup(projectName)

			return {
				name: group.name,
				title: group.title,
				description: group.description,
				acceptMembershipRequest: group.acceptMembershipRequest,
				members: group.members.users.map(u => u.username),
				admins: group.administrators.users.map(u => u.username)
			}
		} catch (error) {
			throw new Error('Could not get project')
		}
	}

	// update(projectName: number, updateProjectDto: UpdateProjectDto) {
	// 	return `This action updates a #${projectName} project`
	// }

	remove(projectName: string, adminId: string) {
		try {
			return this.iamService
				.deleteGroup(projectName)
				.then(() => this.cacheService.del(`userProjects:${adminId}`))
		} catch (error) {
			this.logger.error(error)
			throw new Error('Could not delete project')
		}
	}

	async addUserToProject(username: string, projectName: string) {
		this.logger.debug(`addUserToProject(${username}, ${projectName})`)

		try {
			return await this.iamService.addUserToGroup(
				username,
				'member',
				projectName
			)
		} catch (error) {
			this.logger.error(error)
			throw new Error('Could not add user to project')
		}
	}

	async mountProjectFolders(
		hipuser: string,
		projects: Project[],
		port: number
	) {
		this.logger.debug(
			`mountProjectFolder(${projects.map(p => p.name)}, ${port})`
		)

		const gf = JSON.stringify(
			projects.map(project => ({
				id: project.name,
				label: project.name,
				path: `__groupfolders/${project.name}`
			}))
		)

		try {
			const toParams = data =>
				Object.keys(data)
					.map(key => `${key}=${encodeURIComponent(data[key])}`)
					.join('&')

			const url = `${this.authBackendUrl}/token?${toParams({ hipuser, gf })}`
			const config = {
				auth: {
					username: this.authBackendUsername,
					password: this.authBackendPassword
				}
			}

			const {
				data: { token }
			} = await firstValueFrom(
				this.httpService.get(url, config).pipe(
					catchError((error: any) => {
						this.logger.error(error)
						throw new HttpException(error.response.data, error.response.status)
					})
				)
			)

			const container_name = `fs-${hipuser}-${Math.round(
				Math.random() * 1000000
			)}`
			const dockerParams = [
				'run',
				'-d',
				// "--mount", f"type=bind,source={os.getcwd()}/mnt/{args.hip_user},target=/home/{args.hip_user}/nextcloud,bind-propagation=rshared", \
				'-p',
				`127.0.0.1:${port}:3000`,
				'--device=/dev/fuse:/dev/fuse',
				'--cap-add=SYS_ADMIN',
				'--security-opt',
				'apparmor=unconfined',
				'--name',
				container_name,
				'--hostname',
				container_name,
				'--restart',
				'on-failure:5',
				'--env',
				`HIP_USER=${hipuser}`,
				'--env',
				`HIP_PASSWORD=${token}`,
				'--env',
				`NEXTCLOUD_DOMAIN=${this.authFSUrl}`,
				'--env',
				`DOCKERFS_CERT=${this.authDockerFsCert}`,
				'fs-api'
			]
			this.logger.debug(dockerParams.join(' '))

			return this.spawnable('docker', dockerParams)
		} catch (error) {
			this.logger.error(error)
			throw new HttpException(error.response.data, error.response.status)
		}
	}

	async files(name: string, path: string, userId: string) {
		this.logger.debug(`files: name=${name}, path=${path} userId=${userId}`)
		// await this.cacheService.del(`collab-project-${userId}`);
		// return

		try {
			const userApiUrlKey = `fs-api-collab-${userId}`
			let baseUrl
			const cached = await this.cacheService.get(userApiUrlKey)

			if (cached) {
				baseUrl = cached
			} else {
				const projects = await this.findUserProjects(userId)
				//
				// #get a random free port
				// s=socket.socket()
				// s.bind(("", 0))
				// port=s.getsockname()[1]
				// s.close()
				const port = Math.round(Math.random() * 1000 + 3000)
				const { code } = await this.mountProjectFolders(userId, projects, port)

				if (code === 0) {
					baseUrl = `http://127.0.0.1:${port}`

					await this.cacheService.set(userApiUrlKey, baseUrl)
					this.logger.debug(baseUrl)
				}
			}

			this.logger.debug(baseUrl)

			const url = `${baseUrl}/inspect/${name}`
			const { data } = await firstValueFrom(
				this.httpService.get(url).pipe(
					catchError((error: any) => {
						this.logger.error(error)
						throw new HttpException(error.response.data, error.response.status)
					})
				)
			)

			return data
		} catch (error) {
			this.logger.error(error)
			throw new HttpException(error.response.data, error.response.status)
		}
	}

	private spawnable = (
		command,
		args
	): Promise<{ code: number; message?: string }> => {
		try {
			const child = spawn(command, args)
			let message = ''

			return new Promise(resolve => {
				child.stdout.setEncoding('utf8')
				child.stdout.on('data', data => {
					message += data.toString()
				})

				child.stderr.setEncoding('utf8')
				child.stderr.on('data', data => {
					//message += data.toString()
				})

				child.on('error', data => {
					message += data.toString()
				})

				child.on('close', code => {
					resolve({ code, message })
				})
			})
		} catch (error) {
			this.logger.error(error)
			throw new HttpException(error.response.data, error.response.status)
		}
	}
}
