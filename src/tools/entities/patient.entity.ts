// import { Column, Entity, JoinTable, ManyToOne, OneToOne, PrimaryGeneratedColumn } from "typeorm"
import { CreateSubjectDto } from "../dto/create-subject.dto"
import { Dataset } from "./dataset.entity"
import { User } from "./user.entity"

// @Entity()
export class Patient {
    // @PrimaryGeneratedColumn()
    pseudonym: number
    
    // @Column()
    age: string
    
    // @Column()
    sex: string
    
    // @Column()
    diagnosis: string

    // @Column()
    data: CreateSubjectDto

    // @JoinTable()
    // @ManyToOne(
    //     type => Dataset,
    //     dataset => dataset.patients,
    //     {
    //         cascade: true
    //     }
    // )
    dataset: Dataset[]

    // @JoinTable()
    // @OneToOne(
    //     type => User,
    //     user => user.patients,
    //     {
    //         cascade: true
    //     }
    // )
    user: User
}

