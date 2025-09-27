const Hyperswarm = require('hyperswarm')

async function main() {
    const swarm2 = new Hyperswarm()

    swarm2.on('connection', (conn, info) => {
        conn.on('data', data => console.log('client got message:', data.toString()))
    })

    const topic = Buffer.alloc(32).fill('polycode') // A topic must be 32 bytes
    swarm2.join(topic, { server: true, client: true })
    await swarm2.flush() // Waits for the swarm to connect to pending peers.
    
    console.log('Client started and connecting to peers...')
}

main().catch(console.error)