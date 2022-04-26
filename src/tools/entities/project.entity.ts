import { Dataset } from "./dataset.entity"
import { User } from "./user.entity"

export class Project {
    guid: string
    sop: string
    datasets: Dataset[]
    users: User[]
    // groups: Groups[]
}