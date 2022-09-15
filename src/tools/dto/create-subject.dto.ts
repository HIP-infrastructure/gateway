export class CreateSubjectDto {
    readonly owner: string
    readonly dataset: string
    readonly path: string // relative path for user or group eg: data/file.md
    readonly subjects: Subject[]
    readonly files: File[]
}

export class Subject {
    sub: string
    age: string
    sex: string
    [key: string]: string
}

export class File {
    modality: string
    subject: string
    path: string
    entities: {
        sub: string
        [key: string]: string
    }
}