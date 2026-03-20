import { Injectable } from '@nestjs/common'
import { prisma } from '../prisma.client'

@Injectable()
export class PacksService {
  async findAll() {
    return prisma.pack.findMany({ include: { options: true, specs: true, allocations: true } })
  }

  async findOne(id: string) {
    return prisma.pack.findUnique({ where: { id }, include: { options: true, specs: true, allocations: true } })
  }

  async create(dto: any) {
    return prisma.pack.create({ data: dto })
  }

  async update(id: string, dto: any) {
    const data: any = {}
    if (dto.name !== undefined) data.name = dto.name
    if (dto.serial_number !== undefined) data.serialNumber = dto.serial_number
    if (dto.serialNumber !== undefined) data.serialNumber = dto.serialNumber
    if (dto.container_type !== undefined) data.containerType = dto.container_type
    if (dto.containerType !== undefined) data.containerType = dto.containerType
    if (dto.notes !== undefined) data.notes = dto.notes
    if (dto.primaryUser !== undefined) data.primaryUser = dto.primaryUser
    if (dto.primary_user !== undefined) data.primaryUser = dto.primary_user
    if (dto.number !== undefined) data.number = dto.number
    if (dto.pastNaming !== undefined) data.pastNaming = dto.pastNaming
    if (dto.past_naming !== undefined) data.pastNaming = dto.past_naming
    if (dto.containerSerialNumber !== undefined) data.containerSerialNumber = dto.containerSerialNumber
    if (dto.container_serial_number !== undefined) data.containerSerialNumber = dto.container_serial_number
    if (dto.containerDom !== undefined) data.containerDom = dto.containerDom
    if (dto.container_dom !== undefined) data.containerDom = dto.container_dom
    if (dto.mainSize !== undefined) data.mainSize = dto.mainSize
    if (dto.main_size !== undefined) data.mainSize = dto.main_size
    if (dto.mainDom !== undefined) data.mainDom = dto.mainDom
    if (dto.main_dom !== undefined) data.mainDom = dto.main_dom
    if (dto.mainSerialNumber !== undefined) data.mainSerialNumber = dto.mainSerialNumber
    if (dto.main_serial_number !== undefined) data.mainSerialNumber = dto.main_serial_number
    if (dto.reserveSize !== undefined) data.reserveSize = dto.reserveSize
    if (dto.reserve_size !== undefined) data.reserveSize = dto.reserve_size
    if (dto.reserveDom !== undefined) data.reserveDom = dto.reserveDom
    if (dto.reserve_dom !== undefined) data.reserveDom = dto.reserve_dom
    if (dto.reserveSerialNumber !== undefined) data.reserveSerialNumber = dto.reserveSerialNumber
    if (dto.reserve_serial_number !== undefined) data.reserveSerialNumber = dto.reserve_serial_number
    if (dto.lastPacked !== undefined) data.lastPacked = dto.lastPacked
    if (dto.last_packed !== undefined) data.lastPacked = dto.last_packed
    if (dto.riggerInt !== undefined) data.riggerInt = dto.riggerInt
    if (dto.rigger_int !== undefined) data.riggerInt = dto.rigger_int
    if (dto.repackDue !== undefined) data.repackDue = dto.repackDue
    if (dto.repack_due !== undefined) data.repackDue = dto.repack_due
    if (dto.aadType !== undefined) data.aadType = dto.aadType
    if (dto.aad_type !== undefined) data.aadType = dto.aad_type
    if (dto.aadDom !== undefined) data.aadDom = dto.aadDom
    if (dto.aad_dom !== undefined) data.aadDom = dto.aad_dom
    if (dto.aadSerialNumber !== undefined) data.aadSerialNumber = dto.aadSerialNumber
    if (dto.aad_serial_number !== undefined) data.aadSerialNumber = dto.aad_serial_number

    return prisma.pack.update({ where: { id }, data })
  }
}
