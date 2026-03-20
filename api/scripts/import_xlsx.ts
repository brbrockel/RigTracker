import fs from 'fs'
import path from 'path'
import XLSX from 'xlsx'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, '_')
}

async function main() {
  const fileArg = process.argv[2] || path.resolve(__dirname, '../../UConn Skydiving Gear.xlsx')
  if (!fs.existsSync(fileArg)) {
    console.error('Excel file not found:', fileArg)
    process.exit(1)
  }

  const wb = XLSX.readFile(fileArg)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null })
  console.log(`Found ${rows.length} rows in sheet ${wb.SheetNames[0]}`)

  for (const r of rows) {
    // Normalize keys
    const row: any = {}
    for (const k of Object.keys(r)) row[normalizeHeader(k)] = r[k]

    const serial = row.serial || row.serial_number || row.serialnumber || row.s_n || row['s/n']
    const name = row.name || row.pack || row.model
    const container = row.container || row.container_type || row.type
    const main = row.main || row.main_canopy || row.main_model || row['main size']
    const reserve = row.reserve || row.reserve_canopy || row.reserve_model || row['reserve size']
    const aad = row.aad || row.aad_model || row['aad type']
    const weight = row.weight || row.pack_weight
    const maxLoad = row.maxload || row.max_load
    const ownerEmail = row.owner_email || row.email
    const ownerName = row.owner || row.owner_name || row.jumper

    const primaryUser = row.primary_user || row['primary user']
    const number = row.number || row['number'] || row.NUMBER
    const pastNaming = row.past_naming || row['past naming']
    const containerSerial = row['container serial number'] || row.container_serial_number || row['container serial']
    const containerDom = row['container dom'] || row.container_dom
    const mainDom = row['main dom'] || row.main_dom
    const mainSerial = row['main serial number'] || row['main serial'] || row.main_serial_number
    const reserveDom = row['reserve dom'] || row.reserve_dom
    const reserveSerial = row['reserve serial number'] || row['reserve serial'] || row.reserve_serial_number
    const lastPacked = row['last packed'] || row.last_packed
    const riggerInt = row['rigger int'] || row.rigger_int
    const repackDue = row['repack due'] || row.repack_due
    const aadDom = row['aad dom'] || row.aad_dom
    const aadSerial = row['aad serial number'] || row.aad_serial_number

    // Create or find user if ownerEmail provided
    let userId: string | null = null
    if (ownerEmail) {
      const user = await prisma.user.upsert({
        where: { email: String(ownerEmail) },
        update: {},
        create: { name: ownerName || String(ownerEmail).split('@')[0], email: String(ownerEmail), role: 'jumper' }
      })
      userId = user.id
    }

    // Create pack
    try {
      const generatedSerial = serial ? String(serial) : `import-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
      const pack = await prisma.pack.create({
        data: {
          serialNumber: generatedSerial,
          name: name ? String(name) : 'Unknown',
          containerType: container ? String(container) : null,
          notes: null,
          primaryUser: primaryUser ? String(primaryUser) : null,
          number: number ? String(number) : null,
          pastNaming: pastNaming ? String(pastNaming) : null,
          containerSerialNumber: containerSerial ? String(containerSerial) : null,
          containerDom: containerDom ? new Date(String(containerDom)) : null,
          mainSize: main ? String(main) : null,
          mainDom: mainDom ? new Date(String(mainDom)) : null,
          mainSerialNumber: mainSerial ? String(mainSerial) : null,
          reserveSize: reserve ? String(reserve) : null,
          reserveDom: reserveDom ? new Date(String(reserveDom)) : null,
          reserveSerialNumber: reserveSerial ? String(reserveSerial) : null,
          lastPacked: lastPacked ? new Date(String(lastPacked)) : null,
          riggerInt: riggerInt ? String(riggerInt) : null,
          repackDue: repackDue ? new Date(String(repackDue)) : null,
          aadType: aad ? String(aad) : null,
          aadDom: aadDom ? new Date(String(aadDom)) : null,
          aadSerialNumber: aadSerial ? String(aadSerial) : null
        }
      })

      const optionsData: any[] = []
      if (main) optionsData.push({ packId: pack.id, slot: 'main', makeModel: String(main) })
      if (reserve) optionsData.push({ packId: pack.id, slot: 'reserve', makeModel: String(reserve) })
      if (aad) optionsData.push({ packId: pack.id, slot: 'aad', makeModel: String(aad) })

      if (optionsData.length > 0) await prisma.option.createMany({ data: optionsData })

      if (weight || maxLoad) {
        await prisma.spec.create({ data: { packId: pack.id, weight: weight ? Number(weight) : undefined, maxLoad: maxLoad ? Number(maxLoad) : undefined } })
      }

      if (userId) {
        await prisma.allocation.create({ data: { packId: pack.id, userId, type: 'owned', startDate: new Date() } })
      }

      console.log('Imported pack', pack.id, pack.serialNumber || '', pack.name)
    } catch (err) {
      console.error('Failed to import row', row, err)
    }
  }

  console.log('Import complete')
}

main()
  .catch((e) => {
    console.error(e)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
