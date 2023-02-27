import { HttpService } from '@nestjs/axios'
import { HttpException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { spawn } from 'child_process'
import { catchError, firstValueFrom } from 'rxjs'
import { CacheService } from 'src/cache/cache.service'
import { findFreePort } from 'src/common/utils/shared.utils'
import { Group, IamEbrainsService } from 'src/iam-ebrains/iam-ebrains.service'
import { CreateProjectDto } from './dto/create-project.dto'

const { NodeSSH } = require('node-ssh')
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
	members?: string[]
	admins?: string[]
}

// FIXME: CHECKIF GROUP EXISTS
const ROOT_PROJECT_GROUP_NAME = 'HIP-Projects'
const CACHE_ROOT_KEY = 'projects'

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
		private readonly httpService: HttpService,
		private readonly cacheService: CacheService,
		private readonly configService: ConfigService
	) {
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

	private async sshConnect() {
		return new NodeSSH().connect({
			host: this.configService.get('collab.sshHost'),
			username: this.configService.get('collab.sshUsername'),
			privateKeyPath: this.configService.get('collab.sshPrivateKeyPath')
		})
	}

	private async createUserFolder(userId: string) {
		this.logger.debug(`createUserFolder: userId=${userId}`)
		const userFolder = `${this.configService.get('collab.path')}/../${userId}`

		const ssh = await this.sshConnect()
		await ssh.execCommand(`mkdir -p ${userFolder}/files`).then(result => {
			this.logger.debug(`STDOUT: ${result.stdout}, STDERR: ${result.stderr}`)
		})
		await ssh
			.execCommand(`sudo chown -R www-data: ${userFolder}`)
			.then(result => {
				this.logger.debug(`STDOUT: ${result.stdout}, STDERR: ${result.stderr}`)
			})
		return ssh.dispose()
	}

	private async invalidateProjectsCache(userId: string) {
		await this.refreshApi(userId)
		await this.cacheService.del(`${CACHE_ROOT_KEY}:all`)
		return this.cacheService.del(`${CACHE_ROOT_KEY}:${userId}`)
	}

	async create(createProjectDto: CreateProjectDto) {
		try {
			const { title, description, adminId } = createProjectDto
			const projectName = `HIP-${title
				.replace(/[^a-zA-Z0-9]+/g, '-')
				.toLowerCase()}`

			await this.iamService.createGroup(projectName, title, description)
			await this.iamService.addUserToGroup(
				adminId,
				'administrator',
				projectName
			)
			await this.iamService.addUserToGroup(adminId, 'member', projectName)
			await this.iamService.assignGroupToGroup(
				projectName,
				'member',
				ROOT_PROJECT_GROUP_NAME
			)

			// create group folder
			const ssh = await this.sshConnect()
			const groupFolder = `${this.configService.get(
				'collab.path'
			)}/${projectName}`
			await ssh.execCommand(`mkdir -p ${groupFolder}`).then(result => {
				this.logger.debug(`STDOUT: ${result.stdout}, STDERR: ${result.stderr}`)
			})
			await ssh
				.execCommand(`sudo chown -R www-data: ${groupFolder}`)
				.then(result => {
					this.logger.debug(
						`STDOUT: ${result.stdout}, STDERR: ${result.stderr}`
					)
				})
			ssh.dispose()

			// create user folder
			await this.createUserFolder(adminId)

			return this.invalidateProjectsCache(adminId)
		} catch (error) {
			console.error(error)
			throw new HttpException(error.response.description, error.response.status)
		}
	}

	async findAll(): Promise<Project[]> {
		const cached = await this.cacheService.get(`${CACHE_ROOT_KEY}:all`)
		if (cached) {
			this.logger.debug(`${CACHE_ROOT_KEY}:all - cached`)
			return cached
		}
		try {
			const rootProject = await this.iamService.getGroup(
				ROOT_PROJECT_GROUP_NAME
			)

			const groups = rootProject.members.groups
			this.cacheService.set(`${CACHE_ROOT_KEY}:all`, groups, 3600)

			return groups
		} catch (error) {
			throw new Error('Could not get projects')
		}
	}

	async findUserProjects(userId: string): Promise<Project[]> {
		const cached = await this.cacheService.get(`${CACHE_ROOT_KEY}:${userId}`)
		if (cached) {
			this.logger.debug(`${CACHE_ROOT_KEY}:${userId} - cached`)
			return cached
		}
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

			this.cacheService.set(`${CACHE_ROOT_KEY}:${userId}`, userProjects, 3600)

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
			return this.iamService.deleteGroup(projectName).then(() => {
				return this.invalidateProjectsCache(adminId)
			})
		} catch (error) {
			this.logger.error(error)
			throw new Error('Could not delete project')
		}
	}

	async addUserToProject(userId: string, projectName: string) {
		this.logger.debug(`addUserToProject(${userId}, ${projectName})`)
		try {
			await this.iamService.addUserToGroup(userId, 'member', projectName)
			return this.invalidateProjectsCache(userId)
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

	async refreshApi(userId: string) {
		this.logger.debug(`refreshApi: userId=${userId}`)
		return await this.cacheService.del(`fs-api-collab-${userId}`)
	}

	async metadataTree(
		name: string,
		path: string,
		userId: string,
		refreshApi: boolean = false
	) {
		this.logger.debug(
			`metadataTree: name=${name}, path=${path} userId=${userId} refresh=${refreshApi}`
		)

		if (refreshApi) await this.refreshApi(userId)

		try {
			const userApiUrlKey = `fs-api-collab-${userId}`
			let baseUrl
			const cached = await this.cacheService.get(userApiUrlKey)

			if (cached) {
				baseUrl = cached
			} else {
				// Act a a gatekeeper to prevent multiple requests to mount the same project
				await this.cacheService.set(userApiUrlKey, 'placeholder')

				const projects = await this.findUserProjects(userId)
				await this.createUserFolder(userId)
				const port = await findFreePort()
				const { code } = await this.mountProjectFolders(userId, projects, port)

				if (code === 0) {
					baseUrl = `http://127.0.0.1:${port}`
					await this.cacheService.set(userApiUrlKey, baseUrl)
				} else {
					await this.cacheService.del(userApiUrlKey)
				}
			}

			const url = `${baseUrl}/inspect/${name}`
			this.logger.debug(url)
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
