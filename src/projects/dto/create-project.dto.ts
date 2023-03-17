import { ProjectDto } from './project.dto'
import { DatasetDescription } from '../../tools/dto/create-bids-dataset.dto'

export class CreateProjectDto {
	readonly title: string
	readonly description: string
	readonly adminId: string
	readonly datasetDescription: DatasetDescription
}
