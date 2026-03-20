import fs from 'fs'
import path from 'path'
import { SourceMapConsumer } from 'source-map'

async function main(){
  const args = process.argv.slice(2)
  if(args.length < 3){
    console.error('Usage: node map-sourcemap.mjs <sourcemap.json> <genLine> <genCol>')
    process.exit(2)
  }
  const [mapPath, lineStr, colStr] = args
  const genLine = parseInt(lineStr,10)
  const genCol = parseInt(colStr,10)

  const abs = path.resolve(process.cwd(), mapPath)
  if(!fs.existsSync(abs)){
    console.error('Sourcemap not found:', abs)
    process.exit(3)
  }
  const raw = fs.readFileSync(abs, 'utf8')
  let map
  try{ map = JSON.parse(raw) }catch(e){ console.error('Invalid JSON in sourcemap'); process.exit(4) }

  if(typeof SourceMapConsumer.with === 'function'){
    await SourceMapConsumer.with(map, null, consumer => {
      const orig = consumer.originalPositionFor({ line: genLine, column: genCol })
      console.log(JSON.stringify(orig, null, 2))
    })
  }else{
    const consumer = await new SourceMapConsumer(map)
    const orig = consumer.originalPositionFor({ line: genLine, column: genCol })
    console.log(JSON.stringify(orig, null, 2))
    consumer.destroy && consumer.destroy()
  }
}

main().catch(err=>{ console.error(err); process.exit(1) })
