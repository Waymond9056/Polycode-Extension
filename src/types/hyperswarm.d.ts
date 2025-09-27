declare module 'hyperswarm' {
  import { EventEmitter } from 'events';
  
  interface Connection extends EventEmitter {
    write(data: string | Buffer): void;
    end(): void;
  }
  
  interface Discovery {
    flushed(): Promise<void>;
  }
  
  interface Peer {
    write(data: string | Buffer): void;
  }
  
  export default class Hyperswarm extends EventEmitter {
    peerId?: Buffer;
    peers: Peer[];
    
    join(topic: Buffer, options?: { server?: boolean; client?: boolean }): Discovery;
    destroy(): Promise<void>;
    flush(): Promise<void>;
    
    on(event: 'connection', listener: (conn: Connection, info: any) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
  }
}

