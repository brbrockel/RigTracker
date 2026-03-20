import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'jane.doe@example.com' },
    update: {},
    create: { name: 'Jane Doe', email: 'jane.doe@example.com', role: 'jumper' }
  })

  const pack = await prisma.pack.create({
    data: {
      serialNumber: 'MIR-12345',
      name: 'Mirage G4 3.0',
      containerType: 'Two-Reserve',
      notes: 'Demo rig'
    }
  })

  await prisma.option.createMany({
    data: [
      { packId: pack.id, slot: 'main', makeModel: 'PD Sabre2', size: '170' },
      { packId: pack.id, slot: 'reserve', makeModel: 'PD Reserve', size: '210' }
    ]
  })

  await prisma.spec.create({
    data: { packId: pack.id, weight: 5.6, maxLoad: 120, lineLength: 170 }
  })

  await prisma.allocation.create({
    data: {
      packId: pack.id,
      userId: user.id,
      type: 'owned',
      startDate: new Date(),
      notes: 'Assigned during seed'
    }
  })

  console.log('Seed completed')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
