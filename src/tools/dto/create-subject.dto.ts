export class CreateSubjectDto {
    readonly owner: string
    readonly database: string
    readonly subjects: Subject[]
    readonly files: File[]
}

class Subject {
    sub: string
    age: string
    sex: string
    [key: string]: string
}

class File {
    modality: string
    subject: string
    path: string
    entities: {
        sub: string
        ses: string
        task: string
        acq: string
        [key: string]: string
    }
}