import { ProjectDto } from './project.dto'
import { CreateBidsDatasetDto } from 'src/tools/dto/create-bids-dataset.dto'

export class CreateProjectDto {
	readonly title: string
	readonly description: string
	readonly adminId: string
	readonly createBidsDatasetDto: CreateBidsDatasetDto
}
