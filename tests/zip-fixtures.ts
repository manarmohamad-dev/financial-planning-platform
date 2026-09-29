// Low-level intentionally hostile ZIP construction: never executed by application code.
import {crc32,deflateRawSync} from 'node:zlib';
export function zip(parts:[string,string|Buffer][],compressed=false,encrypted=false){
 const locals:Buffer[]=[],central:Buffer[]=[];let offset=0;
 for(const [name,value]of parts){const path=Buffer.from(name),data=Buffer.isBuffer(value)?value:Buffer.from(value),packed=encrypted?Buffer.concat([Buffer.alloc(12),data]):compressed?deflateRawSync(data):data,crc=crc32(data),l=Buffer.alloc(30),c=Buffer.alloc(46);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(encrypted?1:0,6);l.writeUInt16LE(compressed?8:0,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(packed.length,18);l.writeUInt32LE(data.length,22);l.writeUInt16LE(path.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(encrypted?1:0,8);c.writeUInt16LE(compressed?8:0,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(path.length,28);c.writeUInt32LE(offset,42);locals.push(l,path,packed);central.push(c,path);offset+=l.length+path.length+packed.length;}
 const end=Buffer.alloc(22),dir=Buffer.concat(central);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(parts.length,8);end.writeUInt16LE(parts.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,dir,end]);
}

