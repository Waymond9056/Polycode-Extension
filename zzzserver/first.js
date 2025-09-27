const Hyperswarm = require('hyperswarm')

async function main() {
  const swarm1 = new Hyperswarm()

  swarm1.on('connection', (conn, info) => {
    // swarm1 will receive server connections
    conn.write('I LOVE YOU')
    conn.end()
  })

  const topic = Buffer.alloc(32).fill('polycode') // A topic must be 32 bytes
  const discovery = swarm1.join(topic, { server: true, client: false })
  await discovery.flushed() // Waits for the topic to be fully announced on the DHT

  console.log('Server is running and waiting for connections...')
}

main().catch(console.error)