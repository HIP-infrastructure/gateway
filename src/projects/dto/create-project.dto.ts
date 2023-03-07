import { ProjectDto } from "./project.dto"
import {DatasetDescription} from '../../tools/dto/create-bids-dataset.dto'

export class CreateProjectDto extends DatasetDescription{
    readonly title: string
    readonly description: string
    readonly adminId: string
}
