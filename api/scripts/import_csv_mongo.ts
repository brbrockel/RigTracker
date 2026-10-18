import * as path from 'path';
import * as fs from 'fs';
import mongoose from 'mongoose';

async function main() {
  const fileArg =
    process.argv[2] || path.join(__dirname, '../../UConn Skydiving Gear.xlsx - Sheet2.csv');
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/rigtracker';

  console.log('Connecting to', mongoUri.replace(/\/\/[^@/]*@/, '//***@'));
  await mongoose.connect(mongoUri);

  console.log('Reading', fileArg);
  const rows: any[][] = parseCsv(fs.readFileSync(fileArg, 'utf8'));

  // Rows: first column = field names. First row has Primary User header and user names starting at col 4
  if (!rows || rows.length === 0) {
    console.error('No rows found');
    process.exit(1);
  }

  // Build array of column-based rigs
  const headerRow = rows[0];
  const userColumnsStart = 4; // based on the CSV layout
  const rigCols = [];
  for (let c = userColumnsStart; c < headerRow.length; c++) {
    rigCols.push(c);
  }

  // dynamic require of models since Nest is not bootstrapped here: use plain collection inserts
  const rigsCollection = mongoose.connection.db.collection('rigs');
  const peopleCollection = mongoose.connection.db.collection('people');

  // create people entries for header names
  const peopleMap: Record<number, any> = {};
  for (const c of rigCols) {
    const name = headerRow[c];
    if (!name || name.toString().trim() === '') continue;
    const parts = name.toString().split(' ');
    const doc = { firstName: parts[0] || name, lastName: parts.slice(1).join(' ') || '' };
    const res = await peopleCollection.insertOne(doc);
    peopleMap[c] = res.insertedId;
  }

  // For each rig column, build a document

  for (const c of rigCols) {
    const firstCell = rows[0][c];
    if (!firstCell || firstCell.toString().trim() === '') continue;
    const rig: any = {};
    for (let r = 0; r < rows.length; r++) {
      const key = (rows[r][0] || '').toString().trim();
      const val = rows[r][c];
      if (!key) continue;
      const k = key.toLowerCase().replace(/\s+/g, '');
      switch (k) {
        case 'container':
          rig.container = val;
          break;
        case 'containerserialnumber':
          rig.containerSerialNumber = val;
          break;
        case 'containerdom':
          rig.containerDOM = parseDate(val);
          break;
        case 'mainsize':
          rig.mainSize = val;
          break;
        case 'maindom':
          rig.mainDOM = parseDate(val);
          break;
        case 'mainserialnumber':
          rig.mainSerialNumber = val;
          break;
        case 'reservesize':
          rig.reserveSize = val;
          break;
        case 'reservedom':
          rig.reserveDOM = parseDate(val);
          break;
        case 'reservserialnumber':
          rig.reserveSerialNumber = val;
          break;
        case 'lastpacked':
          rig.lastPacked = parseDate(val);
          break;
        case 'riggerint':
          rig.riggerINT = val;
          break;
        case 'repackdue':
          rig.repackDue = parseDate(val);
          break;
        case 'aadtype':
          rig.aadType = val;
          break;
        case 'aaddom':
          rig.aadDOM = parseDate(val);
          break;
        case 'aadserialnumber':
          rig.aadSerialNumber = val;
          break;
        case 'pastnaming':
          rig.pastNaming = val;
          break;
        case 'number':
          rig.number = val;
          break;
        default:
          // treat as custom field
          if (!rig.customFields) rig.customFields = {};
          rig.customFields[key] = val;
      }
    }
    // attach primaryUserId if available
    if (peopleMap[c]) rig.primaryUserId = peopleMap[c];
    await rigsCollection.insertOne(rig);
  }

  console.log('Import complete');
  process.exit(0);
}

function parseDate(input: any) {
  if (!input) return undefined;
  try {
    const s = input.toString();
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  } catch {
    return undefined;
  }
  return undefined;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/** Minimal RFC 4180 CSV parser: quoted fields, doubled quotes, CRLF or LF line endings. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
