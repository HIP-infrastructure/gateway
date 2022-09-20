import { BIDSDataset } from "src/files/files.service"
// import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm'
import { Patient } from "./patient.entity"

// @Entity()
export class Dataset {
    // @PrimaryGeneratedColumn()
    guid: string

    // @Column()
    date: string

    // @Column()
    type: string

    // @Column()
    data: BIDSDataset

    // @OneToMany(
        // type => Patient,
        // patient => patient.dataset
    // )
    patients: Patient[]
}